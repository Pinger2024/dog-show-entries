import { Fragment } from 'react';
import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, C } from './catalogue-styles';
import { CatalogueHeader } from './catalogue-header';
import type { CatalogueEntry, CatalogueShowInfo, ClassSponsorshipInfo } from './catalogue-types';
import { formatDobKC, titleCase, formatOwnerKC, formatRkcOwnerHeading, uppercaseName, buildSponsorLines, isJuniorHandlingClass, formatPedigreeSireDam } from './catalogue-utils';
import { CoverPage, FrontMatterPage, TrophiesPage, ExhibitorIndexPage, BestsWriteInPage, NotForCompetitionPage } from './catalogue-front-matter';
import {
  SvAcknowledgementsPage,
  SvClassificationPage,
  SvJudgesPage,
} from './sv-front-matter';
import { TonalWash } from '@/components/sv-pdf/cover-atoms';
import { SV, SV_FONTS } from '@/components/schedule/shared/sv-styles';

// Class-sponsor banner strip. Renders at the FULL content width (A5 419.5pt −
// 22pt L/R padding = 375.5pt) at the image's own aspect ratio, capped at this
// height (≈ 50mm) so a near-square upload can't dominate the page. Mandy
// 2026-07-15: a fixed 4:1 box forced every sponsor's artwork to one ratio, so
// non-4:1 banners (sponsors send 2.9:1–4:1) had to be stretched in Photoshop
// (elongated dogs) or got cropped. objectFit:contain + no fixed height lets
// each banner sit full-width at its true shape — nothing stretched or chopped.
const BANNER_MAX_HEIGHT = 142;

/**
 * Friendly SV hip/elbow status formatter. Returns one of:
 *   • "Normal" / "Fast Normal" / "Noch Zugelassen"
 *   • "BVA 3-5=8" / "ANKC 0"
 *   • the free-text "other" string when grade='other'
 *   • "Not yet required" when grade is null / 'not_required'
 *     (Amanda 2026-05-23 — make it explicit, don't just drop the line).
 */
function formatHealthSide(
  grade: string | null | undefined,
  score: string | null | undefined,
  other: string | null | undefined,
): string {
  if (!grade || grade === 'not_required') return 'Not yet required';
  if (grade === 'bva') return score ? `BVA ${score}` : 'BVA';
  if (grade === 'ankc') return score ? `ANKC ${score}` : 'ANKC';
  if (grade === 'other') return other ?? 'On file';
  if (grade === 'normal') return 'Normal';
  if (grade === 'fast_normal') return 'Fast Normal';
  if (grade === 'noch_zugelassen') return 'Noch Zugelassen';
  return grade;
}

/** Extract the UK postcode (rough regex — Amanda's data is UK-only) from
 *  a free-form address string. Returns the postcode + everything before
 *  it (the "town" portion). */
function splitTownPostcode(address: string | null | undefined): { town: string; postcode: string } {
  if (!address) return { town: '', postcode: '' };
  const trimmed = address.trim().replace(/\s+/g, ' ');
  // Match a UK postcode at the end of the string.
  const m = trimmed.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\s*$/i);
  if (!m) return { town: trimmed, postcode: '' };
  const postcode = m[1].toUpperCase().replace(/\s+/g, ' ');
  let town = trimmed.slice(0, trimmed.length - m[0].length).trim();
  // Strip trailing commas / stray separators.
  town = town.replace(/[,;\-\s]+$/, '');
  // Take just the last comma-separated segment as the town (drops street etc.).
  const parts = town.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) town = parts[parts.length - 1]!;
  return { town, postcode };
}

// SV entry-row styles. Densified per Amanda 2026-05-23 — page count
// was ~30 for 65 entries, target is the SPGSD norm of ~20-22.
const svEntry = {
  row: { marginTop: 2 } as const,
  line1: { flexDirection: 'row', alignItems: 'baseline', gap: 6 } as const,
  catNumber: {
    fontFamily: SV_FONTS.serif,
    fontSize: 11,
    color: SV.accent,
    width: 20,
  } as const,
  dogName: {
    fontFamily: SV_FONTS.sans,
    fontSize: 8.5,
    fontWeight: 'bold' as const,
    color: SV.ink,
    flexShrink: 1,
  } as const,
  microchip: {
    fontFamily: SV_FONTS.sans,
    fontSize: 7,
    fontWeight: 'bold' as const,
    color: SV.ink,
  } as const,
  meta: {
    fontFamily: SV_FONTS.sans,
    fontSize: 7,
    color: SV.ink2,
    paddingLeft: 26,
    lineHeight: 1.1,
  } as const,
  metaLabel: { fontWeight: 'bold' as const, color: SV.ink } as const,
  pedigree: {
    fontFamily: SV_FONTS.serif,
    fontStyle: 'italic' as const,
    fontSize: 7,
    color: SV.ink2,
    paddingLeft: 26,
    lineHeight: 1.1,
  } as const,
};

