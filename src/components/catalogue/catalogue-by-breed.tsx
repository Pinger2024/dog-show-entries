import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CoverPage, JudgesListPage, ClassDefinitionsPage } from './catalogue-front-matter';
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
    const sex = entry.sex ?? 'unknown';
    const catNo = entry.catalogueNumber ?? '';

    if (!groups.has(group)) {
      groups.set(group, { sortOrder: entry.groupSortOrder ?? 999, breeds: new Map() });
    }
    const breedMap = groups.get(group)!.breeds;
    if (!breedMap.has(breed)) {
      breedMap.set(breed, { sexes: {} });
    }
    const breedBucket = breedMap.get(breed)!;
    if (!breedBucket.sexes[sex]) {
      breedBucket.sexes[sex] = { entries: [], classes: new Map() };
    }
    const sexGroup = breedBucket.sexes[sex];

    // Add entry to listing if not already present (dedup by catalogue number)
    if (!sexGroup.entries.some((e) => e.catalogueNumber === catNo)) {
      sexGroup.entries.push(entry);
    }

    // Map each class → catalogue numbers
    for (const cls of entry.classes) {
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
  const grouped = groupEntriesByBreed(entries);

  // Sort groups by sortOrder
  const sortedGroups = [...grouped.entries()].sort(([, a], [, b]) => a.sortOrder - b.sortOrder);

  return (
    <Document>
      {/* Front matter pages */}
      <CoverPage show={show} />
      <JudgesListPage show={show} />
      <ClassDefinitionsPage show={show} />

      {/* Main catalogue content */}
      <Page size="A5" style={styles.page} wrap>
        {sortedGroups.map(([groupName, { breeds }]) => (
          <View key={groupName}>
            <Text style={styles.groupHeading}>{groupName}</Text>

            {[...breeds.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([breedName, breedBucket]) => {
                const judge = show.judgesByBreedName?.[breedName];
                return (
                  <View key={breedName}>
                    <Text style={styles.breedHeading}>{breedName}</Text>
                    {judge && (
                      <Text style={styles.judgeLabel}>Judge: {judge}</Text>
                    )}

                    {['dog', 'bitch', 'unknown']
                      .filter((sex) => breedBucket.sexes[sex]?.entries.length)
                      .map((sex) => {
                        const sexGroup = breedBucket.sexes[sex];
                        return (
                          <View key={sex}>
                            {sex !== 'unknown' && (
                              <Text style={styles.sexHeading}>
                                {sex === 'dog' ? 'Dogs' : 'Bitches'}
                              </Text>
                            )}

                            {/* ── Full entry listings ── */}
                            {sexGroup.entries.map((entry) => {
                              const catNo = entry.catalogueNumber ?? '';
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

                            {/* ── Compact class summaries ── */}
                            <View style={{ marginTop: 4, marginBottom: 6 }}>
                              {sortedClassSummaries(sexGroup.classes).map((cls) => (
                                <Text
                                  key={`${cls.classNumber}-${cls.className}`}
                                  style={styles.classListSummary}
                                >
                                  {classLabel(cls, sex)}
                                </Text>
                              ))}
                            </View>
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
    </Document>
  );
}
