import { PDFDocument, StandardFonts, rgb, type PDFPage, PDFName, PDFDict, Duplex } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import path from 'path';

// The base-14 standard fonts. react-pdf leaves a Helvetica / Helvetica-Oblique
// reference in every page's Resources — print preflight (Tradeprint/Mixam)
// rejects any unembedded font, so these have to go before print.
//
// IMPORTANT (2026-07-10 finding): this reference is NOT always genuinely
// unused. react-pdf emits a `BT /F<n> <size> Tf ET` sequence (font selected,
// nothing drawn) for blank/empty `<Text>` nodes, and on some pages that tag
// IS the base-14 one. Simply DELETING the Resources entry in that case
// leaves the content stream's `Tf` operator pointing at a resource that no
// longer exists — harmless visually (nothing was ever drawn under that tag)
// but it corrupts strict PDF parsing: poppler (pdftoppm) fails the page with
// "Unknown font tag" / "No font in show/space", and a real print-preflight
// tool would very plausibly reject the same dangling reference. Confirmed
// by inspecting the raw content stream of an affected page — the base-14 tag
// appeared inside empty `BT...Tf...ET` blocks with no `Tj`/`TJ` in between.
// Fix: ALIAS the tag to an already-embedded font on the same page instead of
// deleting it outright — the `Tf` reference stays valid (now resolving to an
// embedded font), nothing is visually different (nothing was drawn under it
// either way), and print preflight no longer sees an unembedded font.
const BASE14_FONTS = new Set([
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Symbol', 'ZapfDingbats',
]);

/**
 * Strip the unembedded base-14 phantom font references react-pdf leaves in
 * every rendered document's page Resources (see BASE14_FONTS above) — even
 * documents that never reach `padPdfToMultiple` (the schedule PDF has no
 * booklet-padding requirement, but still picks up the same phantom refs).
 * Print preflight (Tradeprint/Mixam) rejects any unembedded font, so every
 * PDF leaving the print pipeline needs this pass. No-ops if nothing matches;
 * page count and content are otherwise untouched.
 */
export async function stripUnembeddedBase14Fonts(input: Uint8Array | Buffer): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input);
  doc.registerFontkit(fontkit);
  stripBase14Fonts(doc, 0, doc.getPageCount());
  return doc.save();
}

/**
 * Set the PDF's own viewer preference to single-sided printing
 * (ViewerPreferences /Duplex /Simplex) — a compliant print dialog (Acrobat,
 * most browser PDF viewers, most driver dialogs) defaults its duplex option
 * to this rather than whatever the print box last remembered.
 *
 * Prize cards (Scotland 30 Aug 2026, memory
 * project_prize_cards_duplex_incident_2026-08-30): a 71-card PDF was printed
 * duplex at home — adjacent cards landed back-to-back on one sheet — and 36
 * sheets came out unusable. Prize cards are ONE PAGE PER CARD by design (see
 * the prize-cards route's doc comment), so duplex printing them is always
 * wrong; this is a post-processing step applied ONLY to the two prize-card
 * PDF endpoints, deliberately NOT inside padPdfToMultiple / booklet output —
 * catalogues/schedules/judges' books are genuinely meant to print duplex
 * (they're saddle-stitched booklets).
 */
export async function setSimplexViewerPreference(input: Uint8Array | Buffer): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input);
  doc.catalog.getOrCreateViewerPreferences().setDuplex(Duplex.Simplex);
  return doc.save();
}

/** Remove (or safely alias) unembedded base-14 font references from pages
 *  [start, end). See the BASE14_FONTS comment above for why this can't just
 *  delete the entry. */
