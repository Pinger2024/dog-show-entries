import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';
import type { JudgesBookClass, JudgesBookShowInfo } from '@/app/api/judges-book/[showId]/route';

// Register Times New Roman
const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Times',
  fonts: [
    { src: path.join(fontsDir, 'times-new-roman.ttf') },
    { src: path.join(fontsDir, 'times-new-roman-bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontStyle: 'italic' },
  ],
});
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

const s = StyleSheet.create({
  page: {
    fontFamily: 'Times',
    fontSize: 10,
    padding: '28 28 36 28',
  },
  // ── Page header (club/show/judge/date) ──
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
  // ── Body layout — reference column + 3 triplicate columns ──
  body: {
    flexDirection: 'row',
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
  },
  // Left reference column showing every ring number entered in this class.
  // Narrow so the placement columns get most of the width.
  refColumn: {
    width: '12%',
    borderRightWidth: 1.5,
    borderRightColor: '#000',
    padding: 4,
  },
  refHeader: {
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    color: '#555',
    marginBottom: 4,
  },
  refNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 3,
  },
  // One of three identical placement columns. The judge writes the
  // placements three times by hand (no carbon transfer), then tears the
  // two right-hand columns off along their perforated edges — one to the
  // secretary, one to the awards board. The leftmost column stays in
  // the book as the judge's record.
  placementColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'dashed',
  },
  placementColumnLast: {
    flex: 1,
  },
  // Small "tear here" caption above each perforated boundary, helping the
  // judge see which strip becomes which copy.
  copyLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 3,
    backgroundColor: '#fafafa',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
  },
  columnClassHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    padding: 6,
    backgroundColor: '#f4f4f4',
  },
  columnClassNumber: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#666',
  },
  columnClassName: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  columnClassBreed: {
    fontSize: 9,
    fontStyle: 'italic',
    color: '#555',
    marginTop: 1,
  },
  // Placement rows — pre-printed "1st", "2nd", etc. with a wide blank
  // space next to them for the judge to write the winning ring number.
  placementRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    minHeight: 34,
    paddingHorizontal: 6,
    paddingBottom: 3,
  },
  placementLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    width: 30,
  },
  // Slightly wider for "Withheld" which is longer than the placement abbrevs.
  placementLabelNarrow: {
    fontSize: 9,
    fontWeight: 'bold',
    width: 52,
  },
  placementWriteLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#888',
    marginLeft: 4,
    marginBottom: 4,
    height: 1,
  },
  // Absent row — calibrated on Amanda's 2026-04-19 Open Bitch: 26 entries,
  // 18 absent. Six stacked write-lines give the judge room for ~18-24
  // ring numbers (3-4 per line), which covers all but the most freakish
  // absentee counts. The row dominates the lower half of the column.
  absentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    minHeight: 180,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 3,
  },
  absentWriteArea: {
    flex: 1,
    marginLeft: 4,
  },
  absentWriteLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#888',
    marginTop: 22,
  },
  // Signature block at the bottom of each column.
  signatureBlock: {
    padding: 6,
    paddingTop: 14,
  },
  signatureLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#444',
    marginBottom: 4,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    height: 18,
  },
  // ── Footer ──
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

// ── Notes page styles — one A4 sheet per class for handwritten critiques.
// Sits before that class's awards-tear-off page. Each entry gets its own
// generous row with ruled lines, mirroring the Fossedata judging book
// Amanda compared against. Bench number column on the left, critique
// writing area on the right.
const notesStyles = StyleSheet.create({
  classBanner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: '#f4f4f4',
    borderWidth: 1,
    borderColor: '#000',
    padding: 6,
    marginBottom: 6,
  },
  classBannerLeft: {
    flex: 1,
  },
  classBannerNumber: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#666',
  },
  classBannerName: {
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  classBannerBreed: {
    fontSize: 9,
    fontStyle: 'italic',
    color: '#555',
    marginTop: 1,
  },
  classBannerRight: {
    fontSize: 9,
    textAlign: 'right',
    color: '#444',
  },
  notesTable: {
    borderWidth: 1,
    borderColor: '#000',
  },
  notesTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  notesTableHeaderBench: {
    width: '14%',
    padding: 4,
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    color: '#444',
  },
  notesTableHeaderCritique: {
    flex: 1,
    padding: 4,
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#444',
    borderLeftWidth: 0.5,
    borderLeftColor: '#000',
  },
  notesRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 84,
  },
  notesRowBench: {
    width: '14%',
    padding: 6,
    alignItems: 'center',
  },
  notesRowBenchNumber: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  notesRowCritique: {
    flex: 1,
    borderLeftWidth: 0.5,
    borderLeftColor: '#000',
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 6,
    justifyContent: 'space-around',
  },
  notesRuledLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#bbb',
    height: 1,
  },
});

