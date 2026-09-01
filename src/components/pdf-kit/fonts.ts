/**
 * pdf-kit/fonts — the ONE registration point for new pdf-kit-based
 * documents.
 *
 * IMPORTANT — this does NOT replace the existing per-document font
 * registrations (src/lib/pdf-fonts.ts, catalogue-styles.ts,
 * schedule/shared/styles.ts, judges-book.tsx, prize-cards.tsx, etc). Those
 * files register slightly different subsets of weight/style combinations
 * for the same families (e.g. schedule/shared/styles.ts's Times has no
 * bold+italic combo; catalogue-styles.ts's does), so swapping any of them
 * for this module is NOT behaviour-identical and is left alone — see the
 * pdf-kit README's "Fonts" section and the build report for the full
 * comparison. This module is for pages built ON pdf-kit going forward.
 *
 * Three rules this file exists to enforce:
 *
 * 1. IDEMPOTENCY. @react-pdf/renderer's `Font.register` APPENDS to a
 *    family's source list rather than replacing it — calling register()
 *    twice for the same (family, weight, style) tuple creates duplicate
 *    FontSource entries. Because ESM module caching only de-dupes a single
 *    module specifier, and this module may be reached via more than one
 *    import path in a large bundle, registration is additionally guarded by
 *    a module-level boolean.
 *
 * 2. THE 3-FAMILY LIMIT. There is a confirmed react-pdf/pdfkit bug (pinned
 *    version 4.3.2): a document that uses a 4th distinct font family (on
 *    top of the three already in play) corrupts an UNRELATED page's font
 *    resource dictionary elsewhere in the same document — reproducible
 *    regardless of weight notation, `fixed` usage, or how many style slots
 *    use the new family. `pdffonts` reports it embedded correctly; poppler
 *    fails a different page with "Unknown font tag" / "No font in
 *    show/space". See src/lib/pdf-fonts.ts for the full writeup. HankenGrotesk
 *    is kept in its own isolated registration for exactly this reason —
 *    it must never be combined with Times + LibreBaskerville + Inter (or any
 *    other 3 families) in the same document.
 *
 *    `registerPdfKitFonts()` therefore registers at most 3 non-Hanken
 *    families (Times, Inter, LibreBaskerville) and `assertFontBudget()` lets
 *    a document assert its OWN intended family set stays within budget —
 *    call it with the families you actually use so a future edit that adds
 *    a 4th throws in dev/tests rather than corrupting print output.
 *
 * 3. ONE PLACE TO LOOK. Every font file path lives here, not scattered
 *    across a dozen `path.join(fontsDir, ...)` calls.
 */
import path from 'path';
import { Font } from '@react-pdf/renderer';
// Side-effect: registers HankenGrotesk exactly once, exactly as every
// existing consumer already does it (see catalogue-styles.ts,
// schedule/shared/styles.ts, grading-cards-pdf.tsx) — `import
// '@/lib/pdf-fonts'`. Runs the moment this module loads, which is safe even
// for callers that only want `registerPdfKitFonts()`'s three families:
// the react-pdf/pdfkit 4-family bug (see rule 2 below) is triggered by a
// document actually USING a 4th family's glyphs ("even a single one-off
// usage triggers it" — src/lib/pdf-fonts.ts), not by it merely being
// registered and never referenced. `registerHankenGrotesk()` below is a
// documented no-op call so pdf-kit component code can self-document intent
// without needing to know registration already happened here — deliberately
// NOT a dynamic `require()`/`import()`, which esbuild/tsx treat as making
// the whole module CommonJS and mangles its named exports.
import '@/lib/pdf-fonts';

const fontsDir = path.join(process.cwd(), 'public', 'fonts');

/** The non-Hanken families pdf-kit documents may draw on. Hanken Grotesk is
 *  registered separately (see `registerHankenGrotesk` below) and must never
 *  be combined with these three in one document — see rule 2 above. */
export const PDF_KIT_FAMILIES = ['Times', 'Inter', 'LibreBaskerville'] as const;
export type PdfKitFamily = (typeof PDF_KIT_FAMILIES)[number];

/** Every family a document is allowed to touch, including Hanken Grotesk —
 *  used only by `assertFontBudget` to size a caller's declared family set. */
