import { Fragment } from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import './catalogue-styles'; // side-effect: registers Inter + LibreBaskerville fonts
import { C } from './catalogue-styles';
import type { CatalogueEntry, CatalogueShowInfo } from './catalogue-types';
import {
  uppercaseName,
  formatDobKC,
  titleCase,
  groupByClass,
  sortEntries,
  displayEntryName,
  buildSponsorLines,
  ownerHeading,
  formatPedigreeSireDam,
} from './catalogue-utils';
import type { ClassGroup } from './catalogue-utils';
import { sectionClasses } from '@/lib/class-labels';
import {
  CoverPage,
  FrontMatterContent,
  TrophiesPage,
  JurisdictionBlock,
  NotForCompetitionPage,
  BestsWriteInPage,
} from './catalogue-front-matter';
import type { ClassSponsorshipInfo } from './catalogue-types';

interface Props {
  show: CatalogueShowInfo;
  entries: CatalogueEntry[];
  /**
   * Compact mode — tightens front-matter section spacing and condenses
   * the back-of-book exhibitor list. No effect on class hero banners,
   * cover, sponsor banners, judges-with-bios, or class definitions.
   */
  compact?: boolean;
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
    paddingVertical: 3,
    marginBottom: 5,
  },
  sexBandJudge: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    fontStyle: 'italic',
    color: C.textMedium,
    textAlign: 'center',
    marginTop: -3,
    marginBottom: 6,
  },
  // Class header row
  classHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginTop: 3,
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
    paddingVertical: 1,
  },
  // Entry grid — two columns of catalogue# + dog name
  entriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 2,
    paddingBottom: 1,
    paddingHorizontal: 6,
  },
  entryCell: {
    width: '50%',
    flexDirection: 'row',
    // Top, not baseline: a long name — or one carrying NAF/TAF/ATC flags —
    // wraps to a second line, and baseline alignment then levelled the
    // catalogue number with the LAST line, so "1" looked like it belonged to
    // the wrapped fragment. The number must sit with the first line of its
    // own dog's name.
    alignItems: 'flex-start',
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
    // Match the By-Class gap so the line reads as a separate write-in block
    // rather than crowding the last entry (Michael 2026-06-19).
    marginTop: 14,
    paddingTop: 5,
    paddingBottom: 5,
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
  // Exhibitor index styles. Owner names ship Title Case rather than the
  // RKC-traditional UPPERCASE — Amanda's call (2026-05-22). The
  // smartOwnerTitleCase helper in catalogue-utils handles the casing
  // upstream; this style must NOT re-uppercase.
  exhibitorName: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    color: C.textDark,
    lineHeight: 1.3,
  },
  exhibitorAddress: {
    fontFamily: 'Inter',
    fontSize: 7,
    color: C.textMedium,
    marginBottom: 3,
    lineHeight: 1.3,
  },
  exhibitorDogRow: {
    paddingLeft: 12,
    marginBottom: 5,
  },
  exhibitorDogName: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    fontWeight: 'bold',
    color: C.textDark,
    lineHeight: 1.4,
    marginBottom: 1,
  },
  // NOTE: lineHeight is set explicitly here because long pedigree /
  // multi-class detail lines wrap to 2 visual lines inside a single
  // <Text>. Without an explicit lineHeight, react-pdf collapses the
  // wrapped lines on top of each other at small font sizes.
  exhibitorDogDetail: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    color: C.textMedium,
    paddingLeft: 16,
    marginBottom: 1,
    lineHeight: 1.4,
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
    fontFamily: 'HankenGrotesk',
    fontSize: 11,
    fontWeight: 'bold',
    color: C.textOnPrimary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});

type Section = {
  key: 'dog' | 'bitch' | 'jh' | 'special' | 'other';
  label: string;
  classes: ClassGroup[];
  /** Named beneath the section band for the Special Awards / Junior Handling
   *  competitions (their own judges, apart from the breed judge). */
  judge?: string | null;
};

/** Adapts a `ClassGroup` to the minimal shape `sectionClasses` needs. */
const classGroupToClassLike = (g: ClassGroup) => ({
  sex: g.sex,
  classDefinition: { type: g.classDefinitionType, name: g.className },
});

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
  /** Lower-case surname of the first owner, used purely for sorting. */
  sortKey: string;
  dogs: ExhibitorDogInfo[];
}

type ExhibitorIndexClassRow = CatalogueEntry['classes'][number];