// Per-class placings + grading block, written at the FOOT of each class
// (Mandy 2026-06-14 — moved off the right of each dog to match the RKC
// catalogue, and made dynamic to the class size). SV judges place AND
// grade every exhibit, so each slot carries a write-in for the dog and a
// short grade box. Three slots per row keeps the footprint tight.
const svPlacings = {
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 9,
    paddingTop: 7,
    borderTopWidth: 0.5,
    borderTopColor: SV.rule,
  } as const,
  cell: {
    flexDirection: 'row',
    alignItems: 'baseline',
    width: '33%',
    paddingRight: 6,
    // Roomier rows — the write-in slots were cramped (Michael 2026-06-19).
    marginBottom: 9,
  } as const,
  ordinal: {
    fontFamily: SV_FONTS.sans,
    fontSize: 6.5,
    fontWeight: 'bold' as const,
    color: SV.accent,
    width: 20,
  } as const,
  writeIn: {
    fontFamily: SV_FONTS.serif,
    fontStyle: 'italic' as const,
    fontSize: 8,
    color: SV.ink3,
    flex: 1,
  } as const,
  gradeLabel: {
    fontFamily: SV_FONTS.sans,
    fontSize: 5.5,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
    fontWeight: 'bold' as const,
    color: SV.ink3,
    paddingLeft: 2,
  } as const,
  gradeWriteIn: {
    fontFamily: SV_FONTS.serif,
    fontStyle: 'italic' as const,
    fontSize: 8,
    color: SV.ink3,
    width: 16,
    paddingLeft: 2,
  } as const,
};

/** "1st", "2nd", "3rd", "4th"… proper English ordinal for a placing slot. */
function ordinalLabel(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

/** The dynamic SV placings + grading block for a class of `count` dogs. */
function renderSvPlacings(count: number): React.ReactElement {
  return (
    <View style={svPlacings.wrap} wrap={false}>
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
        <View key={n} style={svPlacings.cell}>
          <Text style={svPlacings.ordinal}>{ordinalLabel(n)}</Text>
          <Text style={svPlacings.writeIn}>………</Text>
          <Text style={svPlacings.gradeLabel}>Gr</Text>
          <Text style={svPlacings.gradeWriteIn}>…</Text>
        </View>
      ))}
    </View>
  );
}

