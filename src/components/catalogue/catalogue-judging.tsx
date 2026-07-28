import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';
import './catalogue-styles'; // side-effect: registers Inter + LibreBaskerville fonts
import type { CatalogueEntry, CatalogueShowInfo } from './catalogue-types';
import {
  uppercaseName,
  groupByClass as groupByClassShared,
  sortEntries,
  displayEntryName,
} from './catalogue-utils';
import type { ClassGroup } from './catalogue-utils';
import { sectionClasses } from '@/lib/class-labels';

interface Props {
  show: CatalogueShowInfo;
  entries: CatalogueEntry[];
}

// Ultra-dense "Stewards' Catalogue" format optimised for print cost:
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
    maxWidth: 84,
    maxHeight: 48,
    objectFit: 'contain',
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
  // Class legend — two real columns read top-to-bottom (column-major), so the
  // numbers run 1,2,3… down the left then continue down the right rather than
  // odds-left / evens-right (Mandy 2026-06-19: "all over the place").
  legendRow: {
    flexDirection: 'row',
  },
  legendCol: {
    width: '50%',
    flexDirection: 'column',
    paddingRight: 4,
  },
  legendItem: {
    fontFamily: 'Inter',
    fontSize: 7,
    color: C.textDark,
    marginBottom: 1,
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
  // Judge line under a section band (Special Awards / Junior Handling) —
  // mirrors catalogue-ringside.tsx's sexBandJudge, scaled to this format's
  // denser type.
  sexBandJudge: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontStyle: 'italic',
    color: C.textMedium,
    textAlign: 'center',
    marginTop: -2,
    marginBottom: 5,
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
  // Placement write-in slots — generous height so stewards have real room to
  // write the placing in the ring (Mandy 2026-06-17: the old lines were too
  // cramped). Taller write line + more padding above/below the row.
  placementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 5,
    paddingBottom: 8,
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
    fontSize: 7,
    fontWeight: 'bold',
    color: C.textMedium,
    marginRight: 3,
  },
  placementLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: C.textDark,
    height: 20,
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

type Section = {
  key: 'dog' | 'bitch' | 'special' | 'jh' | 'other';
  label: string;
  classes: ClassGroup[];
  /** Named judge for competitions that have their own, apart from the breed
   *  judge (Special Awards Classes, Junior Handling) — attached by the
   *  caller (needs `show.judgeDisplayList`, which this pure function
   *  doesn't take). */
  judge?: string | null;
};

const SECTION_LABELS: Record<Exclude<Section['key'], never>, string> = {
  dog: 'Dogs',
  bitch: 'Bitches',
  special: 'Special Awards Classes',
  jh: 'Junior Handling',
  other: 'Other Classes',
};

/** Adapts a `ClassGroup` to the minimal shape `sectionClasses` needs. */
const classGroupToClassLike = (g: ClassGroup) => ({
  sex: g.sex,
  classDefinition: { type: g.classDefinitionType, name: g.className },
});

/**
 * Split a show's classes into the steward book's sections: Dogs, Bitches,
 * Special Awards Classes, Junior Handling — plus a final catch-all so a
 * class of an unrecognised shape is never silently dropped.
 *
 * Classes with NO entries are kept. Mandy 2026-07-27: "steward book, can we
 * include classes with no entries ie baby puppy". A steward works down the
 * schedule calling classes in order, so one that silently vanishes because
 * nobody entered it makes them lose their place and wonder whether it was
 * missed. Printed as "0 entries" it plainly says: scheduled, no takers.
 *
 * `groupByClass` already injects unentered classes from show.allShowClasses;
 * this function used to filter them straight back out, which is why the
 * steward book disagreed with the by-class catalogue, which has always
 * printed them.
 *
 * Special Award Classes (sex=null, name "Special Award Class - …") used to
 * fall through the else branch below into the Dogs bucket — no section
 * heading, no judge line, silently mixed in after Veteran Dog. Mandy,
 * South Western 2026-07-28: "the stewards book should also mirror the
 * catalogue order" — the Standard Catalogue (catalogue-ringside.tsx) has
 * always given Special Awards its own section between Bitch and Junior
 * Handling; the steward book just never grew the matching bucket.
 *
 * The bucketing itself is now the shared `sectionClasses` (lib/
 * class-labels.ts), which runs the real `isSpecialAwardClass`/
 * `isJuniorHandler` predicates against `ClassGroup.classDefinitionType` —
 * not a `/special award/i` name regex — so this can no longer drift from
 * the Standard Catalogue, the schedule, or the printed Schedule (Michael
 * 2026-07-28).
 *
 * Exported for testing — the rendering around it is a PDF tree, but which
 * classes reach which section, and the section order, is plain logic and
 * should be asserted as such.
 */
