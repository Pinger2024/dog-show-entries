import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import './catalogue-styles'; // side-effect: registers Inter + LibreBaskerville fonts
import { C } from './catalogue-styles';
import type { CatalogueEntry, CatalogueShowInfo } from './catalogue-standard';
import {
  uppercaseName,
  formatDobKC,
  formatPedigreeKC,
  formatOwnerKC,
} from './catalogue-utils';
import {
  CoverPage,
  JudgesListPage,
  ClassDefinitionsPage,
  TrophiesPage,
} from './catalogue-front-matter';
import type { ClassSponsorshipInfo } from './catalogue-front-matter';

interface Props {
  show: CatalogueShowInfo;
  entries: CatalogueEntry[];
}

// ── Styles ─────────────────────────────────────────────────────
// Traditional ringside catalogue — readable font sizes, generous
// write-in space, clean class headers. Designed for exhibitors and
// spectators to follow judging and write in placements by hand.

const s = StyleSheet.create({
  page: {
    padding: '22 22 32 22',
    fontFamily: 'Inter',
    fontSize: 8,
    color: C.textDark,
  },
  // Sex divider band — full-width
  sexBand: {
    backgroundColor: C.primary,
    color: C.textOnPrimary,
    fontFamily: 'LibreBaskerville',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingVertical: 4,
    marginBottom: 8,
  },
  // Class header row
  classHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  classHeaderText: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'bold',
    color: C.textOnPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  classHeaderCount: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontStyle: 'italic',
    color: C.textOnPrimary,
  },
  // Sponsorship line below class header
  sponsorLine: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    fontWeight: 'bold',
    color: C.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  // Entry grid — two columns of catalogue# + dog name
  entriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 3,
    paddingBottom: 2,
    paddingHorizontal: 6,
  },
  entryCell: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingRight: 6,
    paddingVertical: 1,
  },
  entryNumber: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    color: C.primary,
    width: 18,
  },
  entryName: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: C.textDark,
    flex: 1,
  },
  // Placement write-in slots
  placementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleLight,
  },
  placementSlot: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1,
    marginRight: 6,
  },
  placementLabel: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontWeight: 'bold',
    color: C.textMedium,
    marginRight: 3,
  },
  placementLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: C.textDark,
    height: 10,
  },
  // Best of Sex / Best in Show write-in areas
  bestAwardRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  bestAwardLabel: {
    fontFamily: 'LibreBaskerville',
    fontSize: 9,
    fontWeight: 'bold',
    color: C.textDark,
    marginRight: 4,
  },
  bestAwardLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: C.textDark,
    height: 12,
  },
  bestAwardSection: {
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.primary,
  },
  // Exhibitor index styles
  exhibitorName: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    color: C.textDark,
    textTransform: 'uppercase',
  },
  exhibitorAddress: {
    fontFamily: 'Inter',
    fontSize: 7,
    color: C.textMedium,
    marginBottom: 2,
  },
  exhibitorDogRow: {
    paddingLeft: 12,
    marginBottom: 3,
  },
  exhibitorDogName: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    fontWeight: 'bold',
    color: C.textDark,
  },
  exhibitorDogDetail: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    color: C.textMedium,
    paddingLeft: 16,
    marginBottom: 0.5,
  },
  emptyClass: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontStyle: 'italic',
    color: C.textLight,
    textAlign: 'center',
    paddingVertical: 3,
  },
  footer: {
    position: 'absolute',
    bottom: 10,
    left: 22,
    right: 22,
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 6,
    color: C.textLight,
    borderTopWidth: 0.5,
    borderTopColor: C.ruleLight,
    paddingTop: 3,
  },
  // Section band for exhibitor index
  sectionBand: {
    backgroundColor: C.primary,
    marginTop: -22,
    marginHorizontal: -22,
    paddingVertical: 9,
    paddingHorizontal: 22,
    marginBottom: 14,
  },
  sectionBandText: {
    fontFamily: 'LibreBaskerville',
    fontSize: 11,
    fontWeight: 'bold',
    color: C.textOnPrimary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});

// ── Helpers ────────────────────────────────────────────────────

