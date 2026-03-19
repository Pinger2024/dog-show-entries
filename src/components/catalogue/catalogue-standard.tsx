import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CoverPage, JudgesListPage, ClassDefinitionsPage, TrophiesPage } from './catalogue-front-matter';
import type { ClassSponsorshipInfo } from './catalogue-front-matter';
import { formatDobKC, formatPedigreeKC, formatOwnerKC, uppercaseName } from './catalogue-utils';

export interface CatalogueEntry {
  catalogueNumber: string | null;
  dogName: string | null;
  breed: string | undefined;
  breedId?: string | undefined;
  group: string | undefined;
  groupSortOrder: number | undefined;
  sex: string | undefined;
  dateOfBirth: string | null | undefined;
  kcRegNumber: string | null | undefined;
  colour: string | null | undefined;
  sire: string | null | undefined;
  dam: string | null | undefined;
  breeder: string | null | undefined;
  owners: { name: string; address: string | null; userId: string | null }[];
  exhibitorId: string | undefined;
  handler: string | undefined;
  exhibitor: string | undefined;
  classes: { name: string | undefined; sex: string | null | undefined; classNumber: number | null | undefined; sortOrder: number | undefined; showClassId?: string | undefined }[];
  status: string;
  entryType: string;
}

export interface ShowSponsorInfo {
  name: string;
  tier: string;
  logoUrl: string | null;
  website: string | null;
  customTitle: string | null;
}

/** A show class for rendering empty classes in the catalogue */
export interface ShowClassInfo {
  className: string;
  classNumber: number | null;
  sortOrder: number;
  sex: string | null;
}

export interface CatalogueShowInfo {
  name: string;
  showType: string | undefined;
  date: string;
  endDate?: string;
  venue: string | undefined;
  venueAddress: string | undefined;
  organisation: string | undefined;
  kcLicenceNo: string | null | undefined;
  startTime?: string | null;
  logoUrl?: string;
  secretaryName?: string;
  secretaryEmail?: string;
  secretaryPhone?: string;
  onCallVet?: string;
  wetWeatherAccommodation?: boolean;
  judgedOnGroupSystem?: boolean;
  judgesByBreedName?: Record<string, string>;
  /** Judge name -> bio text */
  judgeBios?: Record<string, string>;
  /** Breed name -> ring number */
  judgeRingNumbers?: Record<string, string>;
  classDefinitions?: { name: string; description: string | null }[];
  showScope?: string;
  /** Class sponsorship data for trophies page + inline display */
  classSponsorships?: ClassSponsorshipInfo[];
  /** Custom statements for cover page (e.g. "OUTSIDE ATTRACTION - KC RULE F(1) 16h") */
  customStatements?: string[];
  /** Show-level sponsors for the cover/front matter */
  showSponsors?: ShowSponsorInfo[];
  /** All show classes (for rendering empty classes) */
  allShowClasses?: ShowClassInfo[];
}

interface Props {
  show: CatalogueShowInfo;
  entries: CatalogueEntry[];
}

// ── RKC layout grouping ──────────────────────────────────────

interface ClassBucket {
  className: string;
  classNumber: number | null | undefined;
  sortOrder: number | undefined;
  sex: string | null | undefined;
  entries: CatalogueEntry[];
}

interface BreedBucket {
  sexes: Record<string, ClassBucket[]>;
}

interface GroupBucket {
  sortOrder: number;
  breeds: Map<string, BreedBucket>;
}

/**
 * Group entries RKC-style: Group > Breed > Sex > Class.
 * Each entry appears under every class it's entered in.
 */
