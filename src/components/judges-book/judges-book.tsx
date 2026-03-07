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

const s = StyleSheet.create({
  page: {
    fontFamily: 'Times',
    fontSize: 9,
    padding: '28 32 40 32',
    lineHeight: 1.3,
  },
  // ── Class header ──
  classHeader: {
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 6,
    marginBottom: 10,
  },
  showName: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#444',
    marginBottom: 2,
  },
  classTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  classSubtitle: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#333',
    marginTop: 2,
  },
  judgeLine: {
    fontSize: 9,
    marginTop: 3,
    color: '#333',
  },
  // ── Exhibit table ──
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    minHeight: 22,
    alignItems: 'center',
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    minHeight: 22,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  colExhibit: { width: '10%', paddingLeft: 4 },
  colDogName: { width: '30%' },
  colPlacement: { width: '12%', textAlign: 'center' },
  colAbsent: { width: '8%', textAlign: 'center' },
  colNotes: { width: '40%', paddingRight: 4 },
  cellText: {
    fontSize: 9,
  },
  cellTextBold: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  // ── Summary area ──
  summarySection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#000',
    paddingTop: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    width: 120,
  },
  summaryLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    marginBottom: 2,
  },
  signatureSection: {
    marginTop: 24,
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
  // ── Entry count ──
  entryCount: {
    fontSize: 8,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
});

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
            {/* Class header */}
            <View style={s.classHeader}>
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

            {/* Exhibit table */}
            <View style={s.tableHeader}>
              <View style={s.colExhibit}>
                <Text style={s.tableHeaderCell}>No.</Text>
              </View>
              <View style={s.colDogName}>
                <Text style={s.tableHeaderCell}>Exhibit</Text>
              </View>
              <View style={s.colPlacement}>
                <Text style={s.tableHeaderCell}>Place</Text>
              </View>
              <View style={s.colAbsent}>
                <Text style={s.tableHeaderCell}>Abs</Text>
              </View>
              <View style={s.colNotes}>
                <Text style={s.tableHeaderCell}>Notes</Text>
              </View>
            </View>

            {cls.exhibits.map((exhibit, i) => (
              <View
                key={i}
                style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}
              >
                <View style={s.colExhibit}>
                  <Text style={s.cellTextBold}>
                    {exhibit.catalogueNumber ?? '—'}
                  </Text>
                </View>
                <View style={s.colDogName}>
                  <Text style={s.cellText}>{exhibit.dogName}</Text>
                </View>
                <View style={s.colPlacement}>
                  <Text style={s.cellText}> </Text>
                </View>
                <View style={s.colAbsent}>
                  <Text style={s.cellText}>{exhibit.absent ? 'ABS' : ' '}</Text>
                </View>
                <View style={s.colNotes}>
                  <Text style={s.cellText}> </Text>
                </View>
              </View>
            ))}

            {/* Results summary */}
            <View style={s.summarySection}>
              {['1st', '2nd', '3rd', 'Reserve', 'VHC'].map((place) => (
                <View key={place} style={s.summaryRow}>
                  <Text style={s.summaryLabel}>{place}:</Text>
                  <View style={s.summaryLine} />
                </View>
              ))}
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Best of Sex:</Text>
                <View style={s.summaryLine} />
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
