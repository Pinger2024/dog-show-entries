import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CoverPage, JudgesListPage, ClassDefinitionsPage } from './catalogue-front-matter';
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
  owners: { name: string; address: string | null }[];
  handler: string | undefined;
  exhibitor: string | undefined;
  classes: { name: string | undefined; sex: string | null | undefined; classNumber: number | null | undefined; sortOrder: number | undefined }[];
  status: string;
  entryType: string;
}

export interface CatalogueShowInfo {
  name: string;
  showType: string | undefined;
  date: string;
  venue: string | undefined;
  venueAddress: string | undefined;
  organisation: string | undefined;
  kcLicenceNo: string | null | undefined;
  logoUrl?: string;
  secretaryEmail?: string;
  judgesByBreedName?: Record<string, string>;
  classDefinitions?: { name: string; description: string | null }[];
  showScope?: string;
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
    const sex = entry.sex ?? 'unknown';

    if (!groups.has(group)) {
      groups.set(group, { sortOrder: entry.groupSortOrder ?? 999, breeds: new Map() });
    }
    const breedMap = groups.get(group)!.breeds;
    if (!breedMap.has(breed)) {
      breedMap.set(breed, { sexes: {} });
    }
    const breedBucket = breedMap.get(breed)!;
    breedBucket.sexes[sex] ??= [];

    // Place entry into each class it's entered in
    for (const cls of entry.classes) {
      const className = cls.name ?? 'Unknown Class';
      const classKey = `${cls.classNumber ?? ''}-${className}`;

      let classBucket = breedBucket.sexes[sex].find(
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
        breedBucket.sexes[sex].push(classBucket);
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

  // Track first appearance of each catalogue number → class label for "[see class X]"
  const firstSeenClass = new Map<string, string>();

  // Sort groups by sortOrder
  const sortedGroups = [...grouped.entries()].sort(([, a], [, b]) => a.sortOrder - b.sortOrder);

  // Pre-compute first seen class for each entry
  for (const [, { breeds }] of sortedGroups) {
    for (const [, breedBucket] of [...breeds.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      for (const sex of ['dog', 'bitch', 'unknown']) {
        const classBuckets = breedBucket.sexes[sex];
        if (!classBuckets) continue;
        for (const bucket of classBuckets) {
          for (const entry of sortByCatNo(bucket.entries)) {
            const catNo = entry.catalogueNumber;
            if (catNo && !firstSeenClass.has(catNo)) {
              const label = bucket.classNumber != null
                ? `class ${bucket.classNumber}`
                : bucket.className;
              firstSeenClass.set(catNo, label);
            }
          }
        }
      }
    }
  }

  // Track "already rendered full" per catalogue number across all pages
  const renderedFull = new Set<string>();

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

  return (
    <Document>
      {/* Front matter pages */}
      <CoverPage show={show} />
      <JudgesListPage show={show} />
      <ClassDefinitionsPage show={show} />

      {/* One <Page> per breed — resets coordinate system to avoid renderer overflow */}
      {breedPages.map(({ groupName, breedName, judge, breedBucket }) => (
        <Page key={`${groupName}-${breedName}`} size="A5" style={styles.page} wrap>
          <Text style={styles.groupHeading}>{groupName}</Text>
          <Text style={styles.breedHeading}>{breedName}</Text>
          {judge && (
            <Text style={styles.judgeLabel}>Judge: {judge}</Text>
          )}

          {['dog', 'bitch', 'unknown']
            .filter((sex) => breedBucket.sexes[sex]?.length)
            .map((sex) => (
              <View key={sex}>
                {sex !== 'unknown' && (
                  <Text style={styles.sexHeading} minPresenceAhead={60}>
                    {sex === 'dog' ? 'Dogs' : 'Bitches'}
                  </Text>
                )}

                {breedBucket.sexes[sex].map((bucket) => (
                  <View key={`${bucket.classNumber}-${bucket.className}`}>
                    <Text style={styles.classHeadingInBreed} minPresenceAhead={50}>
                      {classHeadingLabel(bucket, sex)}
                    </Text>

                    {sortByCatNo(bucket.entries).map((entry) => {
                      const catNo = entry.catalogueNumber ?? '';
                      const isFirstAppearance = !renderedFull.has(catNo);

                      if (isFirstAppearance && catNo) {
                        renderedFull.add(catNo);
                      }

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
                                {entry.dogName ?? 'Unnamed'}
                              </Text>
                              <Text style={styles.seeClassRef}>
                                {'  '}[see {firstClass}]
                              </Text>
                            </View>
                          </View>
                        );
                      }

                      // Full entry — first appearance
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
                              {entry.dogName ?? 'Unnamed'}
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

                          {/* Owner(s) — UPPER CASE + address */}
                          {entry.owners.length > 0 && (
                            <Text style={styles.entryDetail}>
                              <Text style={styles.entryDetailLabel}>
                                Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                              </Text>
                              {formatOwnerKC(entry.owners)}
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
                ))}
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
