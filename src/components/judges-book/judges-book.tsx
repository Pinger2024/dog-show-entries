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

// Row height is tuned so a judge can write a placement or critique comfortably
// by hand — 28pt ≈ 10mm, enough for a single line of cursive. The A4 body area
// after header/summary fits ~18 rows per page before overflow.
const ROW_HEIGHT = 28;

const s = StyleSheet.create({
  page: {
    fontFamily: 'Times',
    fontSize: 10,
    padding: '28 32 40 32',
  },
  // ── Class header ──
  classHeader: {
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 6,
    marginBottom: 8,
  },
  showName: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#444',
    marginBottom: 2,
  },
  classTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  classSubtitle: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#333',
    marginTop: 2,
  },
  judgeLine: {
    fontSize: 9,
    marginTop: 3,
    color: '#333',
  },
  entryCount: {
    fontSize: 8,
    color: '#666',
    marginBottom: 6,
    fontStyle: 'italic',
  },
  // ── 4-column grid ──
  gridHeader: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    paddingVertical: 3,
    backgroundColor: '#f0f0f0',
  },
  gridHeaderCell: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    color: '#333',
  },
  gridRow: {
    flexDirection: 'row',
    minHeight: ROW_HEIGHT,
    borderBottomWidth: 0.5,
    borderBottomColor: '#bbb',
  },
  colNumber: {
    width: '14%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colWrite: {
    width: '28.66%',
    borderRightWidth: 0.5,
    borderRightColor: '#ddd',
  },
  // Last writing column has no right border (page edge).
  colWriteLast: {
    width: '28.66%',
  },
  numberText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  // ── Results summary ──
  summarySection: {
    marginTop: 14,
    borderTopWidth: 1.5,
    borderTopColor: '#000',
    paddingTop: 10,
  },
  summaryHeading: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    color: '#333',
  },
  placementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  placementCell: {
    width: '33.33%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingRight: 8,
    marginBottom: 10,
  },
  placementLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    width: 38,
  },
  placementLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    height: 18,
  },
  absentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  absentLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    width: 60,
  },
  absentLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    height: 18,
  },
  // ── Signature ──
  signatureSection: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
  },
  signatureLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#444',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    height: 24,
  },
  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 32,
    right: 32,
    fontSize: 7,
    color: '#aaa',
    textAlign: 'center',
  },
});

const PLACEMENTS = ['1st', '2nd', '3rd', '4th', 'VHC'] as const;

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
        const classLabel = [
          cls.classNumber ? `Class ${cls.classNumber}` : null,
          cls.className,
          sexLabel ? `(${sexLabel})` : null,
        ]
          .filter(Boolean)
          .join(' — ');

        return (
          <Page key={classIdx} size="A4" style={s.page}>
            {/* Class header — repeats at the top of continuation pages */}
            <View style={s.classHeader} fixed>
              <Text style={s.showName}>
                {show.organisation ? `${show.organisation} — ` : ''}
                {show.name} — {showDate}
              </Text>
              <Text style={s.classTitle}>{classLabel}</Text>
              {cls.breedName && (
                <Text style={s.classSubtitle}>{cls.breedName}</Text>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                {cls.judgeName && (
                  <Text style={s.judgeLine}>Judge: {cls.judgeName}</Text>
                )}
                {cls.ringNumber != null && (
                  <Text style={s.judgeLine}>Ring {cls.ringNumber}</Text>
                )}
              </View>
            </View>

            {/* Entry count */}
            <Text style={s.entryCount}>
              {cls.exhibits.length} exhibit{cls.exhibits.length !== 1 ? 's' : ''} entered
            </Text>

            {/* 4-column grid: ring numbers + 3 writing columns.
                Grid header repeats on continuation pages so the judge always
                sees the column meaning. */}
            <View style={s.gridHeader} fixed>
              <View style={s.colNumber}>
                <Text style={s.gridHeaderCell}>Ring No.</Text>
              </View>
              <View style={s.colWrite} />
              <View style={s.colWrite} />
              <View style={s.colWriteLast} />
            </View>

            {cls.exhibits.map((exhibit, i) => (
              <View key={i} style={s.gridRow} wrap={false}>
                <View style={s.colNumber}>
                  <Text style={s.numberText}>
                    {exhibit.catalogueNumber ?? '—'}
                  </Text>
                </View>
                <View style={s.colWrite} />
                <View style={s.colWrite} />
                <View style={s.colWriteLast} />
              </View>
            ))}

            {/* Results summary — appears once, after the last row of the grid */}
            <View style={s.summarySection}>
              <Text style={s.summaryHeading}>Results</Text>

              <View style={s.placementsGrid}>
                {PLACEMENTS.map((place) => (
                  <View key={place} style={s.placementCell}>
                    <Text style={s.placementLabel}>{place}</Text>
                    <View style={s.placementLine} />
                  </View>
                ))}
              </View>

              <View style={s.absentRow}>
                <Text style={s.absentLabel}>Absent</Text>
                <View style={s.absentLine} />
              </View>
            </View>

            {/* Signature */}
            <View style={s.signatureSection}>
              <View style={s.signatureBlock}>
                <Text style={s.signatureLabel}>Judge Signature</Text>
                <View style={s.signatureLine} />
              </View>
              <View style={s.signatureBlock}>
                <Text style={s.signatureLabel}>Date</Text>
                <View style={s.signatureLine} />
              </View>
            </View>

            {/* Footer */}
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
    </Document>
  );
}
