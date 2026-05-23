import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { styles } from './catalogue-styles';
import { CatalogueHeader } from './catalogue-header';
import type { CatalogueEntry, CatalogueShowInfo, ClassSponsorshipInfo } from './catalogue-types';
import { formatDobKC, formatPedigreeKC, formatOwnerKC, formatRkcOwnerHeading, uppercaseName, buildSponsorLines } from './catalogue-utils';
import { CoverPage, FrontMatterPage, TrophiesPage, ExhibitorIndexPage } from './catalogue-front-matter';
import { TonalWash } from '@/components/sv-pdf/cover-atoms';
import { SV, SV_FONTS } from '@/components/schedule/shared/sv-styles';

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

// SV entry-row styles. Kept inline because they're only used by the SV
// branch of CatalogueByClass — easier to read here than in a separate
// stylesheet file, and they live on the SV palette (sv-styles.ts).
const svEntry = {
  row: { marginBottom: 6 } as const,
  line1: { flexDirection: 'row', alignItems: 'baseline', gap: 6 } as const,
  catNumber: {
    fontFamily: SV_FONTS.serif,
    fontSize: 14,
    color: SV.accent,
    width: 24,
  } as const,
  dogName: {
    fontFamily: SV_FONTS.sans,
    fontSize: 9,
    fontWeight: 'bold' as const,
    color: SV.ink,
    flexShrink: 1,
  } as const,
  microchip: {
    fontFamily: SV_FONTS.sans,
    fontSize: 8,
    fontWeight: 'bold' as const,
    color: SV.ink,
  } as const,
  meta: {
    fontFamily: SV_FONTS.sans,
    fontSize: 8,
    color: SV.ink2,
    paddingLeft: 30,
    marginTop: 0.5,
    lineHeight: 1.35,
  } as const,
  metaLabel: { fontWeight: 'bold' as const, color: SV.ink } as const,
  pedigree: {
    fontFamily: SV_FONTS.serif,
    fontStyle: 'italic' as const,
    fontSize: 8,
    color: SV.ink2,
    paddingLeft: 30,
    marginTop: 0.5,
    lineHeight: 1.35,
  } as const,
};

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

  return (
    <View key={rowKey} style={svEntry.row} wrap={false}>
      {/* Line 1 — cat# · DOG NAME (bold) · KC reg · ID microchip (bold) */}
      <View style={svEntry.line1}>
        <Text style={svEntry.catNumber}>{entry.catalogueNumber ?? '—'}</Text>
        <Text style={svEntry.dogName}>{uppercaseName(entry.dogName) || 'Unnamed'}</Text>
      </View>
      <Text style={svEntry.meta}>
        {entry.kcRegNumber ? (
          <>
            <Text style={svEntry.metaLabel}>Reg </Text>
            {entry.kcRegNumber}
          </>
        ) : null}
        {entry.kcRegNumber && entry.microchipNumber ? '   ·   ' : ''}
        {entry.microchipNumber ? (
          <>
            <Text style={svEntry.metaLabel}>ID {entry.microchipNumber}</Text>
          </>
        ) : null}
        {dob && (entry.kcRegNumber || entry.microchipNumber) ? '   ·   ' : ''}
        {dob ? <>DOB {dob}</> : null}
      </Text>

      {/* Line 2 — Hip · Elbow · Titles */}
      <Text style={svEntry.meta}>
        <Text style={svEntry.metaLabel}>Hips </Text>
        {hip}
        {'   ·   '}
        <Text style={svEntry.metaLabel}>Elbows </Text>
        {elbow}
        {titlesStr ? (
          <>
            {'   ·   '}
            <Text style={svEntry.metaLabel}>Titles </Text>
            {titlesStr}
          </>
        ) : null}
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

      {/* Line 4 — Breeder, Town, Postcode */}
      {breederParts.length > 0 && (
        <Text style={svEntry.meta}>
          <Text style={svEntry.metaLabel}>Breeder </Text>
          {breederParts.join(', ')}
        </Text>
      )}

      {/* Line 5 — Owner, Town, Postcode */}
      {ownersHeading && (
        <Text style={svEntry.meta}>
          <Text style={svEntry.metaLabel}>
            Owner{entry.owners.length > 1 ? 's' : ''}{' '}
          </Text>
          {ownersHeading}
          {primaryOwnerAddr.town || primaryOwnerAddr.postcode
            ? `, ${[primaryOwnerAddr.town, primaryOwnerAddr.postcode].filter(Boolean).join(', ')}`
            : ''}
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
        entries: [],
      };
      classes[classKey].entries.push(entry);
    }
  }

  return classes;
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
          entries: [],
        };
      }
    }
  }

  // Sort: numbered classes first (by classNumber), then unnumbered (JH etc)
  // by classLabel, then sortOrder, then alphabetically for stability.
  const classKeys = Object.keys(grouped).sort((a, b) => {
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
  // SV entries take more vertical space (5-line layout instead of 3),
  // so we chunk more aggressively to keep each Page under react-pdf's
  // node-count ceiling. Otherwise we hit `-9.979e+21` on bigger shows.
  const PAGE_ENTRY_THRESHOLD = isSvShow ? 40 : 80;
  const classChunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentCount = 0;
  for (const classKey of classKeys) {
    const entryCount = grouped[classKey].entries.length;
    // Start a new chunk if adding this class would exceed the threshold
    // (but always put at least one class per chunk, even if it's large)
    if (currentChunk.length > 0 && currentCount + entryCount > PAGE_ENTRY_THRESHOLD) {
      classChunks.push(currentChunk);
      currentChunk = [];
      currentCount = 0;
    }
    currentChunk.push(classKey);
    currentCount += entryCount;
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
      <FrontMatterPage show={show} compact={compact} />
      {!show.skipTrophiesPage && !compact && (
        <TrophiesPage show={show} sponsorships={show.classSponsorships ?? []} />
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
        const { className, sex, classLabel, entries: classEntries } = grouped[classKey];
        const sorted = [...classEntries].sort(
          (a, b) => (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true })
        );
        // Small classes (≤ 8 entries) stay atomic — never split the header
        // from its entries. Larger classes can break across pages if needed.
        // Amanda's feedback: "just dont want a class broken up like that
        // unless its a big class that takes up more than one page".
        const keepTogether = sorted.length <= 8;

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
                    {formatOwnerKC(entry.owners, entry.exhibitorId, entry.withholdFromPublication)}
                  </Text>
                )}
              </View>
            );
          }
          const pedigree = formatPedigreeKC(entry.sire, entry.dam);
          const metaParts = [
            entry.kcRegNumber,
            // SV regional catalogues print the microchip / ID alongside
            // the KC reg number (Amanda 2026-05-22).
            isSvShow && entry.microchipNumber ? `ID ${entry.microchipNumber}` : null,
            entry.dateOfBirth ? `DOB ${formatDobKC(entry.dateOfBirth)}` : null,
            entry.colour,
            entry.sex === 'dog' ? 'Dog' : entry.sex === 'bitch' ? 'Bitch' : null,
            pedigree,
            entry.breeder ? `br ${entry.breeder}` : null,
          ].filter(Boolean);
          const svHealth = isSvShow ? formatSvHealth(entry.svProfile ?? null) : null;
          return (
            <View key={rowKey} style={styles.entryRowWrap} wrap={false}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={styles.catalogueNumber}>{entry.catalogueNumber ?? '—'}</Text>
                <Text style={styles.dogName}>{uppercaseName(entry.dogName) || 'Unnamed'}</Text>
              </View>
              {metaParts.length > 0 && (
                <Text style={styles.entryDetail}>{metaParts.join('  ·  ')}</Text>
              )}
              {svHealth ? (
                <Text style={styles.entryDetail}>
                  <Text style={styles.entryDetailLabel}>Health: </Text>
                  {svHealth}
                </Text>
              ) : null}
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
        };

        return (
          <View
            key={classKey}
            wrap={!keepTogether}
            style={idx > 0 ? { marginTop: 6 } : undefined}
          >

            {/* Header block kept atomic with the FIRST entry so we
                never orphan a class heading at the bottom of a page
                with the dogs starting fresh on the next. Per Amanda:
                "if there is a dog displayed immediately under the
                classification … but it doesn't look right" without.
                SV variant drops the green Remi band and uses the SV
                palette to match the schedule (Michael 2026-05-23). */}
            <View wrap={false}>
              {isSvShow ? (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    borderTopWidth: 1,
                    borderTopColor: SV.ink,
                    borderBottomWidth: 0.5,
                    borderBottomColor: SV.rule,
                    paddingTop: 5,
                    paddingBottom: 3,
                    marginTop: 4,
                  }}
                >
                  <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 14, color: SV.ink }}>
                    {classLabel ? `Class ${classLabel}` : ''}
                    {classLabel && className ? '  ·  ' : ''}
                    <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 11, color: SV.ink }}>
                      {className}
                    </Text>
                  </Text>
                  {sex && (
                    <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 10, color: SV.accent }}>
                      {sex === 'dog' ? 'Dogs' : sex === 'bitch' ? 'Bitches' : 'Open'}
                    </Text>
                  )}
                </View>
              ) : (
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...styles.groupHeading }}
                >
                  <Text>{classLabel ? `Class ${classLabel}: ${className}` : className}</Text>
                  {sex && (
                    <Text style={{ fontSize: 9, fontStyle: 'italic', color: '#fff' }}>
                      ({sex === 'dog' ? 'Dogs' : sex === 'bitch' ? 'Bitches' : 'Open'})
                    </Text>
                  )}
                </View>
              )}
              {classLabel && sponsorsByClassLabel.has(classLabel) &&
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

              <Text
                style={
                  isSvShow
                    ? {
                        fontFamily: SV_FONTS.sans,
                        fontSize: 7,
                        color: SV.ink3,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        marginTop: 3,
                        marginBottom: 4,
                        paddingLeft: 30,
                      }
                    : styles.classEntryCount
                }
              >
                {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
              </Text>

              {sorted.length > 0 && renderEntry(sorted[0], 0)}
            </View>

            {sorted.slice(1).map((entry, sliceIdx) => renderEntry(entry, sliceIdx + 1))}

            {/* Placements write-in row.
                • RKC: 1st / 2nd / 3rd / Res / VHC (Amanda 2026-05-14).
                • SV/WUSV: 1st / 2nd / 3rd + a separate Grading line
                  (Amanda 2026-05-22 — SV judges award placements AND
                  grade each exhibit against the breed standard). */}
            {sorted.length > 0 && !isSvShow && (
              <View style={styles.placementsRow} wrap={false}>
                <Text style={styles.placementsCell}>1st .....</Text>
                <Text style={styles.placementsCell}>2nd .....</Text>
                <Text style={styles.placementsCell}>3rd .....</Text>
                <Text style={styles.placementsCell}>Res .....</Text>
                <Text style={styles.placementsCell}>VHC .....</Text>
              </View>
            )}
            {sorted.length > 0 && isSvShow && (
              <View wrap={false} style={{ marginTop: 6, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: SV.rule }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 16, marginBottom: 3 }}>
                  <Text
                    style={{
                      fontFamily: SV_FONTS.sans,
                      fontSize: 7.5,
                      textTransform: 'uppercase',
                      letterSpacing: 1.2,
                      color: SV.ink3,
                      fontWeight: 'bold',
                    }}
                  >
                    Results
                  </Text>
                  <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 9, color: SV.ink2 }}>1st ………………</Text>
                  <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 9, color: SV.ink2 }}>2nd ………………</Text>
                  <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 9, color: SV.ink2 }}>3rd ………………</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text
                    style={{
                      fontFamily: SV_FONTS.sans,
                      fontSize: 7.5,
                      textTransform: 'uppercase',
                      letterSpacing: 1.2,
                      color: SV.ink3,
                      fontWeight: 'bold',
                    }}
                  >
                    Grading
                  </Text>
                  <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 9, color: SV.ink2, flex: 1 }}>
                    ……………………………………………………………………
                  </Text>
                </View>
              </View>
            )}

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

      {/* Back matter: exhibitor index — moved to the end per backlog #93 */}
      <ExhibitorIndexPage show={show} entries={entries} compact={compact} />
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