/** Display name — handler name for JH, dog name for regular entries. */
function displayEntryName(entry: CatalogueEntry): string {
  if (entry.entryType === 'junior_handler') {
    return entry.jhHandlerName ?? entry.handler ?? entry.exhibitor ?? 'Unnamed Handler';
  }
  return uppercaseName(entry.dogName) || 'Unnamed';
}

type ClassGroup = {
  classNumber: number | null | undefined;
  className: string;
  sex: string | null | undefined;
  sortOrder: number | undefined;
  entries: CatalogueEntry[];
};

function groupByClass(
  entries: CatalogueEntry[],
  show: CatalogueShowInfo,
): ClassGroup[] {
  const byKey = new Map<string, ClassGroup>();

  for (const entry of entries) {
    for (const cls of entry.classes) {
      const key =
        cls.classNumber != null
          ? `num:${cls.classNumber}`
          : `name:${cls.name ?? ''}-${cls.sex ?? 'any'}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          classNumber: cls.classNumber,
          className: cls.name ?? 'Unknown Class',
          sex: cls.sex,
          sortOrder: cls.sortOrder,
          entries: [],
        });
      }
      byKey.get(key)!.entries.push(entry);
    }
  }

  // Inject empty classes from the show's class list
  if (show.allShowClasses) {
    for (const sc of show.allShowClasses) {
      const key =
        sc.classNumber != null
          ? `num:${sc.classNumber}`
          : `name:${sc.className}-${sc.sex ?? 'any'}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          classNumber: sc.classNumber,
          className: sc.className,
          sex: sc.sex,
          sortOrder: sc.sortOrder,
          entries: [],
        });
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.classNumber != null && b.classNumber != null)
      return a.classNumber - b.classNumber;
    if (a.classNumber != null) return -1;
    if (b.classNumber != null) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

function sortEntries(entries: CatalogueEntry[]): CatalogueEntry[] {
  return [...entries].sort((a, b) => {
    const an = a.catalogueNumber ?? '';
    const bn = b.catalogueNumber ?? '';
    return an.localeCompare(bn, undefined, { numeric: true });
  });
}

type Section = {
  key: 'dog' | 'bitch' | 'jh';
  label: string;
  classes: ClassGroup[];
};

// ── Sponsorship formatting ─────────────────────────────────────

function buildSponsorLines(
  sps: ClassSponsorshipInfo[],
): string[] {
  const lines: string[] = [];
  for (const sp of sps) {
    if (sp.trophyName) {
      let part = `Trophy: ${sp.trophyName}`;
      if (sp.sponsorName) {
        part += ` — sponsored by ${sp.sponsorName}`;
        if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
      } else if (sp.trophyDonor) {
        part += ` — donated by ${sp.trophyDonor}`;
      }
      lines.push(part);
    } else if (sp.sponsorName) {
      let part = `Sponsored by ${sp.sponsorName}`;
      if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
      if (sp.prizeDescription) part += ` — ${sp.prizeDescription}`;
      lines.push(part);
    } else if (sp.prizeDescription) {
      lines.push(sp.prizeDescription);
    }
  }
  return lines;
}

// ── Exhibitor Index ────────────────────────────────────────────
// Full exhibitor details: name, address, then each dog with
// catalogue number, registered name, sex, DOB, breeding, class.

interface ExhibitorDogInfo {
  catalogueNumber: string;
  dogName: string;
  sex: string | undefined;
  dateOfBirth: string | null | undefined;
  sire: string | null | undefined;
  dam: string | null | undefined;
  breeder: string | null | undefined;
  kcRegNumber: string | null | undefined;
  colour: string | null | undefined;
  classes: string;
  entryType: string;
}

interface ExhibitorInfo {
  name: string;
  address: string | null;
  dogs: ExhibitorDogInfo[];
}