function renderSvEntry(
  entry: CatalogueEntry,
  rowKey: string,
): React.ReactElement {
  const titlesStr = entry.titles && entry.titles.length > 0 ? entry.titles.join(', ') : null;
  const hip = formatHealthSide(
    entry.svProfile?.hipGrade,
    entry.svProfile?.hipScore,
    entry.svProfile?.hipScoreOther,
  );
  const elbow = formatHealthSide(
    entry.svProfile?.elbowGrade,
    entry.svProfile?.elbowScore,
    entry.svProfile?.elbowScoreOther,
  );
  const dob = entry.dateOfBirth ? formatDobKC(entry.dateOfBirth) : null;

  // Breeder town+postcode — prefer the structured columns when populated.
  const breederTown = entry.breederCity ?? '';
  const breederPostcode = entry.breederPostcode ?? '';
  const breederParts = [entry.breeder, breederTown, breederPostcode].filter(Boolean);

  // Owner line — compound surname heading (DODDS & SWIFT, MR N & MS A)
  // followed by town + postcode extracted from the primary owner's
  // address. We use formatRkcOwnerHeading directly so we DON'T pull in
  // the full street address that formatOwnerKC would append.
  const ownersHeading = formatRkcOwnerHeading(
    entry.owners.map((o) => ({ title: o.title ?? null, name: o.name })),
  );
  const primaryOwnerAddr = entry.withholdFromPublication
    ? { town: 'address withheld', postcode: '' }
    : splitTownPostcode(entry.owners[0]?.address);

  // Vitals — Reg · DOB · Hips · Elbows · Titles all on ONE line now that
  // the Place/Grade write-in has moved to the foot of the class
  // (Mandy 2026-06-14 — fewer lines per dog, smaller catalogue pages).
  // Hips/Elbows always show (formatHealthSide returns "Not yet required").
  const vitals: Array<{ label: string; value: string }> = [];
  if (entry.kcRegNumber) vitals.push({ label: 'Reg', value: entry.kcRegNumber });
  if (dob) vitals.push({ label: 'DOB', value: dob });
  vitals.push({ label: 'Hips', value: hip });
  vitals.push({ label: 'Elbows', value: elbow });
  if (titlesStr) vitals.push({ label: 'Titles', value: titlesStr });

  return (
    <View key={rowKey} style={svEntry.row} wrap={false}>
      {/* Line 1 — cat# · DOG NAME (bold) · microchip (bold). The chip
          number sits on the name line because WUSV/GSDL require every
          exhibit's microchip published prominently (Amanda 2026-05-28). */}
      <View style={svEntry.line1}>
        <Text style={svEntry.catNumber}>{entry.catalogueNumber ?? '—'}</Text>
        <Text style={svEntry.dogName}>{uppercaseName(entry.dogName) || 'Unnamed'}</Text>
        {entry.microchipNumber ? (
          <Text style={svEntry.microchip}>· Chip {entry.microchipNumber}</Text>
        ) : null}
      </View>

      {/* Line 2 — vitals: Reg · DOB · Hips · Elbows · Titles */}
      <Text style={svEntry.meta}>
        {vitals.map((v, i) => (
          <Text key={i}>
            {i > 0 ? '   ·   ' : ''}
            <Text style={svEntry.metaLabel}>{v.label} </Text>
            {v.value}
          </Text>
        ))}
      </Text>

      {/* Line 3 — Sire · Dam */}
      {(entry.sire || entry.dam) && (
        <Text style={svEntry.pedigree}>
          {entry.sire ? (
            <>
              <Text style={svEntry.metaLabel}>Sire </Text>
              {entry.sire}
            </>
          ) : null}
          {entry.sire && entry.dam ? '    ·    ' : ''}
          {entry.dam ? (
            <>
              <Text style={svEntry.metaLabel}>Dam </Text>
              {entry.dam}
            </>
          ) : null}
        </Text>
      )}

      {/* Line 4 — Breeder + Owner on one line, separated by a centred dot
          (Amanda 2026-05-23 — saves a row per entry, page is denser). */}
      {(breederParts.length > 0 || ownersHeading) && (
        <Text style={svEntry.meta}>
          {breederParts.length > 0 && (
            <>
              <Text style={svEntry.metaLabel}>Breeder </Text>
              {breederParts.join(', ')}
            </>
          )}
          {breederParts.length > 0 && ownersHeading ? '    ·    ' : ''}
          {ownersHeading && (
            <>
              <Text style={svEntry.metaLabel}>
                Owner{entry.owners.length > 1 ? 's' : ''}{' '}
              </Text>
              {ownersHeading}
              {primaryOwnerAddr.town || primaryOwnerAddr.postcode
                ? `, ${[primaryOwnerAddr.town, primaryOwnerAddr.postcode].filter(Boolean).join(', ')}`
                : ''}
            </>
          )}
        </Text>
      )}
    </View>
  );
}

interface Props {
  show: CatalogueShowInfo;
  entries: CatalogueEntry[];
  /**
   * Compact mode: tightens front-matter spacing, drops the standalone
   * "List of Judges" page (judges already named on the cover and inside
   * Show Particulars), and renders the back-of-book exhibitor index as
   * a single-line cross-reference rather than a 3-column table. Saves
   * ~3-5 pages per catalogue depending on entry count. Defaults to
   * false so existing callers see no change in behaviour.
   */
  compact?: boolean;
}