function groupEntriesKC(entries: CatalogueEntry[]) {
  const groups = new Map<string, GroupBucket>();

  for (const entry of entries) {
    const group = entry.group ?? 'Unclassified';
    const breed = entry.breed ?? 'Unknown Breed';

    if (!groups.has(group)) {
      groups.set(group, { sortOrder: entry.groupSortOrder ?? 999, breeds: new Map() });
    }
    const breedMap = groups.get(group)!.breeds;
    if (!breedMap.has(breed)) {
      breedMap.set(breed, { sexes: {} });
    }
    const breedBucket = breedMap.get(breed)!;

    // Place entry into each class it's entered in.
    // Use the CLASS sex (not the dog's sex) for grouping so that
    // sex-neutral classes (e.g. Junior Handling, sex: null) get their
    // own section between Dogs and Bitches.
    for (const cls of entry.classes) {
      const className = cls.name ?? 'Unknown Class';
      const classKey = `${cls.classNumber ?? ''}-${className}`;
      const classSex = cls.sex === 'dog' ? 'dog' : cls.sex === 'bitch' ? 'bitch' : 'unknown';

      breedBucket.sexes[classSex] ??= [];
      let classBucket = breedBucket.sexes[classSex].find(
        (cb) => `${cb.classNumber ?? ''}-${cb.className}` === classKey
      );
      if (!classBucket) {
        classBucket = {
          className,
          classNumber: cls.classNumber,
          sortOrder: cls.sortOrder,
          sex: cls.sex,
          entries: [],
        };
        breedBucket.sexes[classSex].push(classBucket);
      }
      classBucket.entries.push(entry);
    }
  }

  // Sort class buckets within each sex
  for (const [, groupBucket] of groups) {
    for (const [, breedBucket] of groupBucket.breeds) {
      for (const sex of Object.keys(breedBucket.sexes)) {
        breedBucket.sexes[sex].sort((a, b) => {
          if (a.classNumber != null && b.classNumber != null) return a.classNumber - b.classNumber;
          if (a.classNumber != null) return -1;
          if (b.classNumber != null) return 1;
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        });
      }
    }
  }

  return groups;
}

/** Sort entries within a class by catalogue number */
function sortByCatNo(entries: CatalogueEntry[]) {
  return [...entries].sort((a, b) =>
    (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true })
  );
}

/** Build a label for a class heading: "Class 1. Minor Puppy Dog (4 entries)" */
function classHeadingLabel(bucket: ClassBucket, sex: string) {
  const parts: string[] = [];
  if (bucket.classNumber != null) {
    parts.push(`Class ${bucket.classNumber}.`);
  }
  parts.push(bucket.className);
  // Append sex qualifier
  if (sex === 'dog') parts.push('Dog');
  else if (sex === 'bitch') parts.push('Bitch');
  const count = bucket.entries.length;
  parts.push(`(${count} ${count === 1 ? 'entry' : 'entries'})`);
  return parts.join(' ');
}

