import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';
import type { JudgesBookClass, JudgesBookShowInfo } from '@/app/api/judges-book/[showId]/route';
// Side-effect: registers the HankenGrotesk family used on the branded front
// cover sheet below. Imported from a single shared module (not registered
// inline here) — see src/lib/pdf-fonts.ts for why duplicate registration of
// the same family from multiple modules is unsafe.
import '@/lib/pdf-fonts';

const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Times',
  fonts: [
    { src: path.join(fontsDir, 'times-new-roman.ttf') },
    { src: path.join(fontsDir, 'times-new-roman-bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontStyle: 'italic' },
  ],
});
// Show Experience green rebrand — Hanken Grotesk for the branded front
// cover sheet ONLY (club name, show name, "Judge's Book" title, judge
// name). The per-class working pages (critique write-in areas, placement
// columns) stay on Times untouched — those are the print-proofed judging
// document, not the display cover.
Font.registerHyphenationCallback((word) => [word]);

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

const PLACEMENTS = ['1st', '2nd', '3rd', '4th', 'VHC'] as const;

// Tear-off strip widths. Mandy 2026-07-19: the Secretary and Awards Board
// copies must be 28mm to match the club's awards-board slots (so a torn copy
// drops straight onto the board). The Judge's copy (kept, not boarded) can be
// a touch wider — kept subtle so it doesn't stand out. react-pdf works in
// points (1pt = 1/72in), so convert from mm.
const MM_TO_PT = 2.83465;
const STRIP_WIDTH = 28 * MM_TO_PT; // ≈79.4pt — Secretary + Awards Board
const JUDGE_STRIP_WIDTH = 34 * MM_TO_PT; // ≈96.4pt — Judge's copy (a touch wider)