function buildExhibitorIndex(entries: CatalogueEntry[]): ExhibitorInfo[] {
  const byExhibitor = new Map<string, ExhibitorInfo>();

  for (const entry of entries) {
    const name = entry.exhibitor ?? entry.owners[0]?.name ?? 'Unknown';
    const key = name.toUpperCase();
    if (!byExhibitor.has(key)) {
      byExhibitor.set(key, {
        name: name.toUpperCase(),
        address: entry.owners[0]?.address ?? null,
        dogs: [],
      });
    }
    const ex = byExhibitor.get(key)!;

    // Avoid duplicate dogs (multi-class entries)
    const catNo = entry.catalogueNumber ?? '';
    if (catNo && ex.dogs.some((d) => d.catalogueNumber === catNo)) continue;

    const classLabels = entry.classes
      .sort((a, b) => {
        if (a.classNumber != null && b.classNumber != null)
          return a.classNumber - b.classNumber;
        return 0;
      })
      .map((c) =>
        c.classNumber != null ? `${c.classNumber}. ${c.name ?? ''}` : c.name ?? '',
      )
      .filter(Boolean)
      .join(', ');

    const isJH = entry.entryType === 'junior_handler';
    const displayName = isJH
      ? (entry.jhHandlerName ?? entry.handler ?? entry.exhibitor ?? 'Unnamed Handler')
      : (uppercaseName(entry.dogName) || 'Unnamed');

    ex.dogs.push({
      catalogueNumber: catNo,
      dogName: displayName,
      sex: entry.sex,
      dateOfBirth: entry.dateOfBirth,
      sire: entry.sire,
      dam: entry.dam,
      breeder: entry.breeder,
      kcRegNumber: entry.kcRegNumber,
      colour: entry.colour,
      classes: classLabels,
      entryType: entry.entryType,
    });
  }

  return Array.from(byExhibitor.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((ex) => ({
      ...ex,
      dogs: ex.dogs.sort((a, b) =>
        a.catalogueNumber.localeCompare(b.catalogueNumber, undefined, { numeric: true }),
      ),
    }));
}

// ── Main Component ─────────────────────────────────────────────

export function CatalogueRingside({ show, entries }: Props) {
  const allClasses = groupByClass(entries, show);
  const isChampionship = show.showType === 'championship';

  // Build sponsorship lookup
  const sponsorsByClassNumber = new Map<number, ClassSponsorshipInfo[]>();
  for (const sp of show.classSponsorships ?? []) {
    if (sp.classNumber != null) {
      const existing = sponsorsByClassNumber.get(sp.classNumber) ?? [];
      existing.push(sp);
      sponsorsByClassNumber.set(sp.classNumber, existing);
    }
  }

  // Split into sections: Dogs, Bitches, Junior Handling
  const dogClasses: ClassGroup[] = [];
  const bitchClasses: ClassGroup[] = [];
  const jhClasses: ClassGroup[] = [];
  for (const cls of allClasses) {
    const isJh = cls.sex == null && /handling|handler/i.test(cls.className);
    if (isJh) {
      jhClasses.push(cls);
    } else if (cls.sex === 'dog') {
      dogClasses.push(cls);
    } else if (cls.sex === 'bitch') {
      bitchClasses.push(cls);
    } else {
      dogClasses.push(cls);
    }
  }

  const sections: Section[] = [];
  if (dogClasses.length > 0) sections.push({ key: 'dog', label: 'Dog', classes: dogClasses });
  if (bitchClasses.length > 0) sections.push({ key: 'bitch', label: 'Bitch', classes: bitchClasses });
  if (jhClasses.length > 0) sections.push({ key: 'jh', label: 'Junior Handling', classes: jhClasses });

  // Best-of awards for each sex section
  const bestAwards: Record<string, string[]> = {
    dog: ['Best Dog', 'Best Longcoat Dog', 'Best Puppy Dog'],
    bitch: ['Best Bitch', 'Best Longcoat Bitch', 'Best Puppy Bitch'],
  };
  const bisAwards = [
    'Best Longcoat Puppy',
    'Best in Show',
    'Best Longcoat in Show',
  ];

  // Build exhibitor index
  const exhibitors = buildExhibitorIndex(entries);

  // Page-chunk classes to avoid react-pdf coordinate overflow.
  // Each sex section gets its own set of page chunks.
  const PAGE_ENTRY_THRESHOLD = 50;

  function chunkClasses(classes: ClassGroup[]): ClassGroup[][] {
    const chunks: ClassGroup[][] = [];
    let currentChunk: ClassGroup[] = [];
    let currentCount = 0;
    for (const cls of classes) {
      const entryCount = cls.entries.length;
      if (currentChunk.length > 0 && currentCount + entryCount > PAGE_ENTRY_THRESHOLD) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentCount = 0;
      }
      currentChunk.push(cls);
      currentCount += entryCount;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);
    return chunks;
  }

  // Chunk exhibitors for the index pages
  const EXHIBITOR_PAGE_THRESHOLD = 20;
  function chunkExhibitors(exs: ExhibitorInfo[]): ExhibitorInfo[][] {
    const chunks: ExhibitorInfo[][] = [];
    let currentChunk: ExhibitorInfo[] = [];
    let currentCount = 0;
    for (const ex of exs) {
      const weight = 1 + ex.dogs.length;
      if (currentChunk.length > 0 && currentCount + weight > EXHIBITOR_PAGE_THRESHOLD) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentCount = 0;
      }
      currentChunk.push(ex);
      currentCount += weight;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);
    return chunks;
  }

  const exhibitorChunks = chunkExhibitors(exhibitors);

  const footerRender = ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
    `${show.name}  ·  Ringside Catalogue  ·  Page ${pageNumber} of ${totalPages}`;

  return (
    <Document title={`Ringside Catalogue — ${show.name}`} author="Remi Show Manager">
      {/* Front matter */}
      <CoverPage show={show} />
      <JudgesListPage show={show} />
      <ClassDefinitionsPage show={show} />
      {!show.skipTrophiesPage && show.classSponsorships && show.classSponsorships.length > 0 && (
        <TrophiesPage show={show} sponsorships={show.classSponsorships} />
      )}

      {/* Class pages — grouped by sex */}
      {sections.map((section) => {
        const chunks = chunkClasses(section.classes);
        return chunks.map((chunkClasses, chunkIdx) => (
          <Page
            key={`${section.key}-chunk-${chunkIdx}`}
            size="A5"
            style={s.page}
            wrap
          >
            {/* Sex band on first chunk of each section */}
            {chunkIdx === 0 && (
              <Text style={s.sexBand} minPresenceAhead={80}>
                {section.label}
              </Text>
            )}

            {chunkClasses.map((classGroup, classIdx) => {
              const sorted = sortEntries(classGroup.entries);
              const sps =
                classGroup.classNumber != null
                  ? sponsorsByClassNumber.get(classGroup.classNumber) ?? []
                  : [];
              const sponsorLines = buildSponsorLines(sps);

              return (
                <View
                  key={`cls-${section.key}-${classGroup.classNumber ?? classGroup.className}-${classIdx}`}
                  wrap={false}
                >
                  {/* Class header strip */}
                  <View style={s.classHeader}>
                    <Text style={s.classHeaderText}>
                      {classGroup.classNumber != null
                        ? `${classGroup.classNumber}. ${classGroup.className}`
                        : classGroup.className}
                    </Text>
                    <Text style={s.classHeaderCount}>
                      {sorted.length} {sorted.length === 1 ? 'Entry' : 'Entries'}
                    </Text>
                  </View>

                  {/* Sponsorship lines */}
                  {sponsorLines.map((line, i) => (
                    <Text key={i} style={s.sponsorLine}>
                      {line}
                    </Text>
                  ))}

                  {/* Entry grid — catalogue number + dog name, two columns */}
                  {sorted.length > 0 ? (
                    <View style={s.entriesGrid}>
                      {sorted.map((entry, entryIdx) => (
                        <View
                          key={`${classGroup.classNumber ?? classGroup.className}-${entry.catalogueNumber ?? 'nocat'}-${entryIdx}`}
                          style={s.entryCell}
                        >
                          <Text style={s.entryNumber}>
                            {entry.catalogueNumber ?? '—'}
                          </Text>
                          <Text style={s.entryName}>
                            {displayEntryName(entry)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={s.emptyClass}>No entries</Text>
                  )}

                  {/* Write-in placement lines */}
                  <View style={s.placementRow}>
                    <View style={s.placementSlot}>
                      <Text style={s.placementLabel}>1st</Text>
                      <View style={s.placementLine} />
                    </View>
                    <View style={s.placementSlot}>
                      <Text style={s.placementLabel}>2nd</Text>
                      <View style={s.placementLine} />
                    </View>
                    <View style={s.placementSlot}>
                      <Text style={s.placementLabel}>3rd</Text>
                      <View style={s.placementLine} />
                    </View>
                    <View style={s.placementSlot}>
                      <Text style={s.placementLabel}>Res</Text>
                      <View style={s.placementLine} />
                    </View>
                    {isChampionship && (
                      <View style={s.placementSlot}>
                        <Text style={s.placementLabel}>VHC</Text>
                        <View style={s.placementLine} />
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Best of Sex awards — only on the last chunk of dog/bitch sections */}
            {chunkIdx === chunks.length - 1 &&
              bestAwards[section.key] && (
                <View style={s.bestAwardSection} wrap={false}>
                  {bestAwards[section.key].map((award) => (
                    <View key={award} style={s.bestAwardRow}>
                      <Text style={s.bestAwardLabel}>{award}</Text>
                      <View style={s.bestAwardLine} />
                    </View>
                  ))}
                </View>
              )}

            <Text style={s.footer} render={footerRender} fixed />
          </Page>
        ));
      })}

      {/* Best in Show page */}
      <Page size="A5" style={s.page} wrap={false}>
        <View
          style={{
            borderWidth: 1.5,
            borderColor: C.primary,
            padding: '16 20',
            marginTop: 30,
          }}
        >
          <Text
            style={{
              fontFamily: 'LibreBaskerville',
              fontSize: 14,
              fontWeight: 'bold',
              textAlign: 'center',
              textTransform: 'uppercase',
              color: C.textDark,
              marginBottom: 16,
            }}
          >
            Best in Show
          </Text>
          {bisAwards.map((award) => (
            <View key={award} style={{ ...s.bestAwardRow, paddingVertical: 6 }}>
              <Text style={s.bestAwardLabel}>{award}</Text>
              <View style={s.bestAwardLine} />
            </View>
          ))}
        </View>
        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* Exhibitor Index — full details like the GSD Scotland PDF */}
      {exhibitorChunks.map((chunk, chunkIdx) => (
        <Page key={`exhibitors-${chunkIdx}`} size="A5" style={s.page} wrap>
          {chunkIdx === 0 && (
            <View style={s.sectionBand}>
              <Text style={s.sectionBandText}>List of Exhibitors</Text>
            </View>
          )}

          {chunk.map((ex, exIdx) => (
            <View
              key={`${ex.name}-${exIdx}`}
              wrap={false}
              style={{
                marginBottom: 6,
                borderBottomWidth: 0.5,
                borderBottomColor: C.ruleLight,
                paddingBottom: 4,
              }}
            >
              {/* Exhibitor name + address */}
              <Text style={s.exhibitorName}>{ex.name}</Text>
              {ex.address && <Text style={s.exhibitorAddress}>{ex.address}</Text>}

              {/* Each dog */}
              {ex.dogs.map((dog, dogIdx) => {
                const isJH = dog.entryType === 'junior_handler';
                const pedigree = formatPedigreeKC(dog.sire, dog.dam);
                const sexLabel =
                  dog.sex === 'dog' ? 'D' : dog.sex === 'bitch' ? 'B' : '';
                const dobStr = dog.dateOfBirth
                  ? formatDobKC(dog.dateOfBirth)
                  : '';

                // Detail line: sex, DOB, breeding
                const detailParts = [
                  sexLabel,
                  dobStr,
                  pedigree
                    ? `br ${dog.breeder ?? 'unknown'}`
                    : dog.breeder
                      ? `br ${dog.breeder}`
                      : null,
                  pedigree,
                ].filter(Boolean);

                return (
                  <View key={`${dog.catalogueNumber}-${dogIdx}`} style={s.exhibitorDogRow}>
                    {/* Catalogue number + dog/handler name */}
                    <Text style={s.exhibitorDogName}>
                      {dog.catalogueNumber ? `${dog.catalogueNumber}. ` : ''}
                      {dog.dogName}
                      {isJH ? ' (Junior Handler)' : ''}
                    </Text>
                    {/* Detail line */}
                    {!isJH && detailParts.length > 0 && (
                      <Text style={s.exhibitorDogDetail}>
                        {detailParts.join('  ·  ')}
                      </Text>
                    )}
                    {/* Classes */}
                    {dog.classes && (
                      <Text style={s.exhibitorDogDetail}>
                        Class{dog.classes.includes(',') ? 'es' : ''}: {dog.classes}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}

          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      ))}
    </Document>
  );
}
