import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CoverPage, JudgesListPage, ClassDefinitionsPage, TrophiesPage } from './catalogue-front-matter';
import type { ClassSponsorshipInfo } from './catalogue-front-matter';
import { formatDobKC, formatPedigreeKC, formatOwnerKC, uppercaseName } from './catalogue-utils';
import type { CatalogueEntry, CatalogueShowInfo } from './catalogue-standard';

interface Props {
  show: CatalogueShowInfo;
  entries: CatalogueEntry[];
}

// ── Grouping types ───────────────────────────────────────────

interface BreedSexGroup {
  entries: CatalogueEntry[];
  classes: Map<string, {
    className: string;
    classNumber: number | null | undefined;
    sortOrder: number | undefined;
    catalogueNumbers: string[];
  }>;
}

interface BreedGroup {
  sexes: Record<string, BreedSexGroup>;
}

interface GroupBucket {
  sortOrder: number;
  breeds: Map<string, BreedGroup>;
}

/**
 * Group entries Crufts-style: Group → Breed → Sex.
 * Within each breed+sex, collect unique entries (for the listing) and
 * class→catalogueNumber mappings (for the summary).
 */
function groupEntriesByBreed(entries: CatalogueEntry[]) {
  const groups = new Map<string, GroupBucket>();

  for (const entry of entries) {
    const group = entry.group ?? 'Unclassified';
    const breed = entry.breed ?? 'Unknown Breed';
    const catNo = entry.catalogueNumber ?? '';

    if (!groups.has(group)) {
      groups.set(group, { sortOrder: entry.groupSortOrder ?? 999, breeds: new Map() });
    }
    const breedMap = groups.get(group)!.breeds;
    if (!breedMap.has(breed)) {
      breedMap.set(breed, { sexes: {} });
    }
    const breedBucket = breedMap.get(breed)!;

    // Group by CLASS sex (not dog's sex) so sex-neutral classes like
    // Junior Handling get their own section between Dogs and Bitches.
    for (const cls of entry.classes) {
      const classSex = cls.sex === 'dog' ? 'dog' : cls.sex === 'bitch' ? 'bitch' : 'unknown';
      if (!breedBucket.sexes[classSex]) {
        breedBucket.sexes[classSex] = { entries: [], classes: new Map() };
      }
      const sexGroup = breedBucket.sexes[classSex];

      // Add entry to listing if not already present (dedup by catalogue number)
      if (!sexGroup.entries.some((e) => e.catalogueNumber === catNo)) {
        sexGroup.entries.push(entry);
      }

      const className = cls.name ?? 'Unknown Class';
      const classKey = `${cls.classNumber ?? ''}-${className}`;
      if (!sexGroup.classes.has(classKey)) {
        sexGroup.classes.set(classKey, {
          className,
          classNumber: cls.classNumber,
          sortOrder: cls.sortOrder,
          catalogueNumbers: [],
        });
      }
      const classBucket = sexGroup.classes.get(classKey)!;
      if (catNo && !classBucket.catalogueNumbers.includes(catNo)) {
        classBucket.catalogueNumbers.push(catNo);
      }
    }
  }

  // Sort entries within each sex group by catalogue number
  for (const [, groupBucket] of groups) {
    for (const [, breedBucket] of groupBucket.breeds) {
      for (const sex of Object.keys(breedBucket.sexes)) {
        breedBucket.sexes[sex].entries.sort((a, b) =>
          (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true })
        );
        // Sort catalogue numbers within each class
        for (const [, cls] of breedBucket.sexes[sex].classes) {
          cls.catalogueNumbers.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        }
      }
    }
  }

  return groups;
}

