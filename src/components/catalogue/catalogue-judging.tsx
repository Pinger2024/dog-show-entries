import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';
import './catalogue-styles'; // side-effect: registers Inter + LibreBaskerville fonts
import type { CatalogueEntry, CatalogueShowInfo } from './catalogue-standard';
import { uppercaseName } from './catalogue-utils';

interface Props {
  show: CatalogueShowInfo;
  entries: CatalogueEntry[];
}

// Ultra-dense "Judging Catalogue" format optimised for print cost:
// - Tight margins, small fonts, two-column entry layout
// - Class header strip (green, minimal), write-in placement slots
// - Minimal front matter (one cover page with show + judges + class legend)
// - Classes grouped by sex (Dogs → Bitches → Junior Handling)

const C = {
  primary: '#0d5c3d',
  textDark: '#1a1a1a',
  textMedium: '#4a4a4a',
  textLight: '#6b6b6b',
  ruleLight: '#d4d4d8',
  textOnPrimary: '#ffffff',
  background: '#fafaf9',
};

const s = StyleSheet.create({
  page: {
    padding: '18 16 22 16',
    fontFamily: 'Inter',
    fontSize: 7,
    color: C.textDark,
  },
  coverPage: {
    padding: '24 20 24 20',
    fontFamily: 'Inter',
    fontSize: 9,
    color: C.textDark,
  },
  // Cover block
  coverLogo: {
    width: 48,
    height: 48,
    alignSelf: 'center',
    marginBottom: 6,
  },
  coverOrg: {
    fontFamily: 'Inter',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    color: C.textMedium,
    marginBottom: 2,
  },
  coverTitle: {
    fontFamily: 'LibreBaskerville',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    color: C.primary,
    marginBottom: 2,
  },
  coverSubtitle: {
    fontFamily: 'Inter',
    fontSize: 8,
    textAlign: 'center',
    color: C.textMedium,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  coverDetails: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  coverDetail: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: C.textDark,
  },
  sectionTitle: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: C.primary,
    borderBottomWidth: 0.75,
    borderBottomColor: C.primary,
    paddingBottom: 1.5,
    marginBottom: 4,
    marginTop: 8,
  },
  // Cover judge rows
  judgeRow: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: C.textDark,
    marginBottom: 1.5,
  },
  // Class legend (two columns of classNo + name)
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  legendItem: {
    width: '50%',
    fontFamily: 'Inter',
    fontSize: 7,
    color: C.textDark,
    marginBottom: 1,
    paddingRight: 4,
  },
  // Sex band — full-width divider before each sex section
  sexBand: {
    backgroundColor: C.primary,
    color: C.textOnPrimary,
    fontFamily: 'LibreBaskerville',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingVertical: 2.5,
    marginTop: 6,
    marginBottom: 4,
  },
  // Class header row — thin primary strip with class name + entry count
  classHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingVertical: 2,
    paddingHorizontal: 5,
    marginTop: 4,
  },
  classHeaderText: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    color: C.textOnPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  classHeaderCount: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontStyle: 'italic',
    color: C.textOnPrimary,
  },
  // Two-column entry grid
  entriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 1.5,
    paddingBottom: 1.5,
    paddingHorizontal: 4,
  },
  entryCell: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingRight: 6,
    paddingVertical: 0.5,
  },
  entryNumber: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontWeight: 'bold',
    color: C.primary,
    width: 14,
  },
  entryName: {
    fontFamily: 'Inter',
    fontSize: 7,
    color: C.textDark,
    flex: 1,
  },
  entryAbsent: {
    textDecoration: 'line-through',
    color: C.textLight,
  },
  // Placement write-in slots
  placementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleLight,
  },
  placementSlot: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1,
    marginRight: 4,
  },
  placementLabel: {
    fontFamily: 'Inter',
    fontSize: 6,
    fontWeight: 'bold',
    color: C.textMedium,
    marginRight: 2,
  },
  placementLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: C.textDark,
    height: 8,
  },
  emptyClass: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontStyle: 'italic',
    color: C.textLight,
    textAlign: 'center',
    paddingVertical: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 8,
    left: 16,
    right: 16,
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 6,
    color: C.textLight,
    borderTopWidth: 0.5,
    borderTopColor: C.ruleLight,
    paddingTop: 3,
  },
});

/** Display name — handler name for JH, dog name for regular entries. */
function displayEntryName(entry: CatalogueEntry): string {
  if (entry.entryType === 'junior_handler') {
    return entry.handler ?? entry.exhibitor ?? 'Unnamed Handler';
  }
  return uppercaseName(entry.dogName) || 'Unnamed';
}

type ClassGroup = {
  classNumber: number | null | undefined;
  className: string;
  sex: string | null | undefined;
  classType: string | null | undefined;
  entries: CatalogueEntry[];
};

function groupByClass(entries: CatalogueEntry[], show: CatalogueShowInfo): ClassGroup[] {
  const byKey = new Map<string, ClassGroup>();

  for (const entry of entries) {
    for (const cls of entry.classes) {
      const key = cls.classNumber != null
        ? `num:${cls.classNumber}`
        : `name:${cls.name ?? ''}-${cls.sex ?? 'any'}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          classNumber: cls.classNumber,
          className: cls.name ?? 'Unknown Class',
          sex: cls.sex,
          classType: null,
          entries: [],
        });
      }
      byKey.get(key)!.entries.push(entry);
    }
  }

  // Inject empty classes from the show's class list so all classes appear
  if (show.allShowClasses) {
    for (const sc of show.allShowClasses) {
      const key = sc.classNumber != null
        ? `num:${sc.classNumber}`
        : `name:${sc.className}-${sc.sex ?? 'any'}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          classNumber: sc.classNumber,
          className: sc.className,
          sex: sc.sex,
          classType: null,
          entries: [],
        });
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.classNumber != null && b.classNumber != null) return a.classNumber - b.classNumber;
    if (a.classNumber != null) return -1;
    if (b.classNumber != null) return 1;
    return a.className.localeCompare(b.className);
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