function stripBase14Fonts(doc: PDFDocument, start: number, end: number): void {
  const pages = doc.getPages();
  for (let i = start; i < end; i++) {
    const resources = pages[i]?.node.Resources();
    const fontDict = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (!fontDict) continue;

    // Snapshot entries first — never mutate `fontDict` while iterating it.
    const entries = fontDict.entries();
    const base14Keys: (typeof entries)[number][0][] = [];
    let embeddedReplacement: (typeof entries)[number][1] | undefined;
    for (const [key, rawValue] of entries) {
      const fontObj = fontDict.lookupMaybe(key, PDFDict);
      const baseFont = fontObj?.get(PDFName.of('BaseFont'));
      const name = baseFont ? baseFont.toString().replace(/^\//, '') : '';
      if (BASE14_FONTS.has(name)) {
        base14Keys.push(key);
      } else if (!embeddedReplacement) {
        // Keep the RAW (un-dereferenced) value — usually a PDFRef — so we
        // can point another key at the exact same object below.
        embeddedReplacement = rawValue;
      }
    }

    for (const key of base14Keys) {
      if (embeddedReplacement) {
        // Alias the tag to an embedded font already on this page instead of
        // deleting it — safe even if react-pdf's empty-Text `Tf` selects
        // this exact tag elsewhere in the content stream (nothing is ever
        // actually drawn under it, so repointing it is visually a no-op).
        fontDict.set(key, embeddedReplacement);
      } else {
        // No embedded font on this page to alias to (shouldn't happen in
        // practice — every page renders at least one real font) — fall back
        // to deleting, which is safe only if the tag is truly unreferenced.
        fontDict.delete(key);
      }
    }
  }
}

// Inter TTFs for the padding pages — embedded (subsetted) so the booklet has NO
// unembedded fonts. Replaces StandardFonts.Helvetica, which is base-14.
let interRegularBytes: Uint8Array | null = null;
let interSemiBoldBytes: Uint8Array | null = null;
function loadInter(): { regular: Uint8Array; semibold: Uint8Array } | null {
  try {
    const dir = path.join(process.cwd(), 'public', 'fonts');
    interRegularBytes ??= readFileSync(path.join(dir, 'inter-regular.ttf'));
    interSemiBoldBytes ??= readFileSync(path.join(dir, 'inter-semibold.ttf'));
    return { regular: interRegularBytes, semibold: interSemiBoldBytes };
  } catch {
    return null;
  }
}

// Remi green — matching the catalogue section-band colour so the
// padded pages don't look like foreign insertions.
const BRAND_GREEN = rgb(0x1f / 255, 0x4a / 255, 0x3a / 255);
const LINE_GREY = rgb(0.78, 0.78, 0.78);
const FOOTER_GREY = rgb(0.55, 0.55, 0.55);

function drawNotesPage(
  page: PDFPage,
  opts: {
    width: number;
    height: number;
    titleFont: Awaited<ReturnType<PDFDocument['embedFont']>>;
    footerFont: Awaited<ReturnType<PDFDocument['embedFont']>>;
  },
) {
  const { width, height, titleFont, footerFont } = opts;
  const PAGE_MARGIN_X = 24;
  const TOP_MARGIN = 32;
  const BOTTOM_MARGIN = 32;
  const TITLE_SIZE = 14;
  const LINE_SPACING = 22;

  const title = 'NOTES';
  const titleWidth = titleFont.widthOfTextAtSize(title, TITLE_SIZE);
  const titleY = height - TOP_MARGIN - TITLE_SIZE;
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: titleY,
    size: TITLE_SIZE,
    font: titleFont,
    color: BRAND_GREEN,
  });

  const ruleWidth = 36;
  const ruleY = titleY - 6;
  page.drawLine({
    start: { x: (width - ruleWidth) / 2, y: ruleY },
    end: { x: (width + ruleWidth) / 2, y: ruleY },
    thickness: 0.8,
    color: BRAND_GREEN,
  });

  const firstLineY = ruleY - 28;
  const lastLineY = BOTTOM_MARGIN + 16;
  for (let y = firstLineY; y >= lastLineY; y -= LINE_SPACING) {
    page.drawLine({
      start: { x: PAGE_MARGIN_X, y },
      end: { x: width - PAGE_MARGIN_X, y },
      thickness: 0.4,
      color: LINE_GREY,
    });
  }

  const footerText = 'Notes  ·  Generated by Remi';
  const footerSize = 7;
  const footerWidth = footerFont.widthOfTextAtSize(footerText, footerSize);
  page.drawText(footerText, {
    x: (width - footerWidth) / 2,
    y: 16,
    size: footerSize,
    font: footerFont,
    color: FOOTER_GREY,
  });
}