// ── Best Awards page styles — same triplicate principle as class pages ──
const bestAwardsStyles = StyleSheet.create({
  columnHeader: {
    padding: 6,
    backgroundColor: '#f4f4f4',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  columnHeaderLabel: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#666',
  },
  columnHeaderTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  awardRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    minHeight: 32,
    paddingHorizontal: 6,
    paddingBottom: 3,
  },
  awardLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    flexBasis: '50%',
  },
  awardWriteLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#888',
    marginLeft: 4,
    marginBottom: 4,
    height: 1,
  },
});

interface ColumnHeaderProps {
  classLabel: string;
  className: string;
  sexLabel: string | null;
  breedName: string | null;
}

function BestAwardsColumn({
  awards,
  isLast,
  copyLabel,
}: {
  awards: string[];
  isLast?: boolean;
  copyLabel: string;
}) {
  return (
    <View style={isLast ? s.placementColumnLast : s.placementColumn}>
      <Text style={s.copyLabel}>{copyLabel}</Text>
      <View style={bestAwardsStyles.columnHeader}>
        <Text style={bestAwardsStyles.columnHeaderLabel}>Sign-off</Text>
        <Text style={bestAwardsStyles.columnHeaderTitle}>Best Awards</Text>
      </View>

      {awards.map((award) => (
        <View key={award} style={bestAwardsStyles.awardRow}>
          <Text style={bestAwardsStyles.awardLabel}>{award}</Text>
          <View style={bestAwardsStyles.awardWriteLine} />
        </View>
      ))}

      <View style={s.signatureBlock}>
        <Text style={s.signatureLabel}>Judge Signature</Text>
        <View style={s.signatureLine} />
      </View>
    </View>
  );
}

function ColumnHeader({ classLabel, className, sexLabel, breedName }: ColumnHeaderProps) {
  return (
    <View style={s.columnClassHeader}>
      <Text style={s.columnClassNumber}>
        Class {classLabel || '—'}
      </Text>
      <Text style={s.columnClassName}>
        {className}{sexLabel ? ` (${sexLabel})` : ''}
      </Text>
      {breedName && <Text style={s.columnClassBreed}>{breedName}</Text>}
    </View>
  );
}

