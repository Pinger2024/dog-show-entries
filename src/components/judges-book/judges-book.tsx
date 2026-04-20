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
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 2,
  },
  // One of three identical placement columns. Carbon-triplicate: a judge
  // fills in placements per column, the page is then physically split
  // into strips — one for the judge's record, one for the secretary, one
  // for the awards board.
  placementColumn: {
    flex: 1,
    borderRightWidth: 0.5,
    borderRightColor: '#999',
  },
  placementColumnLast: {
    flex: 1,
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
  // Absent row — slightly taller so the judge can note multiple absentees.
  absentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    minHeight: 42,
    paddingHorizontal: 6,
    paddingBottom: 3,
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
  classNumber: number | null;
  className: string;
  sexLabel: string | null;
  breedName: string | null;
}

function BestAwardsColumn({
  awards,
  isLast,
}: {
  awards: string[];
  isLast?: boolean;
}) {
  return (
    <View style={isLast ? s.placementColumnLast : s.placementColumn}>
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

function ColumnHeader({ classNumber, className, sexLabel, breedName }: ColumnHeaderProps) {
  return (
    <View style={s.columnClassHeader}>
      <Text style={s.columnClassNumber}>
        Class {classNumber ?? '—'}
      </Text>
      <Text style={s.columnClassName}>
        {className}{sexLabel ? ` (${sexLabel})` : ''}
      </Text>
      {breedName && <Text style={s.columnClassBreed}>{breedName}</Text>}
    </View>
  );
}

function PlacementColumn(props: ColumnHeaderProps & { isLast?: boolean }) {
  return (
    <View style={props.isLast ? s.placementColumnLast : s.placementColumn}>
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
        <View style={s.placementWriteLine} />
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
          classNumber: cls.classNumber,
          className: cls.className,
          sexLabel,
          breedName: cls.breedName,
        };

        return (
          <Page key={classIdx} size="A4" style={s.page}>
            {/* Page header — shared across the three columns */}
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

            {/* Body: reference column + 3 identical placement columns. */}
            <View style={s.body}>
              <View style={s.refColumn}>
                <Text style={s.refHeader}>Ring No.</Text>
                {cls.exhibits.map((exhibit, i) => (
                  <Text key={i} style={s.refNumber}>
                    {exhibit.catalogueNumber ?? '—'}
                  </Text>
                ))}
              </View>

              <PlacementColumn {...columnProps} />
              <PlacementColumn {...columnProps} />
              <PlacementColumn {...columnProps} isLast />
            </View>

            <Text
              style={s.footer}
              render={({ pageNumber, totalPages }) =>
                `${SHOW_TYPE_LABELS[show.showType] ?? show.showType} — Page ${pageNumber} of ${totalPages} — Generated by Remi`
              }
              fixed
            />
          </Page>
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
            <BestAwardsColumn awards={show.bestAwards} />
            <BestAwardsColumn awards={show.bestAwards} />
            <BestAwardsColumn awards={show.bestAwards} isLast />
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