const s = StyleSheet.create({
  page: {
    fontFamily: 'Times',
    fontSize: 10,
    // Zero RIGHT margin (Mandy 2026-07-19) so the tear-off strips sit flush to
    // the paper's right edge and land on the perforations (which are measured
    // from that edge). Top/left/bottom unchanged. (T R B L)
    padding: '28 0 36 28',
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    paddingBottom: 6,
    marginBottom: 10,
  },
  pageHeaderLeft: {
    flex: 1,
  },
  clubName: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#444',
    marginBottom: 2,
  },
  showName: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  judgeLine: {
    fontSize: 10,
    marginTop: 2,
  },
  dateBlock: {
    fontSize: 10,
    textAlign: 'right',
  },
  // ── Combined body: notes on left, 3 placement columns on right ──
  body: {
    flexDirection: 'row',
    flex: 1,
    borderWidth: 1,
    // No border down the far-RIGHT edge (Mandy 2026-07-19) — the Awards Board
    // strip runs clean to the paper's right edge where it tears off.
    borderRightWidth: 0,
    borderColor: '#000',
  },
  // Left notes section — fills whatever's left after the fixed-width tear-off
  // strips (so the strips stay a true 28mm regardless of page width).
  notesSection: {
    flex: 1,
    borderRightWidth: 1.5,
    borderRightColor: '#000',
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: 6,
    backgroundColor: '#f4f4f4',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  notesHeaderLeft: {
    flex: 1,
  },
  notesClassNumber: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#666',
  },
  notesClassName: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  notesClassBreed: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#555',
    marginTop: 1,
  },
  notesEntryCount: {
    fontSize: 8,
    textAlign: 'right',
    color: '#444',
  },
  notesColHeader: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  notesColHeaderBench: {
    width: 32,
    padding: 3,
    fontSize: 6,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    color: '#444',
    borderRightWidth: 0.5,
    borderRightColor: '#ccc',
  },
  notesColHeaderCritique: {
    flex: 1,
    padding: 3,
    fontSize: 6,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#444',
  },
  notesRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#bbb',
    minHeight: 56,
  },
  notesBenchCell: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    borderRightWidth: 0.5,
    borderRightColor: '#ccc',
  },
  notesBenchNumber: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  notesCritiqueCell: {
    flex: 1,
    paddingHorizontal: 5,
    paddingTop: 8,
    paddingBottom: 5,
    justifyContent: 'space-around',
  },
  notesCritiqueLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#bbb',
    height: 1,
  },
  // Right placements section — the three fixed-width tear-off strips (Judge a
  // touch wider, Secretary + Awards Board both a true 28mm).
  placementsSection: {
    width: JUDGE_STRIP_WIDTH + STRIP_WIDTH * 2,
    flexShrink: 0,
    flexDirection: 'row',
  },
  // Judge's copy — a touch wider than the boarded strips (kept, not boarded).
  placementColumnJudge: {
    width: JUDGE_STRIP_WIDTH,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'dashed',
  },
  // Secretary strip — a true 28mm to match the awards board.
  placementColumn: {
    width: STRIP_WIDTH,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'dashed',
  },
  // Awards Board strip (last) — a true 28mm, no divider (page edge).
  placementColumnLast: {
    width: STRIP_WIDTH,
  },
  // Fixed-height header band so a label that wraps to two lines (e.g. "✂ Tear
  // off — Awards Board") doesn't push that column's placement rows out of line
  // with the other two columns (Mandy 2026-06-16). All three headers are now
  // the same height and the text is vertically centred within.
  copyLabelBox: {
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    backgroundColor: '#fafafa',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
  },
  copyLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#666',
    textAlign: 'center',
  },
  columnClassHeader: {
    // Fixed height so the class/breed heading occupies the SAME vertical space
    // in every column regardless of how the text wraps (the narrower tear-off
    // strips wrap to more lines than the wider Judge's copy). This keeps the
    // 1st/2nd/3rd… rows — and their write lines — aligned across all three
    // columns (Mandy 2026-07-19: "the lines at the bottom don't match up").
    // Sized to fit a long class name (e.g. "Special Long Coat Yearling") in a
    // 28mm strip; the smaller class-name font below keeps long names inside it.
    height: 78,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    padding: 5,
    backgroundColor: '#f4f4f4',
  },
  columnClassNumber: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#666',
  },
  columnClassName: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  columnClassBreed: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#555',
    marginTop: 1,
  },
  placementRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    minHeight: 30,
    paddingHorizontal: 5,
    paddingBottom: 3,
  },
  placementLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    width: 26,
  },
  placementLabelNarrow: {
    fontSize: 8,
    fontWeight: 'bold',
    width: 46,
  },
  placementWriteLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#888',
    marginLeft: 4,
    marginBottom: 4,
    height: 1,
  },
  absentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    minHeight: 100,
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 3,
  },
  absentWriteArea: {
    flex: 1,
    marginLeft: 4,
  },
  absentWriteLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#888',
    marginTop: 20,
  },
  signatureBlock: {
    padding: 5,
    paddingTop: 12,
  },
  signatureLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#444',
    marginBottom: 4,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    height: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    fontSize: 7,
    color: '#999',
    textAlign: 'center',
  },
});

// ── Best Awards page styles ──
// Mandy photographed this page 2026-07-28: its three equal-width columns
// printed dashed dividers at ~1/3 and ~2/3 across the page, but the club's
// awards-board slots (and the perforated paper) are cut at a fixed 28mm from
// the right edge — the same geometry the per-class pages already use. This
// reuses the SAME STRIP_WIDTH constant (not a re-declared number) so the
// dashed guides land at the identical x-position on every page in the book.
// Unlike the per-class pages — which pair a fixed 34mm Judge's strip against
// a wide notes column — this page has no notes column, so the Judge's copy
// takes whatever's left after the two 28mm tear-offs (flex: 1).
const bestAwardsStyles = StyleSheet.create({
  columnJudge: {
    flex: 1,
    borderRightWidth: 1.5,
    borderRightColor: '#000',
  },
  // Secretary strip — a true 28mm, dashed divider (tears off).
  column: {
    width: STRIP_WIDTH,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'dashed',
  },
  // Awards Board strip (last) — a true 28mm, flush to the page's right edge.
  columnLast: {
    width: STRIP_WIDTH,
    flexShrink: 0,
  },
  // Fixed height (mirrors columnClassHeader on the class pages) so the
  // header occupies the same vertical space whether or not "Best Awards"
  // wraps in the narrow 28mm strips — otherwise the award rows below it
  // would start at different heights in each column.
  columnHeader: {
    height: 34,
    overflow: 'hidden',
    padding: 5,
    backgroundColor: '#f4f4f4',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  columnHeaderLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#666',
  },
  columnHeaderTitle: {
    // 9pt (not 10) so "BEST AWARDS" sits on one line in the 28mm strips too —
    // at 10pt it wrapped to "BEST / AWARDS" in the Secretary strip (narrower
    // net width than Awards Board's due to its dashed vs solid divider
    // padding) but fit on one line in Awards Board, an inconsistent look
    // (Mandy 2026-07-28).
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  // Fixed height, same in every column, sized to fit the longest award name
  // ("Reserve Bitch Challenge Certificate") wrapped across several lines in
  // the 28mm strips at the reduced font size below. Label stacks ABOVE the
  // write line (rather than side-by-side, as the class page placement rows
  // do for short "1st"/"2nd" labels) because a long award name needs the
  // strip's full width to wrap into, not half of it.
  awardRow: {
    height: 46,
    flexDirection: 'column',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    paddingHorizontal: 6,
    paddingTop: 5,
    paddingBottom: 5,
    overflow: 'hidden',
  },
  awardLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  awardWriteLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#888',
    height: 1,
  },
});