// Cache the back-cover JPEG at module load — it's identical on every
// render so there's no point re-reading it from disk each time.
let backCoverBytes: Uint8Array | null = null;
function loadBackCover(): Uint8Array | null {
  if (backCoverBytes !== null) return backCoverBytes;
  try {
    const p = path.join(process.cwd(), 'public', 'branding', 'remi-back-cover.jpg');
    backCoverBytes = readFileSync(p);
    return backCoverBytes;
  } catch {
    return null;
  }
}

export async function drawBackCoverPage(
  doc: PDFDocument,
  page: PDFPage,
  opts: { width: number; height: number },
) {
  const { width, height } = opts;
  const bytes = loadBackCover();
  if (!bytes) {
    // If the asset is missing for any reason, fall back to a plain
    // branded page so the booklet page count stays correct.
    page.drawRectangle({ x: 0, y: 0, width, height, color: BRAND_GREEN });
    return;
  }
  const jpg = await doc.embedJpg(bytes);
  // Full-bleed fit. The marketing creative is landscape (~1.5:1);
  // letterbox above/below on A5 portrait with brand-green fill so
  // the page reads as a deliberate back cover rather than a scaled
  // image surrounded by white.
  const imgRatio = jpg.width / jpg.height;
  const imgDrawWidth = width;
  const imgDrawHeight = imgDrawWidth / imgRatio;
  const imgY = (height - imgDrawHeight) / 2;

  page.drawRectangle({ x: 0, y: 0, width, height, color: BRAND_GREEN });
  page.drawImage(jpg, {
    x: 0,
    y: imgY,
    width: imgDrawWidth,
    height: imgDrawHeight,
  });
}

/**
 * Pad a PDF buffer so its page count is a multiple of the given
 * modulus. Saddle-stitched booklets (Mixam et al.) fold A4 sheets
 * in half → 4 pages per physical sheet, so the PDF's page count
 * MUST be a multiple of 4 or the printer will reject it.
 *
 * Rather than appending blank pages, the padding is put to use:
 *   - The final padded page is a Remi-branded back cover (when the
 *     back-cover JPEG is present).
 *   - Any padding pages BEFORE the back cover are ruled Notes pages
 *     for handwritten placements / critiques.
 *
 * Returns a new Uint8Array; the input is not mutated.
 */
export async function padPdfToMultiple(
  input: Uint8Array | Buffer,
  modulus = 4,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input);
  doc.registerFontkit(fontkit);
  const currentPages = doc.getPageCount();

  // Strip the unembedded base-14 phantom font react-pdf leaves in the rendered
  // catalogue pages' Resources, so the booklet passes print preflight. The
  // Notes/back-cover pages added below embed Inter, so they stay clean.
  stripBase14Fonts(doc, 0, currentPages);

  const target = Math.ceil(currentPages / modulus) * modulus;
  const pagesToAdd = target - currentPages;

  if (pagesToAdd === 0) {
    return doc.save();
  }

  const lastPage = doc.getPage(currentPages - 1);
  const { width, height } = lastPage.getSize();

  // Embed Inter (subsetted) for the padding pages so nothing is base-14
  // Helvetica. Falls back to the standard font only if the TTFs are missing.
  const inter = loadInter();
  const titleFont = inter
    ? await doc.embedFont(inter.semibold)
    : await doc.embedFont(StandardFonts.HelveticaBold);
  const footerFont = inter
    ? await doc.embedFont(inter.regular)
    : await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pagesToAdd; i++) {
    const page = doc.addPage([width, height]);
    const isFinalPage = i === pagesToAdd - 1;
    if (isFinalPage) {
      await drawBackCoverPage(doc, page, { width, height });
    } else {
      drawNotesPage(page, { width, height, titleFont, footerFont });
    }
  }

  return doc.save();
}