export type PdfKitAnyFamily = PdfKitFamily | 'HankenGrotesk';

let registered = false;

/**
 * Registers Times, Inter and LibreBaskerville (all weight/style combos
 * pdf-kit components use) plus the hyphenation-disable callback. Safe to
 * call from multiple modules — the module-level guard makes it a no-op
 * after the first call.
 */
export function registerPdfKitFonts(): void {
  if (registered) return;
  registered = true;

  Font.register({
    family: 'Times',
    fonts: [
      { src: path.join(fontsDir, 'times-new-roman.ttf') },
      { src: path.join(fontsDir, 'times-new-roman-bold.ttf'), fontWeight: 'bold' },
      { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontStyle: 'italic' },
      {
        src: path.join(fontsDir, 'times-new-roman-italic.ttf'),
        fontWeight: 'bold',
        fontStyle: 'italic',
      },
    ],
  });

  Font.register({
    family: 'LibreBaskerville',
    fonts: [
      { src: path.join(fontsDir, 'libre-baskerville-regular.ttf') },
      { src: path.join(fontsDir, 'libre-baskerville-bold.ttf'), fontWeight: 'bold' },
      { src: path.join(fontsDir, 'libre-baskerville-regular.ttf'), fontStyle: 'italic' },
      {
        src: path.join(fontsDir, 'libre-baskerville-bold.ttf'),
        fontWeight: 'bold',
        fontStyle: 'italic',
      },
    ],
  });

  Font.register({
    family: 'Inter',
    fonts: [
      { src: path.join(fontsDir, 'inter-regular.ttf') },
      { src: path.join(fontsDir, 'inter-regular.ttf'), fontStyle: 'italic' },
      { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold' },
      { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
  });

  // Dog names and pedigree text should never hyphenate mid-word.
  Font.registerHyphenationCallback((word) => [word]);
}

/**
 * Marks the intent to use HankenGrotesk — same face manifest
 * (src/lib/hanken-faces.ts), same registration, UNCHANGED from
 * src/lib/pdf-fonts.ts. The actual `Font.register` call already ran via
 * this module's top-level `import '@/lib/pdf-fonts'` (see that import's
 * comment for why it's a static side-effect import rather than a lazy
 * `require`/`import()` inside this function) — this is a documented no-op
 * so pdf-kit component code has an explicit call to make, self-documenting
 * that the document uses Hanken Grotesk and therefore must NOT also use
 * Times/Inter/LibreBaskerville content in the same document (rule 2 above).
 */
export function registerHankenGrotesk(): void {
  // Intentionally empty — see the module-level `import '@/lib/pdf-fonts'`
  // above and this function's doc comment.
}

/**
 * Dev/test guard for rule 2: throws if `families` (the full set a document
 * intends to use, Hanken Grotesk included) exceeds the 3-family budget that
 * is safe with @react-pdf/renderer 4.3.2. Call it once per document module
 * with the families that document actually renders, e.g.:
 *
 *   assertFontBudget(['Times', 'Inter']);
 *
 * This can only catch what the caller declares — it does not introspect
 * actual `fontFamily` usage — but it turns "someone adds a 4th family six
 * months from now" into a loud dev-time throw instead of a silently
 * corrupted print PDF on an unrelated page.
 */
export function assertFontBudget(families: readonly PdfKitAnyFamily[]): void {
  const unique = new Set(families);
  if (unique.size > 3) {
    throw new Error(
      `pdf-kit: document declares ${unique.size} font families ` +
        `(${[...unique].join(', ')}) — @react-pdf/renderer 4.3.2 corrupts an ` +
        `unrelated page's font resources past 3 families in one document. ` +
        `See src/components/pdf-kit/fonts.ts and src/lib/pdf-fonts.ts.`,
    );
  }
  if (unique.has('HankenGrotesk') && unique.size > 1) {
    throw new Error(
      `pdf-kit: HankenGrotesk must never be combined with other families in ` +
        `the same document (confirmed corrupts unrelated pages) — declared: ` +
        `${[...unique].join(', ')}. See src/lib/pdf-fonts.ts.`,
    );
  }
}