// Group entries by class, preserving sort metadata.
// Uses classLabel (then classNumber) as the unique key so that dog and
// bitch classes with the same definition name stay separate, and so that
// JH classes (which all share classNumber=null) don't collapse together.
function groupByClass(entries: CatalogueEntry[]) {
  const classes: Record<string, {
    className: string;
    sex: string | null | undefined;
    classNumber: number | null | undefined;
    classLabel: string;
    sortOrder: number | undefined;
    svCoatType?: 'stock' | 'long_stock' | null;
    entries: CatalogueEntry[];
  }> = {};

  for (const entry of entries) {
    for (const cls of entry.classes) {
      const className = cls.name ?? 'Unknown Class';
      const label = cls.classLabel ?? (cls.classNumber != null ? String(cls.classNumber) : '');
      const classKey = label
        ? `lbl:${label}`
        : `name:${className}-${cls.sex ?? 'any'}`;
      classes[classKey] ??= {
        className,
        sex: cls.sex,
        classNumber: cls.classNumber,
        classLabel: label,
        sortOrder: cls.sortOrder,
        svCoatType: cls.svCoatType ?? null,
        entries: [],
      };
      classes[classKey].entries.push(entry);
    }
  }

  return classes;
}

/** Full-width green section band with the section's judge named beneath. Sets
 *  the Special Award Classes and Junior Handling groups apart from the breed
 *  classes in the by-class catalogue, matching the front-matter section bands
 *  (Mandy 2026-07-20). `styles.sectionBand` carries a -20 top margin to bleed
 *  into a page's top padding; neutralised here since this band sits mid-flow.
 *  `minPresenceAhead` stops it stranding at the foot of a page. */
function ClassSectionBand({ title, judge }: { title: string; judge: string | null }) {
  return (
    <View wrap={false} minPresenceAhead={90} style={{ marginTop: 12 }}>
      <View style={{ ...styles.sectionBand, marginTop: 0, marginBottom: judge ? 3 : 8 }}>
        <Text style={styles.sectionBandText}>{title}</Text>
      </View>
      {judge && (
        <Text style={{ fontFamily: 'Inter', fontSize: 8.5, fontStyle: 'italic', color: C.textMedium, textAlign: 'center', marginBottom: 6 }}>
          Judge: {judge}
        </Text>
      )}
    </View>
  );
}

