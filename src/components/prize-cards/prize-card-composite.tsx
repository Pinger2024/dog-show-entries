import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';
import type { PrizeCardPage } from '@/lib/prize-card-pages';

/**
 * Prize Card COMPOSITE — the official template design. Unlike the plain
 * generated cards (prize-cards.tsx) or the print-your-own-blanks overprint
 * (prize-card-overprint.tsx), this renders the actual Mixam-designed
 * artwork (public/prize-cards/*.jpg) as a full-bleed A5-landscape
 * background with the show-specific text overprinted in the cream zone.
 *
 * ONE PAGE PER PHYSICAL CARD NEEDED (Mandy 2026-07-30) — not one page per
 * placement. The full suite of pages (e.g. Minor Puppy Dog 1st/2nd, Puppy
 * Dog 1st/2nd/3rd, Junior Dog 1st, ...) is built upstream by
 * buildPrizeCardPages (src/lib/prize-card-pages.ts) from per-class
 * confirmed-entry counts and per-class judge attribution; this component
 * just renders whatever page list it's given, in the order given —
 * CLASS-MAJOR (each class's own placements in sequence, classes in their
 * running order), per Mandy's correction — see that module for why.
 * Duplicate pages for the same placement/judge ARE deliberate — a print
 * shop like Doxzoo prices a single upload with N literal pages differently
 * from "one page, N copies", so the PDF must contain every card as its
 * own page. Each page also carries its class's own label (Mandy, South
 * Western: "the name of the class is on them", 2026-07-30) — built
 * upstream via the canonical buildClassLabelMap, never hand-formatted here.
 *
 * ⚠️ react-pdf page-size trap: react-pdf collapses a Page that only
 * contains absolutely-positioned children. The template Image MUST be the
 * in-flow element (default flow, not `position: absolute`) sized to
 * EXACTLY the page dimensions with objectFit 'fill' — that's what forces
 * the Page to claim its full canvas. The text is then layered on top in
 * an absolutely-positioned View.
 *
 * ✅ Verified (not assumed): pdfkit's image embedder (`_imageRegistry`,
 * node_modules/@react-pdf/pdfkit) keys on the literal `src` string and
 * embeds each distinct image ONCE, reusing the same XObject across every
 * page that references it — it does not re-embed per page. A quick
 * standalone check confirmed this: 1 page vs 30 pages of the same JPEG
 * produced 377KB vs 393KB (not 30×), and a realistic 75-card suite
 * (25/22/15/13 across the four templates) rendered to ~1.6MB. `src` MUST
 * stay the exact same string (`path.join(templatesDir, TEMPLATE_FILES[n])`)
 * for every page of a given placement so the cache key matches — the route
 * still logs the final byte size (see route.ts) so a future regression that
 * defeats the cache (e.g. a per-page-unique src) is visible, not silent.
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

export interface CompositeShowInfo {
  clubName: string;
  showName: string;
  showType: string;
  date: string; // ISO yyyy-mm-dd
}

interface CompositeProps {
  show: CompositeShowInfo;
  /** The full ordered page list from buildPrizeCardPages — one entry per
   *  physical card. Empty means no class has any confirmed entries yet;
   *  the component renders a single explanatory page rather than a
   *  zero-page (invalid) PDF in that case. */
  pages: PrizeCardPage[];
}

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

// The four placements we have Mixam-designed template artwork for.
// No VHC template exists, so the composite tops out at Reserve.
const TEMPLATE_FILES: Record<number, string> = {
  1: '1-first.jpg',
  2: '2-second.jpg',
  3: '3-third.jpg',
  4: '4-reserve.jpg',
};

const templatesDir = path.join(process.cwd(), 'public', 'prize-cards');

// Exact A5-landscape point dimensions (210mm × 148mm). Must match the
// Page `size` prop exactly — react-pdf treats a fractional mismatch as a
// scale error and the fill no longer reaches every edge.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 419.53;

const styles = StyleSheet.create({
  page: {
    position: 'relative',
  },
  template: {
    // In-flow, full-bleed background. Do NOT make this `position: absolute`
    // — react-pdf collapses the page to zero height if every child is
    // absolutely positioned.
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    objectFit: 'fill',
  },
  overprintZone: {
    position: 'absolute',
    top: 104,
    left: 95,
    right: 95,
    alignItems: 'center',
  },
  clubName: {
    fontFamily: 'Times',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#7A1620',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  showName: {
    fontFamily: 'Times',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#3a3a3a',
    marginBottom: 3,
  },
  showMeta: {
    fontFamily: 'Times',
    fontSize: 9,
    textAlign: 'center',
    color: '#555',
    letterSpacing: 0.2,
  },
  classLine: {
    fontFamily: 'Times',
    fontSize: 10,
    textAlign: 'center',
    color: '#3a3a3a',
    marginTop: 6,
  },
  judgeLine: {
    fontFamily: 'Times',
    fontSize: 10,
    textAlign: 'center',
    color: '#3a3a3a',
    marginTop: 6,
  },
});

export function PrizeCardComposite({ show, pages }: CompositeProps) {
  const showDate = new Date(show.date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const showTypeLabel = SHOW_TYPE_LABELS[show.showType] ?? show.showType;

  // No confirmed entries anywhere yet — a zero-Page Document is invalid PDF,
  // so render one explanatory page instead of erroring or 404ing (same
  // "still 200, friendly message" convention as the Documents page's own
  // "No entries yet" counts line, and the Marked Catalogue's "will be empty
  // until results are published" note — this route stays available before
  // it 404s the secretary out of a valid, just-empty show).
  const isEmpty = pages.length === 0;
  const renderPages = isEmpty ? [{ placement: 1 as const, judgeLine: null, classLine: '' }] : pages;

  return (
    <Document title={`Prize Cards — ${show.clubName}`} author="Remi Show Manager">
      {renderPages.map((page, i) => (
        <Page key={i} size={[PAGE_WIDTH, PAGE_HEIGHT]} style={styles.page} wrap={false}>
          <Image src={path.join(templatesDir, TEMPLATE_FILES[page.placement])} style={styles.template} />
          <View style={styles.overprintZone}>
            <Text style={styles.clubName}>{show.clubName}</Text>
            <Text style={styles.showName}>{show.showName}</Text>
            <Text style={styles.showMeta}>
              {showTypeLabel} · {showDate}
            </Text>
            {isEmpty ? (
              <Text style={styles.judgeLine}>No entries confirmed yet — check back closer to the show</Text>
            ) : (
              <>
                {page.classLine && <Text style={styles.classLine}>{page.classLine}</Text>}
                {page.judgeLine && <Text style={styles.judgeLine}>{page.judgeLine}</Text>}
              </>
            )}
          </View>
        </Page>
      ))}
    </Document>
  );
}
