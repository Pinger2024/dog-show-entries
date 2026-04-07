import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CoverPage, JudgesListPage, ClassDefinitionsPage, TrophiesPage } from './catalogue-front-matter';
import { formatDobKC, formatPedigreeKC, formatOwnerKC, uppercaseName } from './catalogue-utils';
import type { CatalogueEntry, CatalogueShowInfo } from './catalogue-standard';

// ── Marked catalogue result data ─────────────────────────────

export interface MarkedResult {
  /** Catalogue number of the entry */
  catalogueNumber: string;
  /** Show class ID */
  showClassId: string;
  /** Placement: 1=1st, 2=2nd, 3=3rd, 4=Reserve, 5=VHC, 6=HC, 7=Commended */
  placement: number | null;
  /** Special award text (e.g. "Best of Breed") */
  specialAward: string | null;
}

export interface MarkedAchievement {
  type: string;
  dogName: string;
  breedName: string | null;
}

export interface MarkedCatalogueProps {
  show: CatalogueShowInfo;
  entries: CatalogueEntry[];
  /** Results keyed by `${catalogueNumber}-${showClassId}` */
  results: Map<string, MarkedResult>;
  /** Set of catalogue numbers marked absent */
  absentees: Set<string>;
  /** Show-level and breed-level achievements */
  achievements: MarkedAchievement[];
}

// ── Placement label helpers ──────────────────────────────────

const PLACEMENT_LABELS: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: 'Res',
  5: 'VHC',
  6: 'HC',
  7: 'C',
};

function getPlacementLabel(placement: number): string {
  return PLACEMENT_LABELS[placement] ?? `${placement}th`;
}

// ── Marked-specific styles ───────────────────────────────────

const markedStyles = StyleSheet.create({
  placementBadge: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#b91c1c',
    marginLeft: 4,
  },
  absentBadge: {
    fontSize: 7,
    fontWeight: 'bold',
    fontStyle: 'italic',
    color: '#6b7280',
    marginLeft: 4,
  },
  specialAwardBadge: {
    fontSize: 6.5,
    fontWeight: 'bold',
    color: '#92400e',
    paddingLeft: 22,
    marginBottom: 0.5,
  },
  achievementsSectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 0.8,
    marginBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    paddingBottom: 4,
  },
  achievementRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  achievementType: {
    fontSize: 7.5,
    fontWeight: 'bold',
    width: '40%',
  },
  achievementDog: {
    fontSize: 7.5,
    width: '35%',
  },
  achievementBreed: {
    fontSize: 7.5,
    color: '#444',
    width: '25%',
  },
  watermark: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#b91c1c',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

// ── Achievement type labels ──────────────────────────────────

const ACHIEVEMENT_LABELS: Record<string, string> = {
  best_in_show: 'Best in Show',
  reserve_best_in_show: 'Reserve Best in Show',
  best_puppy_in_show: 'Best Puppy in Show',
  best_long_coat_in_show: 'Best Long Coat in Show',
  best_of_breed: 'Best of Breed',
  best_puppy_in_breed: 'Best Puppy in Breed',
  best_veteran_in_breed: 'Best Veteran in Breed',
  dog_cc: 'Dog CC',
  reserve_dog_cc: 'Reserve Dog CC',
  bitch_cc: 'Bitch CC',
  reserve_bitch_cc: 'Reserve Bitch CC',
  best_puppy_dog: 'Best Puppy Dog',
  best_puppy_bitch: 'Best Puppy Bitch',
  best_long_coat_dog: 'Best Long Coat Dog',
  best_long_coat_bitch: 'Best Long Coat Bitch',
  cc: 'CC',
  reserve_cc: 'Reserve CC',
};

// ── RKC layout grouping (same as catalogue-standard) ─────────

interface ClassBucket {
  className: string;
  classNumber: number | null | undefined;
  sortOrder: number | undefined;
  sex: string | null | undefined;
  showClassId: string | undefined;
  entries: CatalogueEntry[];
}

