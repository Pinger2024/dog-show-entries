import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';

// Register Inter for a clean, modern look
const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(fontsDir, 'inter-regular.ttf') },
    { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

export interface RingNumberShowInfo {
  name: string;
}

export type RingNumberFormat = 'multi-up' | 'single';

interface RingNumbersProps {
  show: RingNumberShowInfo;
  numbers: number[];
  format: RingNumberFormat;
}

// A7 in points: 74mm × 105mm = 209.76 × 297.64 pts
// A4 in points: 210mm × 297mm = 595.28 × 841.89 pts
// Layout: A7 landscape cards (105 × 74mm) → 2 cols × 4 rows = 8 per A4 page
const CARDS_PER_ROW = 2;
const ROWS_PER_PAGE = 4;
const CARDS_PER_PAGE = CARDS_PER_ROW * ROWS_PER_PAGE;

// Card dimensions in points (A7 landscape)
const CARD_W = 297.64; // 105mm
const CARD_H = 209.76; // 74mm

const multiUp = StyleSheet.create({
  page: {
    width: '210mm',
    height: '297mm',
    padding: 0,
    fontFamily: 'Inter',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    height: CARD_H,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#CCCCCC',
    borderStyle: 'dashed',
    position: 'relative',
  },
  number: {
    fontFamily: 'Inter',
    fontWeight: 'bold',
    fontSize: 72,
    color: '#1A1A1A',
    textAlign: 'center',
  },
  showName: {
    fontFamily: 'Inter',
    fontSize: 7,
    color: '#999999',
    textAlign: 'center',
    position: 'absolute',
    bottom: 14,
    left: 10,
    right: 10,
  },
  branding: {
    fontFamily: 'Inter',
    fontSize: 6,
    color: '#BBBBBB',
    textAlign: 'center',
    position: 'absolute',
    bottom: 6,
    left: 10,
    right: 10,
  },
});

const single = StyleSheet.create({
  page: {
    width: '148mm',
    height: '105mm',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter',
    position: 'relative',
  },
  number: {
    fontFamily: 'Inter',
    fontWeight: 'bold',
    fontSize: 120,
    color: '#1A1A1A',
    textAlign: 'center',
  },
  showName: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#666666',
    textAlign: 'center',
    marginTop: 10,
  },
  branding: {
    fontFamily: 'Inter',
    fontSize: 7,
    color: '#BBBBBB',
    textAlign: 'center',
    position: 'absolute',
    bottom: 10,
    left: 20,
    right: 20,
  },
});

export function RingNumbers({ show, numbers, format }: RingNumbersProps) {
  if (format === 'single') {
    return (
      <Document title={`Ring Numbers — ${show.name}`} author="Remi Show Manager">
        {numbers.map((num) => (
          <Page key={num} size={[419.53, 297.64]} style={single.page}>
            <Text style={single.number}>{num}</Text>
            <Text style={single.showName}>{show.name}</Text>
            <Text style={single.branding}>RemiShowManager.co.uk</Text>
          </Page>
        ))}
      </Document>
    );
  }

  // Multi-up: 8 per A4 page (2 cols × 4 rows of A7 landscape cards)
  const pages: number[][] = [];
  for (let i = 0; i < numbers.length; i += CARDS_PER_PAGE) {
    pages.push(numbers.slice(i, i + CARDS_PER_PAGE));
  }

  return (
    <Document title={`Ring Numbers — ${show.name}`} author="Remi Show Manager">
      {pages.map((pageNumbers, pageIdx) => {
        const rows: number[][] = [];
        for (let r = 0; r < ROWS_PER_PAGE; r++) {
          const start = r * CARDS_PER_ROW;
          const rowNums = pageNumbers.slice(start, start + CARDS_PER_ROW);
          if (rowNums.length > 0) rows.push(rowNums);
        }

        return (
          <Page key={pageIdx} size="A4" style={multiUp.page}>
            {rows.map((rowNums, rowIdx) => (
              <View key={rowIdx} style={multiUp.row}>
                {rowNums.map((num) => (
                  <View key={num} style={multiUp.card}>
                    <Text style={multiUp.number}>{num}</Text>
                    <Text style={multiUp.showName}>{show.name}</Text>
                    <Text style={multiUp.branding}>RemiShowManager.co.uk</Text>
                  </View>
                ))}
                {/* Fill empty cells in last row */}
                {rowNums.length < CARDS_PER_ROW &&
                  Array.from({ length: CARDS_PER_ROW - rowNums.length }, (_, i) => (
                    <View key={`empty-${i}`} style={multiUp.card} />
                  ))}
              </View>
            ))}
          </Page>
        );
      })}
    </Document>
  );
}