// ── Front cover styles ──
const coverStyles = StyleSheet.create({
  page: {
    fontFamily: 'Times',
    padding: '60 50',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  top: { alignItems: 'center', width: '100%' },
  logo: { maxWidth: 180, maxHeight: 110, objectFit: 'contain', marginBottom: 16 },
  club: {
    fontFamily: 'HankenGrotesk',
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
    color: '#20452c',
  },
  middle: { alignItems: 'center', width: '100%' },
  rule: { width: 120, height: 2, backgroundColor: '#2f6b43', marginVertical: 18 },
  showName: {
    fontFamily: 'HankenGrotesk',
    fontSize: 24,
    fontWeight: 800,
    textAlign: 'center',
    color: '#1b241d',
    marginBottom: 8,
  },
  showType: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#444',
    marginBottom: 4,
  },
  date: { fontSize: 12, textAlign: 'center', color: '#444' },
  title: {
    fontFamily: 'HankenGrotesk',
    fontSize: 30,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 4,
    textAlign: 'center',
    color: '#20452c',
    marginTop: 24,
  },
  judge: {
    fontFamily: 'HankenGrotesk',
    fontSize: 15,
    fontWeight: 600,
    textAlign: 'center',
    color: '#1b241d',
    marginTop: 10,
  },
  judgeLabel: {
    fontFamily: 'HankenGrotesk',
    fontSize: 9,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: '#666',
    marginTop: 4,
  },
  footer: { fontSize: 8, color: '#999', textAlign: 'center' },
});