interface BreedBucket {
  sexes: Record<string, ClassBucket[]>;
}

interface GroupBucket {
  sortOrder: number;
  breeds: Map<string, BreedBucket>;
}

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

    // Use CLASS sex (not dog's sex) for grouping so sex-neutral classes
    // (e.g. Junior Handling) get their own section between Dogs and Bitches.
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
          showClassId: (cls as { showClassId?: string }).showClassId,
          entries: [],
        };
        breedBucket.sexes[classSex].push(classBucket);
      }
      classBucket.entries.push(entry);
    }
  }

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

function sortByCatNo(entries: CatalogueEntry[]) {
  return [...entries].sort((a, b) =>
    (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true })
  );
}

function classHeadingLabel(bucket: ClassBucket, sex: string) {
  const parts: string[] = [];
  if (bucket.classNumber != null) {
    parts.push(`Class ${bucket.classNumber}.`);
  }
  parts.push(bucket.className);
  if (sex === 'dog') parts.push('Dog');
  else if (sex === 'bitch') parts.push('Bitch');
  const count = bucket.entries.length;
  parts.push(`(${count} ${count === 1 ? 'entry' : 'entries'})`);
  return parts.join(' ');
}

// ── Marked Catalogue Component ───────────────────────────────

export function CatalogueMarked({ show, entries, results, absentees, achievements }: MarkedCatalogueProps) {
  const grouped = groupEntriesKC(entries);
  const sortedGroups = [...grouped.entries()].sort(([, a], [, b]) => a.sortOrder - b.sortOrder);

  // Split large breeds by sex to avoid @react-pdf/renderer coordinate overflow
  // bug (single <Page wrap> with many nodes crashes pdfkit with values like
  // -9.979e+21). Single-breed shows with 100+ entries all on one page would crash.
  const PAGE_ENTRY_THRESHOLD = 40;
  const breedPages: {
    groupName: string;
    breedName: string;
    judge: string | undefined;
    breedBucket: BreedBucket;
    sexLabel?: string;
  }[] = [];

  function countBreedEntries(bucket: BreedBucket): number {
    let total = 0;
    for (const sex of ['dog', 'unknown', 'bitch']) {
      for (const classBucket of bucket.sexes[sex] ?? []) {
        total += classBucket.entries.length;
      }
    }
    return total;
  }

  for (const [groupName, { breeds }] of sortedGroups) {
    for (const [breedName, breedBucket] of [...breeds.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const totalEntries = countBreedEntries(breedBucket);
      const judge = show.judgesByBreedName?.[breedName];

      if (totalEntries > PAGE_ENTRY_THRESHOLD) {
        for (const sex of ['dog', 'unknown', 'bitch']) {
          const classBuckets = breedBucket.sexes[sex];
          if (!classBuckets?.length) continue;
          const hasAnyEntries = classBuckets.some((cb) => cb.entries.length > 0);
          if (!hasAnyEntries) continue;
          const sexBucket: BreedBucket = {
            ...breedBucket,
            sexes: { [sex]: classBuckets },
          };
          breedPages.push({
            groupName,
            breedName,
            judge,
            breedBucket: sexBucket,
            sexLabel: sex === 'dog' ? 'Dogs' : sex === 'bitch' ? 'Bitches' : undefined,
          });
        }
      } else {
        breedPages.push({ groupName, breedName, judge, breedBucket });
      }
    }
  }

  // Pre-compute first-appearance tracking
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

  // Separate show-level vs breed-level achievements
  const showLevelTypes = new Set([
    'best_in_show', 'reserve_best_in_show', 'best_puppy_in_show', 'best_long_coat_in_show',
  ]);
  const showAwards = achievements.filter((a) => showLevelTypes.has(a.type));
  const breedAwards = achievements.filter((a) => !showLevelTypes.has(a.type));

  return (
    <Document>
      {/* Cover page with MARKED CATALOGUE subtitle */}
      <CoverPage show={{ ...show, name: `${show.name}\nMARKED CATALOGUE` }} />
      <JudgesListPage show={show} />
      <ClassDefinitionsPage show={show} />
      {!show.skipTrophiesPage && (
        <TrophiesPage show={show} sponsorships={show.classSponsorships ?? []} />
      )}

      {/* Achievements summary page */}
      {achievements.length > 0 && (
        <Page size="A5" style={styles.frontMatterPage} wrap>
          <Text style={markedStyles.achievementsSectionTitle}>Awards Summary</Text>

          {showAwards.length > 0 && (
            <View>
              <Text style={{ ...styles.breedHeading, marginTop: 4 }}>Show Awards</Text>
              {showAwards.map((a, i) => (
                <View key={i} style={markedStyles.achievementRow}>
                  <Text style={markedStyles.achievementType}>
                    {ACHIEVEMENT_LABELS[a.type] ?? a.type}
                  </Text>
                  <Text style={markedStyles.achievementDog}>{a.dogName}</Text>
                  <Text style={markedStyles.achievementBreed}>{a.breedName ?? ''}</Text>
                </View>
              ))}
            </View>
          )}

          {breedAwards.length > 0 && (
            <View>
              <Text style={{ ...styles.breedHeading, marginTop: 8 }}>Breed Awards</Text>
              {breedAwards.map((a, i) => (
                <View key={i} style={markedStyles.achievementRow}>
                  <Text style={markedStyles.achievementType}>
                    {ACHIEVEMENT_LABELS[a.type] ?? a.type}
                  </Text>
                  <Text style={markedStyles.achievementDog}>{a.dogName}</Text>
                  <Text style={markedStyles.achievementBreed}>{a.breedName ?? ''}</Text>
                </View>
              ))}
            </View>
          )}

          <Text
            style={styles.footer}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}  ·  Marked Catalogue  ·  Generated by Remi`
            }
            fixed
          />
        </Page>
      )}

      {/* One <Page> per breed with result annotations */}
      {breedPages.map(({ groupName, breedName, judge, breedBucket, sexLabel }, pageIdx) => (
        <Page key={`${groupName}-${breedName}-${sexLabel ?? 'all'}-${pageIdx}`} size="A5" style={styles.page} wrap>
          <Text style={markedStyles.watermark}>MARKED CATALOGUE</Text>
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
                  // Small classes stay atomic — never orphan the heading.
                  const keepTogether = bucket.entries.length <= 8;
                  return (
                  <View key={`${bucket.classNumber}-${bucket.className}`} wrap={!keepTogether}>
                    <Text style={styles.classHeadingInBreed} minPresenceAhead={60}>
                      {classHeadingLabel(bucket, sex)}
                    </Text>

                    {bucket.entries.map((entry, entryIdx) => {
                      const catNo = entry.catalogueNumber ?? '';
                      const isFirstAppearance = !catNo || firstAppearanceBucket.get(catNo) === bucket;
                      const isAbsent = catNo ? absentees.has(catNo) : false;
                      const isJH = entry.entryType === 'junior_handler';
                      const displayName = isJH
                        ? (entry.handler ?? entry.exhibitor ?? 'Unnamed Handler')
                        : (entry.dogName ?? 'Unnamed');
                      const rowKey = `${bucket.classNumber ?? bucket.className}-${catNo || 'nocat'}-${entryIdx}`;

                      // Look up result for this entry in this class
                      const resultKey = catNo && bucket.showClassId
                        ? `${catNo}-${bucket.showClassId}`
                        : null;
                      const result = resultKey ? results.get(resultKey) : undefined;

                      if (!isFirstAppearance) {
                        const firstClass = firstSeenClass.get(catNo) ?? '';
                        return (
                          <View
                            key={rowKey}
                            style={{ ...styles.entryRowWrap, paddingLeft: 6 }}
                            wrap={false}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                              <Text style={styles.catalogueNumber}>
                                {catNo || '\u2014'}
                              </Text>
                              <Text style={styles.dogName}>
                                {displayName}
                              </Text>
                              <Text style={styles.seeClassRef}>
                                {'  '}[see {firstClass}]
                              </Text>
                              {isAbsent && (
                                <Text style={markedStyles.absentBadge}> Abs.</Text>
                              )}
                              {result?.placement && (
                                <Text style={markedStyles.placementBadge}>
                                  {' '}{getPlacementLabel(result.placement)}
                                </Text>
                              )}
                            </View>
                          </View>
                        );
                      }

                      // Full entry with result annotation
                      if (isJH) {
                        // Junior Handling: handler-centric display
                        return (
                          <View
                            key={rowKey}
                            style={styles.entryRowWrap}
                            wrap={false}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                              <Text style={styles.catalogueNumber}>
                                {catNo || '\u2014'}
                              </Text>
                              <Text style={styles.dogName}>
                                {displayName}
                              </Text>
                              {isAbsent && (
                                <Text style={markedStyles.absentBadge}> Abs.</Text>
                              )}
                              {result?.placement && (
                                <Text style={markedStyles.placementBadge}>
                                  {' '}{getPlacementLabel(result.placement)}
                                </Text>
                              )}
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
                                {formatOwnerKC(entry.owners, entry.exhibitorId)}
                              </Text>
                            )}
                            {result?.specialAward && (
                              <Text style={markedStyles.specialAwardBadge}>
                                {result.specialAward}
                              </Text>
                            )}
                          </View>
                        );
                      }

                      const pedigree = formatPedigreeKC(entry.sire, entry.dam);
                      return (
                        <View
                          key={rowKey}
                          style={styles.entryRowWrap}
                          wrap={false}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                            <Text style={styles.catalogueNumber}>
                              {catNo || '\u2014'}
                            </Text>
                            <Text style={styles.dogName}>
                              {displayName}
                            </Text>
                            {isAbsent && (
                              <Text style={markedStyles.absentBadge}> Abs.</Text>
                            )}
                            {result?.placement && (
                              <Text style={markedStyles.placementBadge}>
                                {' '}{getPlacementLabel(result.placement)}
                              </Text>
                            )}
                          </View>

                          <Text style={styles.entryDetail}>
                            {[
                              entry.kcRegNumber,
                              entry.dateOfBirth ? `D.O.B: ${formatDobKC(entry.dateOfBirth)}` : null,
                              entry.colour,
                              entry.sex === 'dog' ? 'Dog' : entry.sex === 'bitch' ? 'Bitch' : null,
                            ].filter(Boolean).join('  \u2014  ')}
                          </Text>

                          {pedigree && (
                            <Text style={styles.entryDetail}>
                              {pedigree}
                            </Text>
                          )}

                          {entry.breeder && (
                            <Text style={styles.entryDetail}>
                              <Text style={styles.entryDetailLabel}>Breeder: </Text>
                              {entry.breeder}
                            </Text>
                          )}

                          {entry.owners.length > 0 && (
                            <Text style={styles.entryDetail}>
                              <Text style={styles.entryDetailLabel}>
                                Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                              </Text>
                              {formatOwnerKC(entry.owners, entry.exhibitorId)}
                            </Text>
                          )}

                          {entry.handler && entry.handler !== entry.exhibitor && (
                            <Text style={styles.entryDetail}>
                              <Text style={styles.entryDetailLabel}>Handler: </Text>
                              {entry.handler}
                            </Text>
                          )}

                          {/* Special award annotation */}
                          {result?.specialAward && (
                            <Text style={markedStyles.specialAwardBadge}>
                              {result.specialAward}
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
              `Page ${pageNumber} of ${totalPages}  ·  Marked Catalogue  ·  Generated by Remi`
            }
            fixed
          />
        </Page>
      ))}
    </Document>
  );
}