/** Sort class summaries by classNumber then sortOrder */
function sortedClassSummaries(classes: BreedSexGroup['classes']) {
  return [...classes.values()].sort((a, b) => {
    if (a.classNumber != null && b.classNumber != null) return a.classNumber - b.classNumber;
    if (a.classNumber != null) return -1;
    if (b.classNumber != null) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

/** Build class summary line: "Minor Puppy Dog (2 entries): 1, 2" */
function classLabel(cls: { className: string; classNumber: number | null | undefined; catalogueNumbers: string[] }, sex: string) {
  const parts: string[] = [];
  if (cls.classNumber != null) parts.push(`Class ${cls.classNumber}.`);
  parts.push(cls.className);
  if (sex === 'dog') parts.push('Dog');
  else if (sex === 'bitch') parts.push('Bitch');
  const count = cls.catalogueNumbers.length;
  parts.push(`(${count} ${count === 1 ? 'entry' : 'entries'}):`);
  parts.push(cls.catalogueNumbers.join(', '));
  return parts.join(' ');
}

export function CatalogueByBreed({ show, entries }: Props) {
  // Build a lookup: classNumber -> sponsorship info for inline display
  const sponsorByClassNumber = new Map<number, ClassSponsorshipInfo>();
  for (const sp of show.classSponsorships ?? []) {
    if (sp.classNumber != null) {
      sponsorByClassNumber.set(sp.classNumber, sp);
    }
  }

  const grouped = groupEntriesByBreed(entries);

  // Inject empty classes from allShowClasses that have no entries
  if (show.allShowClasses && show.allShowClasses.length > 0) {
    // Collect existing class numbers across all breed/sex groups
    const existingClassNumbers = new Set<number>();
    for (const [, groupBucket] of grouped) {
      for (const [, breedBucket] of groupBucket.breeds) {
        for (const sex of Object.keys(breedBucket.sexes)) {
          for (const [, cls] of breedBucket.sexes[sex].classes) {
            if (cls.classNumber != null) existingClassNumbers.add(cls.classNumber);
          }
        }
      }
    }

    // Add missing classes as empty entries in the first breed's sex group
    for (const sc of show.allShowClasses) {
      if (sc.classNumber != null && !existingClassNumbers.has(sc.classNumber)) {
        const sex = sc.sex ?? 'unknown';

        // Find the first breed bucket to inject into
        let targetSexGroup: BreedSexGroup | undefined;
        for (const [, groupBucket] of grouped) {
          for (const [, breedBucket] of groupBucket.breeds) {
            if (!breedBucket.sexes[sex]) {
              breedBucket.sexes[sex] = { entries: [], classes: new Map() };
            }
            targetSexGroup = breedBucket.sexes[sex];
            break;
          }
          if (targetSexGroup) break;
        }

        if (targetSexGroup) {
          const classKey = `${sc.classNumber}-${sc.className}`;
          if (!targetSexGroup.classes.has(classKey)) {
            targetSexGroup.classes.set(classKey, {
              className: sc.className,
              classNumber: sc.classNumber,
              sortOrder: sc.sortOrder,
              catalogueNumbers: [],
            });
          }
        }
      }
    }
  }

  // Sort groups by sortOrder
  const sortedGroups = [...grouped.entries()].sort(([, a], [, b]) => a.sortOrder - b.sortOrder);

  // Flatten breeds into a list for one-page-per-breed rendering
  // (avoids @react-pdf coordinate overflow on large shows)
  const breedPages: {
    groupName: string;
    breedName: string;
    judge: string | undefined;
    breedBucket: BreedGroup;
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
      {!show.skipTrophiesPage && (
        <TrophiesPage show={show} sponsorships={show.classSponsorships ?? []} />
      )}

      {/* One <Page> per breed — resets coordinate system */}
      {breedPages.map(({ groupName, breedName, judge, breedBucket }) => (
        <Page key={`${groupName}-${breedName}`} size="A5" style={styles.page} wrap>
          <Text style={styles.groupHeading}>{groupName}</Text>
          <Text style={styles.breedHeading}>{breedName}</Text>
          {judge && (
            <Text style={styles.judgeLabel}>Judge: {judge}</Text>
          )}

          {['dog', 'unknown', 'bitch']
            .filter((sex) => breedBucket.sexes[sex]?.entries.length)
            .map((sex) => {
              const sexGroup = breedBucket.sexes[sex];
              return (
                <View key={sex}>
                  {sex !== 'unknown' && (
                    <Text style={styles.sexHeading} minPresenceAhead={60}>
                      {sex === 'dog' ? 'Dogs' : 'Bitches'}
                    </Text>
                  )}

                  {/* ── Full entry listings ── */}
                  {sexGroup.entries.map((entry) => {
                    const catNo = entry.catalogueNumber ?? '';
                    const isJH = entry.entryType === 'junior_handler';

                    if (isJH) {
                      // Junior Handling: handler-centric display
                      const handlerName = entry.handler ?? entry.exhibitor ?? 'Unnamed Handler';
                      return (
                        <View
                          key={catNo || handlerName}
                          style={styles.entryRowWrap}
                          wrap={false}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                            <Text style={styles.catalogueNumber}>
                              {catNo || '—'}
                            </Text>
                            <Text style={styles.dogName}>
                              {handlerName}
                            </Text>
                          </View>
                          {entry.dogName && (
                            <Text style={styles.entryDetail}>
                              <Text style={styles.entryDetailLabel}>Dog: </Text>
                              {entry.dogName}
                            </Text>
                          )}
                          {entry.owners.length > 0 && (
                            <Text style={styles.entryDetail}>
                              <Text style={styles.entryDetailLabel}>
                                Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                              </Text>
                              {formatOwnerKC(entry.owners, entry.exhibitorId, entry.withholdFromPublication)}
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
                            {entry.dogName ?? 'Unnamed'}
                          </Text>
                        </View>

                        {/* RKC reg + DOB + colour + sex */}
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
                            {formatOwnerKC(entry.owners, entry.exhibitorId, entry.withholdFromPublication)}
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

                  {/* ── Compact class summaries ── */}
                  <View style={{ marginTop: 4, marginBottom: 6 }}>
                    {sortedClassSummaries(sexGroup.classes).map((cls) => {
                      // Look up sponsorship for this class
                      const sp = cls.classNumber != null
                        ? sponsorByClassNumber.get(cls.classNumber)
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
                        <View key={`${cls.classNumber}-${cls.className}`}>
                          <Text style={styles.classListSummary}>
                            {classLabel(cls, sex)}
                          </Text>
                          {sponsorParts.map((line, i) => (
                            <Text key={i} style={{ ...styles.sponsorLine, fontSize: 7, marginBottom: 1 }}>
                              {line}
                            </Text>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}

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