/** Front cover sheet — club branding, show details, the judge's name. */
export function JudgesBookCover({ show }: { show: JudgesBookShowInfo }) {
  const showDate = new Date(show.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (
    <Page size="A4" style={coverStyles.page}>
      <View style={coverStyles.top}>
        {show.logoUrl ? <Image src={show.logoUrl} style={coverStyles.logo} /> : null}
        {show.organisation ? <Text style={coverStyles.club}>{show.organisation}</Text> : null}
      </View>

      <View style={coverStyles.middle}>
        <View style={coverStyles.rule} />
        <Text style={coverStyles.showName}>{show.name}</Text>
        <Text style={coverStyles.showType}>
          {SHOW_TYPE_LABELS[show.showType] ?? show.showType}
        </Text>
        <Text style={coverStyles.date}>{showDate}</Text>
        <View style={coverStyles.rule} />
        <Text style={coverStyles.title}>Judge&apos;s Book</Text>
        {show.judgeName ? (
          <>
            <Text style={coverStyles.judgeLabel}>Judge</Text>
            <Text style={coverStyles.judge}>{show.judgeName}</Text>
          </>
        ) : null}
      </View>

      <Text style={coverStyles.footer}>Generated by Remi  ·  remishowmanager.co.uk</Text>
    </Page>
  );
}

interface ColumnHeaderProps {
  classLabel: string;
  className: string;
  sexLabel: string | null;
  breedName: string | null;
}

function BestAwardsColumn({
  awards,
  variant,
  copyLabel,
}: {
  awards: string[];
  variant: 'judge' | 'secretary' | 'awardsBoard';
  copyLabel: string;
}) {
  const columnStyle =
    variant === 'judge'
      ? bestAwardsStyles.columnJudge
      : variant === 'awardsBoard'
        ? bestAwardsStyles.columnLast
        : bestAwardsStyles.column;
  return (
    <View style={columnStyle}>
      <View style={s.copyLabelBox}><Text style={s.copyLabel}>{copyLabel}</Text></View>
      <View style={bestAwardsStyles.columnHeader}>
        <Text style={bestAwardsStyles.columnHeaderLabel}>Sign-off</Text>
        <Text style={bestAwardsStyles.columnHeaderTitle}>Best Awards</Text>
      </View>

      {awards.map((award) => (
        <View key={award} style={bestAwardsStyles.awardRow} wrap={false}>
          <Text style={bestAwardsStyles.awardLabel}>{award}</Text>
          <View style={bestAwardsStyles.awardWriteLine} />
        </View>
      ))}

      <View style={s.signatureBlock} wrap={false}>
        <Text style={s.signatureLabel}>Judge Signature</Text>
        <View style={s.signatureLine} />
      </View>
    </View>
  );
}

function ColumnHeader({ classLabel, className, sexLabel, breedName }: ColumnHeaderProps) {
  return (
    <View style={s.columnClassHeader}>
      <Text style={s.columnClassNumber}>Class {classLabel || '—'}</Text>
      <Text style={s.columnClassName}>
        {className}{sexLabel ? ` (${sexLabel})` : ''}
      </Text>
      {breedName && <Text style={s.columnClassBreed}>{breedName}</Text>}
    </View>
  );
}

function PlacementColumn(props: ColumnHeaderProps & { isLast?: boolean; wide?: boolean; copyLabel: string }) {
  const columnStyle = props.wide
    ? s.placementColumnJudge
    : props.isLast
      ? s.placementColumnLast
      : s.placementColumn;
  return (
    <View style={columnStyle}>
      <View style={s.copyLabelBox}><Text style={s.copyLabel}>{props.copyLabel}</Text></View>
      <ColumnHeader {...props} />

      {PLACEMENTS.map((place) => (
        <View key={place} style={s.placementRow} wrap={false}>
          <Text style={s.placementLabel}>{place}</Text>
          <View style={s.placementWriteLine} />
        </View>
      ))}

      <View style={s.placementRow} wrap={false}>
        <Text style={s.placementLabelNarrow}>Withheld</Text>
        <View style={s.placementWriteLine} />
      </View>

      <View style={s.absentRow} wrap={false}>
        <Text style={s.placementLabel}>Abs</Text>
        <View style={s.absentWriteArea}>
          {Array.from({ length: 4 }, (_, i) => (
            <View key={i} style={s.absentWriteLine} />
          ))}
        </View>
      </View>

      <View style={s.signatureBlock} wrap={false}>
        <Text style={s.signatureLabel}>Judge Signature</Text>
        <View style={s.signatureLine} />
      </View>
    </View>
  );
}

export function JudgesBook({
  show,
  classes,
}: {
  show: JudgesBookShowInfo;
  classes: JudgesBookClass[];
}) {
  const showDate = new Date(show.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Document
      title={`Judge's Book — ${show.name}${show.judgeName ? ` (${show.judgeName})` : ''}`}
      author="Remi Show Manager"
    >
      <JudgesBookCover show={show} />

      {classes.map((cls, classIdx) => {
        const sexLabel = cls.sex === 'dog' ? 'Dogs' : cls.sex === 'bitch' ? 'Bitches' : null;
        const columnProps: ColumnHeaderProps = {
          classLabel: cls.classLabel,
          className: cls.className,
          sexLabel,
          breedName: cls.breedName,
        };

        return (
          // One page per class: notes on the left, 3 tearoff placement columns on the right.
          <Page key={classIdx} size="A4" style={s.page}>
            <View style={s.pageHeader} fixed>
              <View style={s.pageHeaderLeft}>
                {show.organisation && (
                  <Text style={s.clubName}>{show.organisation}</Text>
                )}
                <Text style={s.showName}>{show.name}</Text>
                {cls.judgeName && (
                  <Text style={s.judgeLine}>Judge: {cls.judgeName}</Text>
                )}
              </View>
              <Text style={s.dateBlock}>{showDate}</Text>
            </View>

            <View style={s.body}>
              {/* Left: bench numbers + critique writing area */}
              <View style={s.notesSection}>
                <View style={s.notesHeader} fixed>
                  <View style={s.notesHeaderLeft}>
                    <Text style={s.notesClassNumber}>
                      Class {cls.classLabel || '—'}
                    </Text>
                    <Text style={s.notesClassName}>
                      {cls.className}{sexLabel ? ` (${sexLabel})` : ''}
                    </Text>
                    {cls.breedName && (
                      <Text style={s.notesClassBreed}>{cls.breedName}</Text>
                    )}
                  </View>
                  <Text style={s.notesEntryCount}>
                    {cls.exhibits.length}{' '}
                    {cls.exhibits.length === 1 ? 'entry' : 'entries'}
                    {cls.ringNumber != null ? ` · Ring ${cls.ringNumber}` : ''}
                  </Text>
                </View>

                <View style={s.notesColHeader} fixed>
                  <Text style={s.notesColHeaderBench}>No.</Text>
                  <Text style={s.notesColHeaderCritique}>Judge&apos;s Notes / Critique</Text>
                </View>

                {cls.exhibits.map((exhibit, i) => (
                  <View key={i} style={s.notesRow} wrap={false}>
                    <View style={s.notesBenchCell}>
                      <Text style={s.notesBenchNumber}>
                        {exhibit.catalogueNumber ?? '—'}
                      </Text>
                    </View>
                    <View style={s.notesCritiqueCell}>
                      {Array.from({ length: 3 }, (_, j) => (
                        <View key={j} style={s.notesCritiqueLine} />
                      ))}
                    </View>
                  </View>
                ))}
              </View>

              {/* Right: three tearoff placement columns */}
              <View style={s.placementsSection}>
                <PlacementColumn {...columnProps} copyLabel="Judge's copy — keep" wide />
                <PlacementColumn {...columnProps} copyLabel="✂ Tear off — Secretary" />
                <PlacementColumn {...columnProps} copyLabel="✂ Tear off — Awards Board" isLast />
              </View>
            </View>

            <Text
              style={s.footer}
              render={({ pageNumber, totalPages }) =>
                `${SHOW_TYPE_LABELS[show.showType] ?? show.showType} — Class ${cls.classLabel || '—'} — Page ${pageNumber} of ${totalPages} — Generated by Remi`
              }
              fixed
            />
          </Page>
        );
      })}

      {/* Final page — Best Awards sign-off. Triplicate columns, no notes needed. */}
      {show.bestAwards.length > 0 && (
        <Page size="A4" style={s.page}>
          <View style={s.pageHeader} fixed>
            <View style={s.pageHeaderLeft}>
              {show.organisation && (
                <Text style={s.clubName}>{show.organisation}</Text>
              )}
              <Text style={s.showName}>{show.name}</Text>
            </View>
            <Text style={s.dateBlock}>{showDate}</Text>
          </View>

          <View style={s.body}>
            <BestAwardsColumn awards={show.bestAwards} variant="judge" copyLabel="Judge's copy — keep" />
            <BestAwardsColumn awards={show.bestAwards} variant="secretary" copyLabel="✂ Tear off — Secretary" />
            <BestAwardsColumn awards={show.bestAwards} variant="awardsBoard" copyLabel="✂ Tear off — Awards Board" />
          </View>

          <Text
            style={s.footer}
            render={({ pageNumber, totalPages }) =>
              `${SHOW_TYPE_LABELS[show.showType] ?? show.showType} — Best Awards sign-off — Page ${pageNumber} of ${totalPages} — Generated by Remi`
            }
            fixed
          />
        </Page>
      )}
    </Document>
  );
}