export function CatalogueJudging({ show, entries }: Props) {
  const allClasses = groupByClass(entries, show);
  const isChampionship = show.showType === 'championship';

  // Split into sections: Dogs, Bitches, Junior Handling.
  // JH classes have sex=null and class name contains "handling".
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
      // Unknown/mixed — treat as dog section so it's not orphaned
      dogClasses.push(cls);
    }
  }

  const sections: Section[] = [];
  if (dogClasses.length > 0) sections.push({ key: 'dog', label: 'Dogs', classes: dogClasses });
  if (bitchClasses.length > 0) sections.push({ key: 'bitch', label: 'Bitches', classes: bitchClasses });
  if (jhClasses.length > 0) sections.push({ key: 'jh', label: 'Junior Handling', classes: jhClasses });

  // Drop empty classes — no point wasting print space on them
  for (const section of sections) {
    section.classes = section.classes.filter((c) => c.entries.length > 0);
  }
  const activeSections = sections.filter((s) => s.classes.length > 0);

  // Build judge list for cover
  const judgeList: { name: string; label: string }[] = [];
  const judgesByName = new Map<string, Set<string>>();
  for (const [breed, judgeName] of Object.entries(show.judgesByBreedName ?? {})) {
    if (!judgesByName.has(judgeName)) judgesByName.set(judgeName, new Set());
    judgesByName.get(judgeName)!.add(breed);
  }
  for (const [name, breeds] of judgesByName.entries()) {
    judgeList.push({
      name,
      label: breeds.size > 0 ? Array.from(breeds).sort().join(', ') : 'Classes',
    });
  }

  // Class legend for cover — compact list of all classes
  const legend = allClasses.map((c) => ({
    number: c.classNumber,
    name: c.className,
    sex: c.sex,
  }));

  const footerText =
    `${show.name}  ·  Judging Catalogue  ·  ${show.date}`;
  const footerRender = ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
    `${footerText}  ·  Page ${pageNumber} of ${totalPages}`;

  return (
    <Document title={`Judging Catalogue — ${show.name}`} author="Remi Show Manager">
      {/* ── COVER PAGE ── */}
      <Page size="A5" style={s.coverPage} wrap={false}>
        {show.logoUrl && <Image src={show.logoUrl} style={s.coverLogo} />}
        {show.organisation && <Text style={s.coverOrg}>{show.organisation}</Text>}
        <Text style={s.coverTitle}>{show.name}</Text>
        <Text style={s.coverSubtitle}>Judging Catalogue</Text>
        <View style={s.coverDetails}>
          <Text style={s.coverDetail}>{show.date}</Text>
          {show.venue && <Text style={s.coverDetail}>·  {show.venue}</Text>}
          {show.kcLicenceNo && <Text style={s.coverDetail}>·  Licence {show.kcLicenceNo}</Text>}
        </View>

        {/* Judges */}
        {judgeList.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>Judges</Text>
            {judgeList.map((j, i) => (
              <Text key={i} style={s.judgeRow}>
                {j.name}  —  {j.label}
              </Text>
            ))}
          </View>
        )}

        {/* Class Legend — compact two-column list */}
        {legend.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>Classes</Text>
            <View style={s.legendRow}>
              {legend.map((c, i) => (
                <Text key={i} style={s.legendItem}>
                  {c.number != null ? `${c.number}. ` : ''}
                  {c.name}
                  {c.sex ? ` (${c.sex === 'dog' ? 'D' : 'B'})` : ''}
                </Text>
              ))}
            </View>
          </View>
        )}

        <Text
          style={s.footer}
          render={footerRender}
          fixed
        />
      </Page>

      {/* ── CONTENT — single <Page wrap> for the whole body so sections
          flow naturally into each other and fill every page. Classes are
          wrap={false} so headers stay atomic with their entries. For very
          large shows this could hit react-pdf's overflow bug, but the
          judging catalogue is dense enough that even 200+ entries fit
          comfortably within safe node counts. ── */}
      <Page size="A5" style={s.page} wrap>
        {activeSections.map((section) => (
          <View key={`section-${section.key}`}>
            <Text style={s.sexBand} minPresenceAhead={80}>
              {section.label}
            </Text>

            {section.classes.map((classGroup, classIdx) => {
              const sorted = sortEntries(classGroup.entries);
              return (
                <View
                  key={`cls-${section.key}-${classGroup.classNumber ?? classGroup.className}-${classIdx}`}
                  wrap={false}
                >
                <View style={s.classHeader}>
                  <Text style={s.classHeaderText}>
                    {classGroup.classNumber != null ? `${classGroup.classNumber}. ` : ''}
                    {classGroup.className}
                    {classGroup.sex ? ` ${classGroup.sex === 'dog' ? '(Dogs)' : '(Bitches)'}` : ''}
                  </Text>
                  <Text style={s.classHeaderCount}>
                    {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
                  </Text>
                </View>

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
          </View>
        ))}

        <Text
          style={s.footer}
          render={footerRender}
          fixed
        />
      </Page>
    </Document>
  );
}