/** Sort + format a dog's class rows into the "1. Minor Puppy, A. Special
 *  Award Class - Puppy" label the exhibitor index prints. Extracted so it
 *  can be re-run every time another of a dog's multi-class rows merges in
 *  — see buildExhibitorIndex's dedup comment below. */
function formatClassLabels(rows: ExhibitorIndexClassRow[]): string {
  return [...rows]
    .sort((a, b) => {
      if (a.classNumber != null && b.classNumber != null)
        return a.classNumber - b.classNumber;
      if (a.classNumber != null) return -1;
      if (b.classNumber != null) return 1;
      return (a.classLabel ?? '').localeCompare(b.classLabel ?? '');
    })
    .map((c) => {
      const lbl = c.classLabel ?? (c.classNumber != null ? String(c.classNumber) : null);
      return lbl ? `${lbl}. ${c.name ?? ''}` : c.name ?? '';
    })
    .filter(Boolean)
    .join(', ');
}

export function buildExhibitorIndex(entries: CatalogueEntry[]): ExhibitorInfo[] {
  const byExhibitor = new Map<string, ExhibitorInfo>();
  // "One catalogue number per dog" (catalogue-numbering.ts) means a dog
  // bought into a second class later (e.g. an age class, then a Special
  // Award Class) gets a SECOND `entries` row sharing the same catalogue
  // number — each row carries only its own purchase's classes. Track
  // every row's classes per catalogue number here so a later row can be
  // MERGED into the dog already pushed to `ex.dogs`, instead of being
  // silently dropped: rather than discarding rows past the first, the
  // previous code kept only whichever row's classes happened to come
  // first in `entries` order — which meant a dog's Special Award Class
  // could vanish from this index entirely depending on unrelated sort
  // order upstream (coordinator's review, 2026-09-02, surfaced by fixing
  // catalogueNumberAsc: a dog's displayed class flipped between "1. Minor
  // Puppy" and "A. Special Award Class - Puppy" depending on which order
  // its two rows happened to arrive in — both classes should show).
  const classRowsByCatNo = new Map<string, ExhibitorIndexClassRow[]>();

  for (const entry of entries) {
    const { heading, sortKey } = ownerHeading(entry.owners, entry.exhibitor);
    const key = heading;
    if (!byExhibitor.has(key)) {
      byExhibitor.set(key, {
        name: heading,
        // Respect withhold-from-publication: this 'standard' catalogue is
        // distributed to exhibitors, so a withheld owner's home address must
        // never be printed in the exhibitor index.
        address: entry.withholdFromPublication ? null : (entry.owners[0]?.address ?? null),
        sortKey,
        dogs: [],
      });
    }
    const ex = byExhibitor.get(key)!;
    // If ANY entry for this owner is withheld, suppress the published address
    // (the flag is per-entry but the address is shown once per owner).
    if (entry.withholdFromPublication) ex.address = null;

    const catNo = entry.catalogueNumber ?? '';
    const existingDog = catNo ? ex.dogs.find((d) => d.catalogueNumber === catNo) : undefined;
    if (existingDog) {
      const rows = classRowsByCatNo.get(catNo) ?? [];
      rows.push(...entry.classes);
      classRowsByCatNo.set(catNo, rows);
      existingDog.classes = formatClassLabels(rows);
      continue;
    }

    const classRows = [...entry.classes];
    if (catNo) classRowsByCatNo.set(catNo, classRows);

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
      classes: formatClassLabels(classRows),
      entryType: entry.entryType,
    });
  }

  return Array.from(byExhibitor.values())
    .sort((a, b) => {
      const surnameCmp = a.sortKey.localeCompare(b.sortKey);
      if (surnameCmp !== 0) return surnameCmp;
      // Same surname falls back to the full heading (so "Smith, John"
      // comes before "Smith, Mary" within the S section).
      return a.name.localeCompare(b.name);
    })
    .map((ex) => ({
      ...ex,
      dogs: ex.dogs.sort((a, b) =>
        a.catalogueNumber.localeCompare(b.catalogueNumber, undefined, { numeric: true }),
      ),
    }));
}

// ── Page chunking (module-scope to avoid re-creation per render) ──

// Chunk threshold. Ringside entries are VERY simple (just cat# +
// dog name in a 2-col grid) so vertical page extent stays small
// per entry — much smaller than by-class's 3-line detail blocks
// that hit the pdfkit coordinate-overflow crash at ~250 entries.
// For ringside we can safely fit a typical championship show
// (180-220 entries) in a single <Page wrap>, which eliminates the
// artificial page breaks Amanda flagged on her 188-entry test.
// Threshold kept below 300 as a safety margin.
const PAGE_ENTRY_THRESHOLD = 250;

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

