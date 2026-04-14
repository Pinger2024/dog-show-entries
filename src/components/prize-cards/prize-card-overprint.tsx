import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';

/**
 * Prize Card OVERPRINT layer — text/logo-only PDF designed to be
 * printed on top of Mixam-pre-printed blank prize cards.
 *
 * The Mixam bulk-printed base cards contain the coloured flourishes,
 * placement word ("FIRST" etc), rosette, and Remi medallion — all
 * show-independent. This overprint supplies the show-specific parts:
 * club logo, club name, show name, show type, date. Positioned to
 * land on the cream middle zone of each base card when fed through
 * a home laser printer.
 *
 * Output: 5-page PDF, one page per placement colour. Content is
 * identical across all 5 pages (the placement word is already on
 * the base). User prints e.g. 20 copies of page 1 (with red blanks
 * loaded), swaps to blue blanks, prints 20 copies of page 2, etc.
 *
 * IMPORTANT: page size must exactly match the Mixam base card
 * dimensions so the overprint content lands where the cream zone
 * is. Mixam base is A5 landscape (210×148mm = 595×420pt).
 */

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

export interface OverprintShowInfo {
  clubName: string;
  showName: string;
  showType: string;
  date: string; // ISO yyyy-mm-dd
  logoUrl: string | null;
  /** Main breed judges (excludes JH and other non-breed roles).
   *  sex: null = both, 'dog' = dogs only, 'bitch' = bitches only.
   *  affix: optional kennel club affix appended in parentheses. */
  judges?: { name: string; sex: 'dog' | 'bitch' | null; affix?: string | null }[];
}

interface OverprintProps {
  show: OverprintShowInfo;
}

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

// Mixam A5 landscape: 595 × 420 pts
// The cream overprint zone on the base card (measured from the
// Amanda/Gemini PNG) runs roughly y=85pt to y=300pt, with safe
// horizontal centre column from x=90pt to x=505pt.
const styles = StyleSheet.create({
  // Use flow layout with padding instead of absolute positioning.
  // React-pdf collapses pages that only contain absolute-positioned
  // children; putting the content in the flex-1 flow forces the Page
  // to claim its full A5 landscape canvas.
  page: {
    fontFamily: 'Times',
    padding: '110 95 135 95', // top right bottom left — positions the
                              // overprint zone over the cream middle
                              // of the Mixam base card
    backgroundColor: 'transparent',
  },
  overprintZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  logo: {
    width: 48,
    height: 48,
    objectFit: 'contain',
    marginBottom: 8,
  },
  clubName: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#1a1a1a',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  showName: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#333',
    marginBottom: 4,
  },
  showMeta: {
    fontSize: 10,
    textAlign: 'center',
    color: '#555',
    letterSpacing: 0.3,
  },
  judgeLine: {
    fontSize: 12,
    textAlign: 'center',
    color: '#333',
    marginTop: 10,
    letterSpacing: 0.3,
  },
});

export function PrizeCardOverprint({ show }: OverprintProps) {
  const showDate = new Date(show.date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const showTypeLabel = SHOW_TYPE_LABELS[show.showType] ?? show.showType;

  const formatJudge = (j: { name: string; affix?: string | null }) =>
    j.affix ? `${j.name} (${j.affix})` : j.name;

  // When a show has multiple judges, each judge needs their OWN set
  // of cards (dog winners are judged by the dog judge, bitch winners
  // by the bitch judge, etc). So we produce 5 placements × N judges
  // pages, grouped BY PLACEMENT — Amanda loads red blanks, prints
  // every judge's 1st card, swaps to blue blanks, prints every
  // judge's 2nd card, and so on. One colour-swap per placement.
  const judges = show.judges ?? [];
  const variants: { judgeLine: string | null }[] = judges.length === 0
    ? [{ judgeLine: null }]
    : judges.map((j) => ({ judgeLine: `Judge: ${formatJudge(j)}` }));

  const placements = [1, 2, 3, 4, 5];
  const pages: { placement: number; judgeLine: string | null; key: string }[] = [];
  for (const p of placements) {
    for (let i = 0; i < variants.length; i++) {
      pages.push({
        placement: p,
        judgeLine: variants[i].judgeLine,
        key: `${p}-${i}`,
      });
    }
  }

  return (
    <Document title={`Prize Card Overprint — ${show.clubName}`} author="Remi Show Manager">
      {pages.map((page) => (
        <Page key={page.key} size="A5" orientation="landscape" style={styles.page} wrap={false}>
          <View style={styles.overprintZone}>
            {show.logoUrl && <Image src={show.logoUrl} style={styles.logo} />}
            <Text style={styles.clubName}>{show.clubName}</Text>
            <Text style={styles.showName}>{show.showName}</Text>
            <Text style={styles.showMeta}>
              {showTypeLabel} · {showDate}
            </Text>
            {page.judgeLine && <Text style={styles.judgeLine}>{page.judgeLine}</Text>}
          </View>
        </Page>
      ))}
    </Document>
  );
}
