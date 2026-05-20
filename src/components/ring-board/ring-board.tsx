import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';

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

export interface RingBoardShowInfo {
  name: string;
  showType: string;
  date: string;
  organisation: string | null;
  venue: string | null;
}

export interface RingBoardRing {
  ringNumber: number;
  judgeName: string | null;
  breeds: {
    breedName: string | null;
    classes: {
      classLabel: string;
      className: string;
      sex: string | null;
      entryCount: number;
    }[];
    totalEntries: number;
  }[];
}

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
  // Title area
  titleBlock: {
    textAlign: 'center',
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 8,
  },
  organisation: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: '#333',
    marginBottom: 2,
  },
  showName: {
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  showType: {
    fontSize: 9,
    fontStyle: 'italic',
    color: '#555',
    marginBottom: 2,
  },
  showDate: {
    fontSize: 9,
    color: '#444',
    marginBottom: 2,
  },
  venue: {
    fontSize: 9,
    color: '#444',
  },
  pageTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 14,
  },
  // Ring card
  ringCard: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#000',
  },
  ringHeader: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: '6 10',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ringTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  ringJudge: {
    fontSize: 9,
    color: '#ddd',
    fontStyle: 'italic',
  },
  ringBody: {
    padding: '6 10 8 10',
  },
  breedSection: {
    marginBottom: 6,
  },
  breedName: {
    fontSize: 10,
    fontWeight: 'bold',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    paddingBottom: 2,
    marginBottom: 3,
  },
  classRow: {
    flexDirection: 'row',
    paddingVertical: 1.5,
    paddingLeft: 8,
  },
  classNumber: {
    width: 40,
    fontSize: 8,
    fontWeight: 'bold',
  },
  className: {
    flex: 1,
    fontSize: 8,
  },
  classSex: {
    width: 50,
    fontSize: 8,
    fontStyle: 'italic',
    color: '#555',
  },
  classEntries: {
    width: 30,
    fontSize: 8,
    textAlign: 'right',
    color: '#666',
  },
  breedTotal: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#444',
    textAlign: 'right',
    marginTop: 2,
    paddingRight: 4,
  },
  // Footer
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

export function RingBoard({
  show,
  rings,
}: {
  show: RingBoardShowInfo;
  rings: RingBoardRing[];
}) {
  const showDate = new Date(show.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const showTypeLabel = SHOW_TYPE_LABELS[show.showType] ?? show.showType;

  return (
    <Document title={`Ring Board — ${show.name}`} author="Remi Show Manager">
      <Page size="A4" style={s.page} wrap>
        {/* Show header */}
        <View style={s.titleBlock}>
          {show.organisation && (
            <Text style={s.organisation}>{show.organisation}</Text>
          )}
          <Text style={s.showName}>{show.name}</Text>
          <Text style={s.showType}>{showTypeLabel}</Text>
          <Text style={s.showDate}>{showDate}</Text>
          {show.venue && <Text style={s.venue}>{show.venue}</Text>}
        </View>

        <Text style={s.pageTitle}>Ring Plan</Text>

        {rings.map((ring) => (
          <View key={ring.ringNumber} style={s.ringCard} wrap={false}>
            <View style={s.ringHeader}>
              <Text style={s.ringTitle}>Ring {ring.ringNumber}</Text>
              {ring.judgeName && (
                <Text style={s.ringJudge}>Judge: {ring.judgeName}</Text>
              )}
            </View>
            <View style={s.ringBody}>
              {ring.breeds.map((breed, bi) => (
                <View key={bi} style={s.breedSection}>
                  {breed.breedName && (
                    <Text style={s.breedName}>{breed.breedName}</Text>
                  )}
                  {breed.classes.map((cls, ci) => {
                    const sexLabel = cls.sex === 'dog' ? 'D' : cls.sex === 'bitch' ? 'B' : '';
                    return (
                      <View key={ci} style={s.classRow}>
                        <Text style={s.classNumber}>
                          {cls.classLabel ? `${cls.classLabel}.` : ''}
                        </Text>
                        <Text style={s.className}>{cls.className}</Text>
                        {sexLabel ? <Text style={s.classSex}>{sexLabel}</Text> : <View style={{ width: 50 }} />}
                        <Text style={s.classEntries}>({cls.entryCount})</Text>
                      </View>
                    );
                  })}
                  <Text style={s.breedTotal}>
                    {breed.totalEntries} entr{breed.totalEntries === 1 ? 'y' : 'ies'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text
          style={s.footer}
          render={({ pageNumber, totalPages }) =>
            `${showTypeLabel} — Ring Plan — Page ${pageNumber} of ${totalPages} — Generated by Remi`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