export function CatalogueStandard({ show, entries }: Props) {
  const grouped = groupEntriesKC(entries);

  // Inject empty class buckets for show classes that have no entries
  if (show.allShowClasses && show.allShowClasses.length > 0) {
    // Build a set of classNumbers already represented in the grouped data
    const existingClassNumbers = new Set<number>();
    for (const [, groupBucket] of grouped) {
      for (const [, breedBucket] of groupBucket.breeds) {
        for (const sex of Object.keys(breedBucket.sexes)) {
          for (const bucket of breedBucket.sexes[sex]) {
            if (bucket.classNumber != null) existingClassNumbers.add(bucket.classNumber);
          }
        }
      }
    }

    // Find classes not represented and inject them as empty buckets
    for (const sc of show.allShowClasses) {
      if (sc.classNumber != null && !existingClassNumbers.has(sc.classNumber)) {
        const sex = sc.sex ?? 'unknown';

        // For single-breed shows, pick the first (only) breed bucket
        // For multi-breed shows, we need a breed — use the first breed in the first group
        let targetBreedBucket: BreedBucket | undefined;
        let targetGroupName: string | undefined;

        if (grouped.size > 0) {
          const firstGroup = [...grouped.entries()][0];
          targetGroupName = firstGroup[0];
          const firstBreed = [...firstGroup[1].breeds.entries()][0];
          if (firstBreed) {
            targetBreedBucket = firstBreed[1];
          }
        }

        if (!targetBreedBucket) {
          // No entries at all — create a placeholder group/breed
          const placeholderGroup = 'Show Classes';
          if (!grouped.has(placeholderGroup)) {
            grouped.set(placeholderGroup, { sortOrder: 0, breeds: new Map() });
          }
          const gb = grouped.get(placeholderGroup)!;
          const placeholderBreed = 'Classes';
          if (!gb.breeds.has(placeholderBreed)) {
            gb.breeds.set(placeholderBreed, { sexes: {} });
          }
          targetBreedBucket = gb.breeds.get(placeholderBreed)!;
        }

        targetBreedBucket.sexes[sex] ??= [];
        targetBreedBucket.sexes[sex].push({
          className: sc.className,
          classNumber: sc.classNumber,
          sortOrder: sc.sortOrder,
          sex,
          entries: [],
        });
      }
    }

    // Re-sort class buckets within each sex after injection
    for (const [, groupBucket] of grouped) {
      for (const [, breedBucket] of groupBucket.breeds) {
        for (const sex of Object.keys(breedBucket.sexes)) {
          breedBucket.sexes[sex].sort((a, b) => {
            if (a.classNumber != null && b.classNumber != null) return a.classNumber - b.classNumber;
            if (a.classNumber != null) return -1;
            if (b.classNumber != null) return 1;
            return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          });
        }
      }
    }
  }

  // Build a lookup: classNumber -> sponsorship info for inline display
  const sponsorByClassNumber = new Map<number, ClassSponsorshipInfo>();
  for (const sp of show.classSponsorships ?? []) {
    if (sp.classNumber != null) {
      sponsorByClassNumber.set(sp.classNumber, sp);
    }
  }

  // Sort groups by sortOrder
  const sortedGroups = [...grouped.entries()].sort(([, a], [, b]) => a.sortOrder - b.sortOrder);

  // Flatten all breeds into a list of page-sized chunks to avoid @react-pdf/renderer
  // coordinate overflow bug (single <Page wrap> with many nodes causes layout.top to
  // exceed pdfkit's number limits). Each breed gets its own <Page>.
  const breedPages: {
    groupName: string;
    breedName: string;
    judge: string | undefined;
    breedBucket: BreedBucket;
  }[] = [];

  for (const [groupName, { breeds }] of sortedGroups) {
    for (const [breedName, breedBucket] of [...breeds.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      breedPages.push({
        groupName,
        breedName,
        judge: show.judgesByBreedName?.[breedName],
        breedBucket,
      });
    }
  }

  // Sort entries within each bucket once, and pre-compute first-appearance data
  // in a single pass (same iteration order as render) to avoid:
  // - calling sortByCatNo 3x per bucket
  // - mutating state during JSX render
  const firstSeenClass = new Map<string, string>();
  const firstAppearanceBucket = new Map<string, ClassBucket>();
  for (const { breedBucket } of breedPages) {
    for (const sex of ['dog', 'unknown', 'bitch']) {
      const classBuckets = breedBucket.sexes[sex];
      if (!classBuckets?.length) continue;
      for (const bucket of classBuckets) {
        bucket.entries = sortByCatNo(bucket.entries);
        for (const entry of bucket.entries) {
          const catNo = entry.catalogueNumber;
          if (!catNo) continue;
          if (!firstSeenClass.has(catNo)) {
            firstSeenClass.set(catNo, bucket.classNumber != null ? `class ${bucket.classNumber}` : bucket.className);
            firstAppearanceBucket.set(catNo, bucket);
          }
        }
      }
    }
  }

  return (
    <Document>
      {/* Front matter pages */}
      <CoverPage show={show} />
      <JudgesListPage show={show} />
      <ClassDefinitionsPage show={show} />
      <TrophiesPage show={show} sponsorships={show.classSponsorships ?? []} />

      {/* One <Page> per breed — resets coordinate system to avoid renderer overflow */}
      {breedPages.map(({ groupName, breedName, judge, breedBucket }) => (
        <Page key={`${groupName}-${breedName}`} size="A5" style={styles.page} wrap>
          <Text style={styles.groupHeading}>{groupName}</Text>
          <Text style={styles.breedHeading}>{breedName}</Text>
          {judge && (
            <Text style={styles.judgeLabel}>Judge: {judge}</Text>
          )}

          {['dog', 'unknown', 'bitch']
            .filter((sex) => breedBucket.sexes[sex]?.length)
            .map((sex) => (
              <View key={sex}>
                {sex !== 'unknown' && (
                  <Text style={styles.sexHeading} minPresenceAhead={60}>
                    {sex === 'dog' ? 'Dogs' : 'Bitches'}
                  </Text>
                )}

                {breedBucket.sexes[sex].map((bucket) => {
                  // Look up sponsorship for this class
                  const sp = bucket.classNumber != null
                    ? sponsorByClassNumber.get(bucket.classNumber)
                    : undefined;
                  const sponsorParts: string[] = [];
                  if (sp?.trophyName) {
                    let part = `Trophy: ${sp.trophyName}`;
                    if (sp.sponsorName) {
                      part += ` — sponsored by ${sp.sponsorName}`;
                      if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
                    }
                    sponsorParts.push(part);
                  } else if (sp?.sponsorName) {
                    let part = `Sponsored by ${sp.sponsorName}`;
                    if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
                    sponsorParts.push(part);
                  }

                  return (
                  <View key={`${bucket.classNumber}-${bucket.className}`}>
                    <Text style={styles.classHeadingInBreed} minPresenceAhead={50}>
                      {classHeadingLabel(bucket, sex)}
                    </Text>
                    {sponsorParts.map((line, i) => (
                      <Text key={i} style={styles.sponsorLine}>{line}</Text>
                    ))}

                    {bucket.entries.map((entry) => {
                      const catNo = entry.catalogueNumber ?? '';
                      const isFirstAppearance = !catNo || firstAppearanceBucket.get(catNo) === bucket;
                      const isJH = entry.entryType === 'junior_handler';
                      // For JH entries, show handler/exhibitor name instead of dog name
                      const displayName = isJH
                        ? (entry.handler ?? entry.exhibitor ?? 'Unnamed Handler')
                        : (entry.dogName ?? 'Unnamed');

                      if (!isFirstAppearance) {
                        // Abbreviated entry — [see class X]
                        const firstClass = firstSeenClass.get(catNo) ?? '';
                        return (
                          <View
                            key={`${catNo}-abbrev`}
                            style={{ ...styles.entryRowWrap, paddingLeft: 6 }}
                            wrap={false}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                              <Text style={styles.catalogueNumber}>
                                {catNo || '—'}
                              </Text>
                              <Text style={styles.dogName}>
                                {displayName}
                              </Text>
                              <Text style={styles.seeClassRef}>
                                {'  '}[see {firstClass}]
                              </Text>
                            </View>
                          </View>
                        );
                      }

                      // Full entry — first appearance
                      if (isJH) {
                        // Junior Handling: handler-centric display
                        return (
                          <View
                            key={catNo || displayName}
                            style={styles.entryRowWrap}
                            wrap={false}
                          >
                            {/* Catalogue number + handler name */}
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                              <Text style={styles.catalogueNumber}>
                                {catNo || '—'}
                              </Text>
                              <Text style={styles.dogName}>
                                {displayName}
                              </Text>
                            </View>
                            {/* Dog being handled */}
                            {entry.dogName && (
                              <Text style={styles.entryDetail}>
                                <Text style={styles.entryDetailLabel}>Dog: </Text>
                                {entry.dogName}
                              </Text>
                            )}
                            {/* Owner(s) */}
                            {entry.owners.length > 0 && (
                              <Text style={styles.entryDetail}>
                                <Text style={styles.entryDetailLabel}>
                                  Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                                </Text>
                                {formatOwnerKC(entry.owners, entry.exhibitorId)}
                              </Text>
                            )}
                          </View>
                        );
                      }

                      const pedigree = formatPedigreeKC(entry.sire, entry.dam);
                      return (
                        <View
                          key={catNo || entry.dogName}
                          style={styles.entryRowWrap}
                          wrap={false}
                        >
                          {/* Catalogue number + dog name */}
                          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                            <Text style={styles.catalogueNumber}>
                              {catNo || '—'}
                            </Text>
                            <Text style={styles.dogName}>
                              {displayName}
                            </Text>
                          </View>

                          {/* RKC reg + DOB + colour */}
                          <Text style={styles.entryDetail}>
                            {[
                              entry.kcRegNumber,
                              entry.dateOfBirth ? `D.O.B: ${formatDobKC(entry.dateOfBirth)}` : null,
                              entry.colour,
                              entry.sex === 'dog' ? 'Dog' : entry.sex === 'bitch' ? 'Bitch' : null,
                            ].filter(Boolean).join('  —  ')}
                          </Text>

                          {/* Pedigree: By [sire] ex [dam] */}
                          {pedigree && (
                            <Text style={styles.entryDetail}>
                              {pedigree}
                            </Text>
                          )}

                          {/* Breeder */}
                          {entry.breeder && (
                            <Text style={styles.entryDetail}>
                              <Text style={styles.entryDetailLabel}>Breeder: </Text>
                              {entry.breeder}
                            </Text>
                          )}

                          {/* Owner(s) — UPPER CASE + address (or "Exh." if owner is exhibiting) */}
                          {entry.owners.length > 0 && (
                            <Text style={styles.entryDetail}>
                              <Text style={styles.entryDetailLabel}>
                                Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                              </Text>
                              {formatOwnerKC(entry.owners, entry.exhibitorId)}
                            </Text>
                          )}

                          {/* Handler (if different from exhibitor) */}
                          {entry.handler && entry.handler !== entry.exhibitor && (
                            <Text style={styles.entryDetail}>
                              <Text style={styles.entryDetailLabel}>Handler: </Text>
                              {entry.handler}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  );
                })}
              </View>
            ))}

          <Text
            style={styles.footer}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`
            }
            fixed
          />
        </Page>
      ))}
    </Document>
  );
}
