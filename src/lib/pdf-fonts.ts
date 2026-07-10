/**
 * Single shared registration point for the Hanken Grotesk face (Show
 * Experience green rebrand, 2026-07-10).
 *
 * IMPORTANT: this must be registered EXACTLY ONCE for the whole process.
 * @react-pdf/renderer's `Font.register` APPENDS to a family's source list
 * rather than replacing it — registering the identical (family, weight,
 * style) combination twice from two different modules creates duplicate
 * FontSource entries for the same descriptor, which is unsafe.
 *
 * KNOWN LIMITATION (2026-07-10): a document that uses a 4th distinct font
 * family (on top of the Inter/LibreBaskerville/Times already used
 * throughout the RKC catalogue, RKC schedule, and Judge's Book) corrupts an
 * unrelated later page's font-resource dictionary — reproducible with ANY
 * 4th family (confirmed with plain Inter bytes registered under a different
 * name, i.e. NOT something specific to the real Hanken Grotesk TTFs),
 * regardless of font weight notation (string vs numeric), regardless of
 * `fixed` vs non-fixed usage, and regardless of how many style slots use
 * the new family (even a single one-off usage triggers it on one of these
 * documents). `pdffonts` reports the font as embedded correctly, but
 * `pdftoppm`/poppler fails an unrelated page with "Unknown font tag" /
 * "No font in show/space" — the PDF is genuinely malformed despite passing
 * a naive embedding check. This looks like an upstream
 * @react-pdf/renderer/pdfkit bug (pinned version 4.3.2) triggered by SOME
 * documents' specific page/content structure — it did NOT reproduce on the
 * SV/WUSV schedule or catalogue (which use 4 families successfully), only
 * on the RKC-ruleset catalogue/schedule and the Judge's Book. Because it's
 * data/structure-dependent rather than a clean per-family rule, RKC
 * catalogue/schedule/Judge's Book heading styles were reverted to their
 * pre-existing LibreBaskerville/Times faces rather than risk silently
 * corrupting some (but not all) clubs' printed output. Hanken Grotesk is
 * only used where it's been verified safe: the SV/WUSV schedule +
 * catalogue's `eyebrow`/`panelInkEyebrow` (see sv-styles.ts) and the
 * standalone secretary report PDFs (show-report-pdf.tsx, which never
 * combines with the other three families in the same document).
 */
import path from 'path';
import { Font } from '@react-pdf/renderer';
import { HANKEN_GROTESK_FACES } from '@/lib/hanken-faces';

const fontsDir = path.join(process.cwd(), 'public', 'fonts');

Font.register({
  family: 'HankenGrotesk',
  // Weight 400 registers with no explicit fontWeight (react-pdf's default);
  // 700 registers as the 'bold' alias — both preserve the previous
  // hand-written registration exactly, now generated from the shared
  // HANKEN_GROTESK_FACES manifest instead of being duplicated here.
  fonts: HANKEN_GROTESK_FACES.map((face) => ({
    src: path.join(fontsDir, face.file),
    ...(face.weight !== 400 ? { fontWeight: face.weight === 700 ? ('bold' as const) : face.weight } : {}),
    ...(face.style ? { fontStyle: face.style } : {}),
  })),
});