export function buildJudgingSections(allClasses: ClassGroup[]): Section[] {
  return sectionClasses(allClasses, classGroupToClassLike).map((section) => ({
    key: section.key,
    label: SECTION_LABELS[section.key],
    classes: section.classes,
  }));
}

export function CatalogueJudging({ show, entries }: Props) {
  const allClasses = groupByClassShared(entries, show);
  const isChampionship = show.showType === 'championship';

  // Special Awards Classes and Junior Handling each have their own judge,
  // apart from the breed judge — sourced from the "role — name" display
  // list, same parse as catalogue-ringside.tsx's judgeForRole so the two
  // catalogues can't drift on who's named.
  const LABEL_SEP = ' — ';
  const judgeForRole = (test: RegExp): string | null => {
    for (const label of show.judgeDisplayList ?? []) {
      const i = label.indexOf(LABEL_SEP);
      if (i < 0) continue;
      if (test.test(label.slice(0, i))) return label.slice(i + LABEL_SEP.length);
    }
    return null;
  };
  const activeSections = buildJudgingSections(allClasses).map((section) => ({
    ...section,
    judge:
      section.key === 'special'
        ? judgeForRole(/special award/i)
        : section.key === 'jh'
          ? judgeForRole(/junior handl/i)
          : undefined,
  }));

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
    label: c.classLabel ?? (c.classNumber != null ? String(c.classNumber) : ''),
    name: c.className,
    sex: c.sex,
  }));

  const footerText =
    `${show.name}  ·  Stewards' Catalogue  ·  ${show.date}`;
  const footerRender = ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
    `${footerText}  ·  Page ${pageNumber} of ${totalPages}`;

  return (
    <Document title={`Stewards' Catalogue — ${show.name}`} author="Remi Show Manager">
      {/* ── COVER PAGE ──
          NOTE: leave wrap at default (true). wrap={false} on a
          <Page> with short content shrinks the page to fit, which
          Mixam rejects as a size mismatch. */}
      <Page size="A5" style={s.coverPage}>
        {show.logoUrl && <Image src={show.logoUrl} style={s.coverLogo} />}
        {show.organisation && <Text style={s.coverOrg}>{show.organisation}</Text>}
        <Text style={s.coverTitle}>{show.name}</Text>
        <Text style={s.coverSubtitle}>Stewards' Catalogue</Text>
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

        {/* Class Legend — column-major two columns (down the left, then down
            the right) so the class numbers read in order. */}
        {legend.length > 0 && (() => {
          const mid = Math.ceil(legend.length / 2);
          const columns = [legend.slice(0, mid), legend.slice(mid)];
          return (
            <View>
              <Text style={s.sectionTitle}>Classes</Text>
              <View style={s.legendRow}>
                {columns.map((col, ci) => (
                  <View key={ci} style={s.legendCol}>
                    {col.map((c, i) => (
                      <Text key={i} style={s.legendItem}>
                        {c.label ? `${c.label}. ` : ''}
                        {c.name}
                        {c.sex ? ` (${c.sex === 'dog' ? 'D' : 'B'})` : ''}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

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
        {activeSections.map((section, sectionIdx) => (
          // Junior Handling starts on a fresh page so its band isn't stranded
          // at the foot of the last Bitches page (Mandy/Michael 2026-06-19).
          // Guard on sectionIdx so a JH-only show doesn't open with a blank page.
          <View
            key={`section-${section.key}`}
            break={section.key === 'jh' && sectionIdx > 0}
          >
            <Text style={s.sexBand} minPresenceAhead={80}>
              {section.label}
            </Text>
            {section.judge && (
              <Text style={s.sexBandJudge}>Judge: {section.judge}</Text>
            )}

            {section.classes.map((classGroup, classIdx) => {
              const sorted = sortEntries(classGroup.entries);
              return (
                <View
                  key={`cls-${section.key}-${classGroup.classLabel || classGroup.className}-${classIdx}`}
                  wrap={false}
                >
                <View style={s.classHeader}>
                  <Text style={s.classHeaderText}>
                    {classGroup.classLabel ? `${classGroup.classLabel}. ` : ''}
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
                      key={`${classGroup.classLabel || classGroup.className}-${entry.catalogueNumber ?? 'nocat'}-${entryIdx}`}
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