function PlacementColumn(props: ColumnHeaderProps & { isLast?: boolean; copyLabel: string }) {
  return (
    <View style={props.isLast ? s.placementColumnLast : s.placementColumn}>
      <Text style={s.copyLabel}>{props.copyLabel}</Text>
      <ColumnHeader {...props} />

      {PLACEMENTS.map((place) => (
        <View key={place} style={s.placementRow}>
          <Text style={s.placementLabel}>{place}</Text>
          <View style={s.placementWriteLine} />
        </View>
      ))}

      {/* Withheld — for marking any placement the judge deemed unworthy
          (e.g. "3rd" or "RCC"). Separate from Abs (exhibitor absent). */}
      <View style={s.placementRow}>
        <Text style={s.placementLabelNarrow}>Withheld</Text>
        <View style={s.placementWriteLine} />
      </View>

      <View style={s.absentRow}>
        <Text style={s.placementLabel}>Abs</Text>
        <View style={s.absentWriteArea}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={s.absentWriteLine} />
          ))}
        </View>
      </View>

      <View style={s.signatureBlock}>
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
      title={`Judge's Book — ${show.name}`}
      author="Remi Show Manager"
    >
      {classes.map((cls, classIdx) => {
        const sexLabel = cls.sex === 'dog' ? 'Dogs' : cls.sex === 'bitch' ? 'Bitches' : null;
        const columnProps: ColumnHeaderProps = {
          classLabel: cls.classLabel,
          className: cls.className,
          sexLabel,
          breedName: cls.breedName,
        };

        return (
          <React.Fragment key={classIdx}>
            {/* Notes sheet — handwritten critique space, one row per dog. */}
            <Page size="A4" style={s.page}>
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

              <View style={notesStyles.classBanner} fixed>
                <View style={notesStyles.classBannerLeft}>
                  <Text style={notesStyles.classBannerNumber}>
                    Class {cls.classLabel || '—'} — Notes
                  </Text>
                  <Text style={notesStyles.classBannerName}>
                    {cls.className}{sexLabel ? ` (${sexLabel})` : ''}
                  </Text>
                  {cls.breedName && (
                    <Text style={notesStyles.classBannerBreed}>{cls.breedName}</Text>
                  )}
                </View>
                <Text style={notesStyles.classBannerRight}>
                  {cls.exhibits.length} {cls.exhibits.length === 1 ? 'entry' : 'entries'}
                  {cls.ringNumber != null ? ` · Ring ${cls.ringNumber}` : ''}
                </Text>
              </View>

              <View style={notesStyles.notesTable}>
                <View style={notesStyles.notesTableHeader} fixed>
                  <Text style={notesStyles.notesTableHeaderBench}>Bench No.</Text>
                  <Text style={notesStyles.notesTableHeaderCritique}>
                    Judge&apos;s Notes / Critique
                  </Text>
                </View>

                {cls.exhibits.map((exhibit, i) => (
                  <View key={i} style={notesStyles.notesRow} wrap={false}>
                    <View style={notesStyles.notesRowBench}>
                      <Text style={notesStyles.notesRowBenchNumber}>
                        {exhibit.catalogueNumber ?? '—'}
                      </Text>
                    </View>
                    <View style={notesStyles.notesRowCritique}>
                      {Array.from({ length: 4 }, (_, j) => (
                        <View key={j} style={notesStyles.notesRuledLine} />
                      ))}
                    </View>
                  </View>
                ))}
              </View>

              <Text
                style={s.footer}
                render={({ pageNumber, totalPages }) =>
                  `${SHOW_TYPE_LABELS[show.showType] ?? show.showType} — Class ${cls.classLabel || '—'} Notes — Page ${pageNumber} of ${totalPages} — Generated by Remi`
                }
                fixed
              />
            </Page>

            {/* Awards sheet — three perforated columns. Judge writes the
                placements three times by hand; the secretary and awards
                board copies tear off along the dashed boundaries. */}
            <Page size="A4" style={s.page}>
              <View style={s.pageHeader}>
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
                <View style={s.refColumn}>
                  <Text style={s.refHeader}>Exhibit No.</Text>
                  {cls.exhibits.map((exhibit, i) => (
                    <Text key={i} style={s.refNumber}>
                      {exhibit.catalogueNumber ?? '—'}
                    </Text>
                  ))}
                </View>

                <PlacementColumn {...columnProps} copyLabel="Judge's copy — keep" />
                <PlacementColumn {...columnProps} copyLabel="✂ Tear off — Secretary" />
                <PlacementColumn {...columnProps} copyLabel="✂ Tear off — Awards Board" isLast />
              </View>

              <Text
                style={s.footer}
                render={({ pageNumber, totalPages }) =>
                  `${SHOW_TYPE_LABELS[show.showType] ?? show.showType} — Page ${pageNumber} of ${totalPages} — Generated by Remi`
                }
                fixed
              />
            </Page>
          </React.Fragment>
        );
      })}

      {/* Final page — Best Awards sign-off. Triplicate columns match the
          class pages so the secretary can tear the same way. */}
      {show.bestAwards.length > 0 && (
        <Page size="A4" style={s.page}>
          <View style={s.pageHeader}>
            <View style={s.pageHeaderLeft}>
              {show.organisation && (
                <Text style={s.clubName}>{show.organisation}</Text>
              )}
              <Text style={s.showName}>{show.name}</Text>
            </View>
            <Text style={s.dateBlock}>{showDate}</Text>
          </View>

          <View style={s.body}>
            <BestAwardsColumn awards={show.bestAwards} copyLabel="Judge's copy — keep" />
            <BestAwardsColumn awards={show.bestAwards} copyLabel="✂ Tear off — Secretary" />
            <BestAwardsColumn awards={show.bestAwards} copyLabel="✂ Tear off — Awards Board" isLast />
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