// ── Advert pages ───────────────────────────────────────────────
// Full-bleed A5 sponsored adverts (Amanda 2026-05-19). One ad = one A5 page.

function AdvertPages({
  adverts,
  position,
}: {
  adverts: CatalogueShowInfo['adverts'];
  position: 'inside_front' | 'inside_back' | 'last_page';
}) {
  const matching = (adverts ?? [])
    .filter((a) => a.position === position && a.imageUrl)
    .toSorted((a, b) => a.sortOrder - b.sortOrder);
  if (matching.length === 0) return null;
  return (
    <>
      {matching.map((ad) => (
        <Page key={`ad-${position}-${ad.id}`} size="A5" style={{ padding: 0, margin: 0 }}>
          <Image src={ad.imageUrl!} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </Page>
      ))}
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────

export function CatalogueRingside({ show, entries, compact }: Props) {
  const allClasses = groupByClass(entries, show);
  const isChampionship = show.showType === 'championship';

  // Build sponsorship lookup keyed on classLabel so JH (JHA/JHB) resolves too.
  const sponsorsByClassLabel = new Map<string, ClassSponsorshipInfo[]>();
  for (const sp of show.classSponsorships ?? []) {
    const label = sp.classLabel ?? (sp.classNumber != null ? String(sp.classNumber) : '');
    if (label) {
      const existing = sponsorsByClassLabel.get(label) ?? [];
      existing.push(sp);
      sponsorsByClassLabel.set(label, existing);
    }
  }

  // Split into sections: Dogs, Bitches, Special Award Classes, Junior Handling
  // (plus a catch-all so a class of an unrecognised shape is never dropped).
  // Special Award classes and Junior Handling each become their OWN section at
  // the end of judging (after the breed classes), each with its judge named —
  // matching the by-class catalogue (Mandy 2026-07-20). Bucketing itself is the
  // shared `sectionClasses` (lib/class-labels.ts) so this can't drift from the
  // Stewards' Catalogue, which uses the same predicate-driven bucketing.
  const bucketed = sectionClasses(allClasses, classGroupToClassLike);
  const classesFor = (key: (typeof bucketed)[number]['key']) =>
    bucketed.find((b) => b.key === key)?.classes ?? [];
  const dogClasses = classesFor('dog');
  const bitchClasses = classesFor('bitch');
  const specialClasses = classesFor('special');
  const jhClasses = classesFor('jh');
  const otherClasses = classesFor('other');

  // Each competition's judge, sourced from the "role — name" display list (same
  // parse as the by-class catalogue so the two can't drift).
  const LABEL_SEP = ' — ';
  const judgeForRole = (test: RegExp): string | null => {
    for (const label of show.judgeDisplayList ?? []) {
      const i = label.indexOf(LABEL_SEP);
      if (i < 0) continue;
      if (test.test(label.slice(0, i))) return label.slice(i + LABEL_SEP.length);
    }
    return null;
  };

  const sections: Section[] = [];
  if (dogClasses.length > 0) sections.push({ key: 'dog', label: 'Dog', classes: dogClasses });
  if (bitchClasses.length > 0) sections.push({ key: 'bitch', label: 'Bitch', classes: bitchClasses });
  if (specialClasses.length > 0) sections.push({ key: 'special', label: 'Special Awards Classes', classes: specialClasses, judge: judgeForRole(/special award/i) });
  if (jhClasses.length > 0) sections.push({ key: 'jh', label: 'Junior Handling', classes: jhClasses, judge: judgeForRole(/junior handl/i) });
  // Safety net only — every real class is Dog/Bitch/Special/JH, so this never
  // renders in practice. It exists so a class of an unrecognised shape is
  // surfaced rather than silently dropped (see `sectionClasses`).
  if (otherClasses.length > 0) sections.push({ key: 'other', label: 'Other Classes', classes: otherClasses });

  // Best Awards now render via the shared BestsWriteInPage (same as the
  // By-Class catalogue), so the old inline split-by-sex computation has been
  // removed (Michael 2026-06-19).

  // Build exhibitor index. No longer chunked — react-pdf wraps
  // the single <Page> naturally so content flows continuously
  // across pages rather than leaving half-empty chunked pages.
  const exhibitors = entries.length > 0 ? buildExhibitorIndex(entries) : [];

  const footerRender = ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
    `${show.name}  ·  Ringside Catalogue  ·  Page ${pageNumber} of ${totalPages}`;

  return (
    <Document title={`Ringside Catalogue — ${show.name}`} author="Remi Show Manager">
      {/* Everything after the cover flows inside a single <Page wrap>
          so front matter and body share pages — a partial front-matter
          page can absorb the start of the body rather than leaving
          trailing whitespace. Cover stays its own Page (different
          styling / branded layout).
          Safety: this relies on total entries staying under pdfkit's
          coordinate-overflow ceiling (~250 entries per wrapped Page).
          Shows above that threshold will need re-chunking — raise a
          diagnostic or fall back to per-section pages if it becomes
          a problem. */}
      <CoverPage show={show} />
      <AdvertPages adverts={show.adverts} position="inside_front" />
      {((show.classSponsorships?.length ?? 0) > 0 || (show.donations?.length ?? 0) > 0) && (
        <TrophiesPage show={show} sponsorships={show.classSponsorships ?? []} />
      )}
      <Page size="A5" style={s.page} wrap>
        <FrontMatterContent show={show} compact={compact} />
        <View style={{ marginTop: 14 }} />
        {sections.map((section, sectionIdx) => {
          const isLastSection = sectionIdx === sections.length - 1;
          const chunkClasses = section.classes;
          return (
            <Fragment key={`section-${section.key}`}>
              <View minPresenceAhead={80}>
                <Text style={s.sexBand}>{section.label}</Text>
                {section.judge && (
                  <Text style={s.sexBandJudge}>Judge: {section.judge}</Text>
                )}
              </View>
              {chunkClasses.map((classGroup, classIdx) => {
              const sorted = sortEntries(classGroup.entries);
              const sps = classGroup.classLabel
                ? sponsorsByClassLabel.get(classGroup.classLabel) ?? []
                : [];
              const sponsorLines = buildSponsorLines(sps);

              // Classes with ≤8 entries stay fully atomic (wrap=false on
              // the whole block so header + entries never split). Larger
              // classes are allowed to wrap across pages — needed for
              // Amanda's "flow continuously regardless of entry count"
              // ask — but the header carries minPresenceAhead so it
              // never orphans at the bottom of a page with no entries
              // below it.
              const keepAtomic = sorted.length <= 8;
              // Keep the class header atomic with its first pair of
              // entries — prevents the "header at page-bottom with no
              // dogs below it" orphan Amanda flagged. The first two
              // rows of a 2-column grid = first 4 entries. If fewer,
              // take what we have.
              const firstEntries = sorted.slice(0, 4);
              const restEntries = sorted.slice(4);
              return (
                <View
                  key={`cls-${section.key}-${classGroup.classLabel || classGroup.className}-${classIdx}`}
                  wrap={!keepAtomic}
                >
                  {/* Header + sponsor lines + first entries kept atomic */}
                  <View wrap={false} minPresenceAhead={keepAtomic ? undefined : 100}>
                    <View style={s.classHeader}>
                      <Text style={s.classHeaderText}>
                        {classGroup.classLabel
                          ? `${classGroup.classLabel}. ${classGroup.className}`
                          : classGroup.className}
                      </Text>
                      <Text style={s.classHeaderCount}>
                        {sorted.length} {sorted.length === 1 ? 'Entry' : 'Entries'}
                      </Text>
                    </View>
                    {sponsorLines.map((line, i) => (
                      <Text key={i} style={s.sponsorLine}>
                        {line}
                      </Text>
                    ))}
                    {firstEntries.length > 0 ? (
                      <View style={s.entriesGrid}>
                        {firstEntries.map((entry, entryIdx) => (
                          <View
                            key={`${classGroup.classLabel || classGroup.className}-${entry.catalogueNumber ?? 'nocat'}-${entryIdx}`}
                            style={s.entryCell}
                          >
                            <Text style={s.entryNumber}>{entry.catalogueNumber ?? '—'}</Text>
                            <Text style={s.entryName}>{displayEntryName(entry)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={s.emptyClass}>No entries</Text>
                    )}
                  </View>

                  {/* Remaining entries flow naturally — can split across pages */}
                  {restEntries.length > 0 && (
                    <View style={s.entriesGrid}>
                      {restEntries.map((entry, entryIdx) => (
                        <View
                          key={`rest-${classGroup.classLabel || classGroup.className}-${entry.catalogueNumber ?? 'nocat'}-${entryIdx}`}
                          style={s.entryCell}
                        >
                          <Text style={s.entryNumber}>{entry.catalogueNumber ?? '—'}</Text>
                          <Text style={s.entryName}>{displayEntryName(entry)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Write-in placement lines */}
                  <View style={s.placementRow} wrap={false}>
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

            </Fragment>
          );
        })}
        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* Best Awards write-in page — the SAME component the By-Class catalogue
          uses, so both formats read identically (Michael 2026-06-19). */}
      <BestsWriteInPage show={show} />

      {/* Not For Competition — NFC dogs carry no class so they'd otherwise
          fall out of the sections entirely (Michael 2026-06-19). */}
      <NotForCompetitionPage entries={entries} />


      {/* Exhibitor Index — full details like the GSD Scotland PDF.
          One <Page wrap> for the whole list; react-pdf handles the
          natural page break when content overflows A5. Per-exhibitor
          <View wrap={false}> below keeps an individual exhibitor
          block from being split mid-name/address. This avoids the
          half-empty trailing pages we were getting when the code
          chunked exhibitors by an arbitrary threshold. */}
      {exhibitors.length > 0 && (
        <Page size="A5" style={s.page} wrap>
          <View style={s.sectionBand}>
            <Text style={s.sectionBandText}>List of Exhibitors</Text>
          </View>

          {exhibitors.map((ex, exIdx) => (
            // Every block is wrappable: without wrap, a block that
            // doesn't fit the remaining page jumps whole and leaves
            // trailing whitespace. react-pdf also fail-fit compresses
            // wrap={false} blocks larger than the page. minPresenceAhead
            // on the name prevents the header from orphaning alone at
            // page bottom. Each dog row is wrap={false} further down so
            // a single dog's lines never split mid-block.
            <View
              key={`${ex.name}-${exIdx}`}
              wrap
              style={{
                marginBottom: compact ? 3 : 6,
                borderBottomWidth: 0.5,
                borderBottomColor: C.ruleLight,
                paddingBottom: compact ? 2 : 4,
              }}
            >
              {compact ? (
                // Single-line exhibitor heading — name + address joined
                // by an em-dash so each exhibitor block opens with one
                // line instead of two. Address still suppressed when the
                // exhibitor opted out of publication via the per-entry
                // withhold flag.
                <Text style={s.exhibitorName} minPresenceAhead={60}>
                  {ex.name}{ex.address ? ` — ${ex.address}` : ''}
                </Text>
              ) : (
                <>
                  <Text style={s.exhibitorName} minPresenceAhead={80}>{ex.name}</Text>
                  {ex.address && <Text style={s.exhibitorAddress}>{ex.address}</Text>}
                </>
              )}

              {/* Each dog */}
              {ex.dogs.map((dog, dogIdx) => {
                const isJH = dog.entryType === 'junior_handler';
                // Detail line — matched to the By-Class catalogue per dog
                // (Michael 2026-06-19): DOB · Dog/Bitch · Sire: … Dam: … ·
                // br Breeder, all title-cased. Replaces the older
                // "By X ex Y" / "D"/"B" form.
                const pedigree = formatPedigreeSireDam(dog.sire, dog.dam);
                const dobStr = dog.dateOfBirth
                  ? formatDobKC(dog.dateOfBirth)
                  : '';
                const detailParts = [
                  dobStr ? `DOB ${dobStr}` : null,
                  dog.sex === 'dog' ? 'Dog' : dog.sex === 'bitch' ? 'Bitch' : null,
                  pedigree,
                  dog.breeder ? `br ${titleCase(dog.breeder)}` : null,
                ].filter(Boolean);

                if (compact) {
                  // One line per dog — cat#, name, then detail + classes
                  // collapsed into a single trailing string. A dog with
                  // 3 classes used to take 3 lines (name, detail, classes);
                  // now it takes 1.
                  const trailing = [
                    !isJH && detailParts.length > 0 ? detailParts.join('  ·  ') : null,
                    dog.classes ? `Class${dog.classes.includes(',') ? 'es' : ''}: ${dog.classes}` : null,
                  ].filter(Boolean).join('  ·  ');
                  return (
                    <View key={`${dog.catalogueNumber}-${dogIdx}`} wrap={false} style={{ marginBottom: 0.8 }}>
                      <Text style={s.exhibitorDogName}>
                        {dog.catalogueNumber ? `${dog.catalogueNumber}. ` : ''}
                        {dog.dogName}
                        {isJH ? ' (Junior Handler)' : ''}
                        {trailing ? ` — ${trailing}` : ''}
                      </Text>
                    </View>
                  );
                }
                return (
                  <View key={`${dog.catalogueNumber}-${dogIdx}`} wrap={false} style={s.exhibitorDogRow}>
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
      )}
      <AdvertPages adverts={show.adverts} position="inside_back" />
      <AdvertPages adverts={show.adverts} position="last_page" />
    </Document>
  );
}
