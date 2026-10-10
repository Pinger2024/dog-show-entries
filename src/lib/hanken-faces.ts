/**
 * Single source of truth for the Hanken Grotesk face set (Show Experience
 * green rebrand, 2026-07-10). Filenames live in public/fonts/.
 *
 * Consumed by both:
 *   - pdf-fonts.ts's Font.register()        (react-pdf/renderer, PDFs)
 *   - share-image-data.ts's loadShareImageFonts() (satori, share images)
 *
 * Kept as a standalone data-only module (no react-pdf import) so it's safe
 * to pull into the satori/share-image code path without dragging
 * @react-pdf/renderer's Font.register side effect along with it.
 */
export interface HankenGroteskFace {
  file: string;
  weight: 400 | 500 | 600 | 700 | 800;
  style?: 'italic';
}

export const HANKEN_GROTESK_FACES: readonly HankenGroteskFace[] = [
  { file: 'hanken-grotesk-regular.ttf', weight: 400 },
  { file: 'hanken-grotesk-500.ttf', weight: 500 },
  { file: 'hanken-grotesk-600.ttf', weight: 600 },
  { file: 'hanken-grotesk-700.ttf', weight: 700 },
  { file: 'hanken-grotesk-800.ttf', weight: 800 },
  { file: 'hanken-grotesk-italic.ttf', weight: 400, style: 'italic' },
  { file: 'hanken-grotesk-700italic.ttf', weight: 700, style: 'italic' },
];
