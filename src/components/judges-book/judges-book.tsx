import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';
import type { JudgesBookClass, JudgesBookShowInfo } from '@/app/api/judges-book/[showId]/route';

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
    borderColor: '#000',
  },
  // Left notes section (~38% of page width)
  notesSection: {
    width: '38%',
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
  // Right placements section (flex: 1 = remaining ~62%, split into 3)
  placementsSection: {
    flex: 1,
    flexDirection: 'row',
  },
  // Each of the three tearoff columns
  placementColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderRightStyle: 'dashed',
  },
  placementColumnLast: {
    flex: 1,
  },
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
    fontSize: 10,
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
      <Text style={s.columnClassNumber}>Class {classLabel || '—'}</Text>
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

      <View style={s.placementRow}>
        <Text style={s.placementLabelNarrow}>Withheld</Text>
        <View style={s.placementWriteLine} />
      </View>

      <View style={s.absentRow}>
        <Text style={s.placementLabel}>Abs</Text>
        <View style={s.absentWriteArea}>
          {Array.from({ length: 4 }, (_, i) => (
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
                <PlacementColumn {...columnProps} copyLabel="Judge's copy — keep" />
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