export function CatalogueByClass({ show, entries, compact }: Props) {
  const isSvShow = show.showRuleset === 'wusv';
  // Build a lookup: classLabel -> sponsorship info (array, since one class
  // can have multiple sponsors — e.g. one for the trophy and another for
  // the rosettes). Keyed on label rather than classNumber so that JH class
  // sponsorships (classNumber=null, classLabel='JHA') still resolve.
  const sponsorsByClassLabel = new Map<string, ClassSponsorshipInfo[]>();
  for (const sp of show.classSponsorships ?? []) {
    const label = sp.classLabel ?? (sp.classNumber != null ? String(sp.classNumber) : '');
    if (label) {
      const existing = sponsorsByClassLabel.get(label) ?? [];
      existing.push(sp);
      sponsorsByClassLabel.set(label, existing);
    }
  }

  const grouped = groupByClass(entries);

  // Inject empty classes from allShowClasses that have no entries
  if (show.allShowClasses) {
    const existingKeys = new Set(Object.keys(grouped));
    for (const sc of show.allShowClasses) {
      const label = sc.classLabel ?? (sc.classNumber != null ? String(sc.classNumber) : '');
      const classKey = label
        ? `lbl:${label}`
        : `name:${sc.className}-${sc.sex ?? 'any'}`;
      if (!existingKeys.has(classKey)) {
        grouped[classKey] = {
          className: sc.className,
          sex: sc.sex,
          classNumber: sc.classNumber,
          classLabel: label,
          sortOrder: sc.sortOrder,
          svCoatType: sc.svCoatType ?? null,
          entries: [],
        };
      } else if (grouped[classKey].svCoatType == null && sc.svCoatType) {
        grouped[classKey].svCoatType = sc.svCoatType;
      }
    }
  }

  // Sort: numbered classes first (by classNumber), then unnumbered (JH etc)
  // by classLabel, then sortOrder, then alphabetically for stability.
  // Junior Handling is a separate competition and always sits at the very end
  // of the class body — after every breed class, Veteran included — to match
  // the Standard catalogue (which lists JH as its own section). Uses the shared
  // isJuniorHandlingClass predicate so the two catalogues agree. The demo show
  // happened to schedule JHA mid-list; this keeps the breed classes in their
  // scheduled order and just floats JH last (Michael 2026-06-19). No-op for
  // shows that already schedule JH last (e.g. BAGSD). Flag precomputed once per
  // class rather than re-deriving inside the O(n log n) comparator.
  const jhFlag: Record<string, 0 | 1> = {};
  for (const key of Object.keys(grouped)) {
    jhFlag[key] = isJuniorHandlingClass(grouped[key].className, grouped[key].sex) ? 1 : 0;
  }
  const classKeys = Object.keys(grouped).sort((a, b) => {
    if (jhFlag[a] !== jhFlag[b]) return jhFlag[a] - jhFlag[b];
    const aNum = grouped[a].classNumber;
    const bNum = grouped[b].classNumber;
    if (aNum != null && bNum != null) return aNum - bNum;
    if (aNum != null) return -1;
    if (bNum != null) return 1;
    const aLbl = grouped[a].classLabel;
    const bLbl = grouped[b].classLabel;
    if (aLbl && bLbl) return aLbl.localeCompare(bLbl);
    const aSort = grouped[a].sortOrder ?? 0;
    const bSort = grouped[b].sortOrder ?? 0;
    if (aSort !== bSort) return aSort - bSort;
    return a.localeCompare(b);
  });

  // Section headers for the two competitions that sit apart from the breed
  // classes — Special Award Classes and Junior Handling — each with its own
  // judge named beneath (Mandy 2026-07-20). The sort above already clusters the
  // special-award classes after the numbered breed classes and floats JH last,
  // so we just mark where each group starts and drop a band in front of it.
  const LABEL_SEP = ' — '; // " — " em-dash separator in judgeDisplayList
  const judgeForRole = (test: RegExp): string | null => {
    for (const label of show.judgeDisplayList ?? []) {
      const i = label.indexOf(LABEL_SEP);
      if (i < 0) continue;
      if (test.test(label.slice(0, i))) return label.slice(i + LABEL_SEP.length);
    }
    return null;
  };
  const specialAwardsJudge = judgeForRole(/special award/i);
  const juniorHandlingJudge = judgeForRole(/junior handl/i);
  const firstSpecialKey = classKeys.find(
    (k) => jhFlag[k] === 0 && /special award/i.test(grouped[k].className),
  );
  const firstJhKey = classKeys.find((k) => jhFlag[k] === 1);

  // pdfkit underflows coordinates inside clipBorderTop once a wrapped
  // <Page> accumulates too many layout nodes (error:
  // "unsupported number -9.979e+21"). The node count depends on
  // class + entry + sponsor rows, not just entry count. Empirically:
  //   - 82 entries / 20 classes / no sponsors → safe
  //   - 90 entries / ~24 classes / ~15 sponsors → crash
  //   - 117 entries / ~30 classes / sponsors → crash
  //   - 187 entries split across chunks (each ~93) → safe (fewer
  //     classes-per-chunk keeps node count down)
  // 80 is conservative enough to survive sponsorship-heavy shows
  // without turning every chunk into one tiny Page.
  // SV entries take more vertical space than RKC (extra health line +
  // pedigree line). After densification (Amanda 2026-05-23) each entry
  // fits in ~4 lines so we can pack more per chunk; bumped 40 → 60.
  // Keep below the 80 ceiling to avoid the react-pdf `-9.979e+21` crash.
  // Lower SV threshold once banners are in play — banner Image nodes
  // bump the per-page node count and trigger the react-pdf
  // `-9.979e+21` crash when chunks get too big (Amanda 2026-05-24, after
  // uploading banners to several classes on the Midland show).
  // Weight each class by its entries PLUS its sponsor rows — the crash above
  // scales with entries + sponsors, not entries alone (see the data points), so
  // counting sponsors lets sponsor-light shows pack into ONE chunk (no wasted
  // page at the boundary) while sponsor-heavy ones still break early. RKC bumped
  // 80 → 95: BAGSD (~87 entries / 5 sponsors = 92) now renders in a single chunk
  // — Veteran no longer strands a near-empty page before Junior Handling
  // (Michael/Mandy 2026-06-19). SV stays 50 (banner Image nodes are heavier).
  const PAGE_ENTRY_THRESHOLD = isSvShow ? 50 : 95;
  const classChunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentCount = 0;
  for (const classKey of classKeys) {
    const g = grouped[classKey];
    const weight =
      g.entries.length +
      (g.classLabel ? sponsorsByClassLabel.get(g.classLabel)?.length ?? 0 : 0);
    // Start a new chunk if adding this class would exceed the threshold
    // (but always put at least one class per chunk, even if it's large)
    if (currentChunk.length > 0 && currentCount + weight > PAGE_ENTRY_THRESHOLD) {
      classChunks.push(currentChunk);
      currentChunk = [];
      currentCount = 0;
    }
    currentChunk.push(classKey);
    currentCount += weight;
  }
  if (currentChunk.length > 0) classChunks.push(currentChunk);

  return (
    <Document>
      {/* Front matter — cover, show info, judges, definitions, trophies.
          The exhibitor index lives at the back of the catalogue (backlog
          #93) since exhibitors look up their own catalogue numbers more
          often than they read alphabetical reference indexes. */}
      <CoverPage show={show} />
      <AdvertPages adverts={show.adverts} position="inside_front" />
      {/* SV catalogues use their own front-matter set (acknowledgements,
          breed classification, judges bios, BRG points system) — all on
          the SV palette so the document reads as one piece front-to-back
          (Amanda 2026-05-23). RKC catalogues keep the existing
          FrontMatterPage + TrophiesPage. */}
      {isSvShow ? (
        <>
          <SvAcknowledgementsPage show={show} />
          <SvClassificationPage show={show} />
          <SvJudgesPage show={show} />
        </>
      ) : (
        <>
          <FrontMatterPage show={show} compact={compact} />
          {!compact && ((show.classSponsorships?.length ?? 0) > 0 || (show.donations?.length ?? 0) > 0) && (
            <TrophiesPage show={show} sponsorships={show.classSponsorships ?? []} />
          )}
        </>
      )}

      {classChunks.map((chunkKeys, chunkIdx) => (
      <Page
        key={`chunk-${chunkIdx}`}
        size="A5"
        // SV catalogue inside pages get the bone-paper background so the
        // tonal wash sitting behind them is visible. RKC pages stay on
        // white per the existing styles.page.
        style={isSvShow ? { ...styles.page, backgroundColor: '#faf6ee' } : styles.page}
        wrap
      >
      {isSvShow && <TonalWash variant="inside" buffer={show.svWashes?.inside} />}
      {chunkKeys.map((classKey, idx) => {
        const { className, sex, classLabel, svCoatType, entries: classEntries } = grouped[classKey];
        const sorted = [...classEntries].sort(
          (a, b) => (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true })
        );
        // All classes can break across pages — page packing wins over
        // keeping classes atomic. Amanda 2026-05-26: "I don't think it
        // would create an orphaned banner ... I'd like to maximise our
        // profit as much as possible" (fewer pages = lower print cost).
        const keepTogether = false;
        // When a class sponsor has uploaded a banner image the banner
        // already advertises who's sponsoring, so the "Sponsored by …"
        // text caption is redundant under it (Amanda 2026-05-27).
        // The text caption stays for SV classes WITHOUT a banner and
        // for every RKC class (which never get banners).
        const hasBanner = isSvShow && !!classLabel
          && (sponsorsByClassLabel.get(classLabel)?.some((s) => s.bannerImageUrl) ?? false);

        // Render one entry — extracted so we can render the FIRST
        // entry inside the wrap=false header block (keeping header
        // and first dog atomic, per Amanda) and the rest as a
        // normal flowing list.
        const renderEntry = (entry: typeof classEntries[number], entryIdx: number) => {
          const isJH = entry.entryType === 'junior_handler';
          const rowKey = `${classKey}-${entry.catalogueNumber ?? 'nocat'}-${entryIdx}`;
          // SV shows use Amanda's 5-line layout with the SV palette and
          // serif typography (2026-05-23). JH classes still render
          // their handler-name shape regardless of ruleset.
          if (isSvShow && !isJH) {
            return renderSvEntry(entry, rowKey);
          }
          if (isJH) {
            const handlerName = entry.jhHandlerName ?? entry.exhibitor ?? 'Unnamed Handler';
            return (
              <View key={rowKey} style={styles.entryRowWrap} wrap={false}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={styles.catalogueNumber}>{entry.catalogueNumber ?? '—'}</Text>
                  <Text style={styles.dogName}>{handlerName}</Text>
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
                    {formatOwnerKC(entry.owners, entry.withholdFromPublication)}
                  </Text>
                )}
              </View>
            );
          }
          // Pedigree as "Sire: <sire>  Dam: <dam>" (Mandy 2026-06-16) — shared
          // with the Standard catalogue so the two can't drift on wording.
          const pedigree = formatPedigreeSireDam(entry.sire, entry.dam);
          // Registration number and colour are intentionally omitted from the
          // RKC by-class catalogue entry line (Amanda 2026-06-08). (SV/WUSV
          // catalogues keep them — see renderSvEntry, which is a separate path.)
          const metaParts = [
            entry.dateOfBirth ? `DOB ${formatDobKC(entry.dateOfBirth)}` : null,
            entry.sex === 'dog' ? 'Dog' : entry.sex === 'bitch' ? 'Bitch' : null,
            pedigree,
            entry.breeder ? `br ${titleCase(entry.breeder)}` : null,
          ].filter(Boolean);
          return (
            <View key={rowKey} style={styles.entryRowWrap} wrap={false}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={styles.catalogueNumber}>{entry.catalogueNumber ?? '—'}</Text>
                <Text style={styles.dogName}>{uppercaseName(entry.dogName) || 'Unnamed'}</Text>
              </View>
              {metaParts.length > 0 && (
                <Text style={styles.entryDetail}>{metaParts.join('  ·  ')}</Text>
              )}
              {entry.owners.length > 0 && (
                <Text style={styles.entryDetail}>
                  <Text style={styles.entryDetailLabel}>
                    Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                  </Text>
                  {formatOwnerKC(entry.owners, entry.withholdFromPublication)}
                </Text>
              )}
            </View>
          );
        };

        return (
          <Fragment key={classKey}>
            {classKey === firstSpecialKey && (
              <ClassSectionBand title="Special Awards Classes" judge={specialAwardsJudge} />
            )}
            {classKey === firstJhKey && (
              <ClassSectionBand title="Junior Handling" judge={juniorHandlingJudge} />
            )}
          <View
            wrap={!keepTogether}
            style={idx > 0 ? { marginTop: 4 } : undefined}
          >

            {/* Header block kept atomic with the FIRST entry so the
                banner + class header never lands at the bottom of a
                page with no dog underneath — Amanda 2026-05-27:
                "I defo dont want the banner and class name on one
                page without having 1 dog immediately underneath it
                as it doesnt look correct." (Earlier on 2026-05-26
                we'd dropped this constraint chasing tighter page
                packing; the visual cost was worse than the page
                saving so we're back to the atomic block.) */}
            <View wrap={false}>
              {/* Class-sponsor banner — landscape strip above the class
                  header when a class sponsor has uploaded a banner image
                  (HUNDARK / ROBASDAN-style festive strips). SV/WUSV
                  shows only per Amanda 2026-05-23 ("I don't want this
                  for RKC shows yet"). */}
              {isSvShow && (() => {
                const banner = classLabel && sponsorsByClassLabel.has(classLabel)
                  ? sponsorsByClassLabel.get(classLabel)!.find((s) => s.bannerImageUrl)?.bannerImageUrl ?? null
                  : null;
                if (!banner) return null;
                return (
                  // Full-width sponsor banner at the image's OWN aspect ratio.
                  // Fills the full content width (A5 419.5pt − 22pt L/R padding
                  // = 375.5pt); height follows the image, capped at
                  // BANNER_MAX_HEIGHT (≈50mm). objectFit:contain guarantees no
                  // stretch and no crop — sponsors' banners come in varied
                  // shapes (2.9:1–4:1) and each sits full-width at its true
                  // proportions. wrap={false} stops it splitting across a page.
                  <View
                    wrap={false}
                    style={{
                      width: '100%',
                      marginBottom: 5,
                    }}
                  >
                    <Image
                      src={banner}
                      style={{ width: '100%', maxHeight: BANNER_MAX_HEIGHT, objectFit: 'contain' }}
                    />
                  </View>
                );
              })()}
              {isSvShow ? (() => {
                // Amanda 2026-05-23: drop "SV " prefix from class names and
                // surface the coat type in the header — "Class 9b · Adult
                // Bitch · Long Stock Coat". Coat type comes from the
                // show_classes.sv_coat_type column, not from label-suffix
                // guessing (some demos use sequential numeric labels).
                const cleanName = className.replace(/^SV\s+/, '');
                const sexWord = sex === 'dog' ? 'Dog' : sex === 'bitch' ? 'Bitch' : null;
                const coatLabel = svCoatType === 'stock'
                  ? 'Stock Coat'
                  : svCoatType === 'long_stock'
                    ? 'Long Stock Coat'
                    : classLabel?.endsWith('a')
                      ? 'Stock Coat'
                      : classLabel?.endsWith('b')
                        ? 'Long Stock Coat'
                        : null;
                const headParts = [
                  classLabel ? `Class ${classLabel}` : null,
                  sexWord ? `${cleanName} ${sexWord}` : cleanName,
                  coatLabel,
                ].filter(Boolean) as string[];
                return (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: SV.ink,
                      borderBottomWidth: 0.5,
                      borderBottomColor: SV.rule,
                      paddingTop: 3,
                      paddingBottom: 2,
                      marginTop: 2,
                    }}
                  >
                    <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 12, fontWeight: 'bold', color: SV.ink }}>
                      {headParts.join('  ·  ')}
                    </Text>
                  </View>
                );
              })() : (
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...styles.groupHeading }}
                >
                  <Text style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 'bold', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    {classLabel ? `Class ${classLabel}: ${className}` : className}
                  </Text>
                  {sex && (
                    <Text style={{ fontFamily: 'Inter', fontSize: 9, fontStyle: 'italic', color: '#fff' }}>
                      ({sex === 'dog' ? 'Dogs' : sex === 'bitch' ? 'Bitches' : 'Open'})
                    </Text>
                  )}
                </View>
              )}
              {classLabel && sponsorsByClassLabel.has(classLabel) && !hasBanner &&
                buildSponsorLines(sponsorsByClassLabel.get(classLabel)!).map((line, i) => (
                  <Text
                    key={i}
                    style={
                      isSvShow
                        ? {
                            fontFamily: SV_FONTS.serif,
                            fontStyle: 'italic',
                            fontSize: 8,
                            color: SV.accent,
                            marginTop: 2,
                            paddingLeft: 30,
                          }
                        : styles.sponsorLine
                    }
                  >
                    {line}
                  </Text>
                ))}

              {!isSvShow && (
                <Text style={styles.classEntryCount}>
                  {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
                </Text>
              )}

              {sorted.length > 0 && renderEntry(sorted[0], 0)}
            </View>

            {sorted.slice(1).map((entry, sliceIdx) => renderEntry(entry, sliceIdx + 1))}

            {/* Placements write-in row.
                • RKC: 1st / 2nd / 3rd / Res / VHC (Amanda 2026-05-14).
                • SV/WUSV: a placing + grade slot per dog in the class,
                  dynamic to the class size, written at the FOOT of the
                  class like the RKC shows (Mandy 2026-06-14 — moved off
                  the right of each dog; SV judges place AND grade every
                  exhibit). */}
            {sorted.length > 0 && !isSvShow && (
              <View style={styles.placementsRow} wrap={false}>
                {['1st', '2nd', '3rd', 'Res', 'VHC'].map((lbl) => (
                  <View key={lbl} style={styles.placementSlot}>
                    <Text style={styles.placementSlotLabel}>{lbl}</Text>
                    <View style={styles.placementSlotLine} />
                  </View>
                ))}
              </View>
            )}
            {sorted.length > 0 && isSvShow && renderSvPlacings(sorted.length)}

          </View>
          </Fragment>
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

      {/* Back matter. SV catalogues keep their own structure (owner +
          results details already live on each SV entry line), so the RKC
          back-of-book pages are skipped for them. Order: principal-awards
          write-in (results, straight after the last class) → Not For
          Competition list → exhibitor index. */}
      {!isSvShow && <BestsWriteInPage show={show} />}
      {!isSvShow && <NotForCompetitionPage entries={entries} />}
      {!isSvShow && (
        <ExhibitorIndexPage show={show} entries={entries} compact={compact} />
      )}
      <AdvertPages adverts={show.adverts} position="inside_back" />
      <AdvertPages adverts={show.adverts} position="last_page" />
    </Document>
  );
}

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
