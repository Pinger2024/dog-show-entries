/**
 * pdf-kit/measure — deterministic text measurement against the ACTUAL TTFs
 * pdf-kit documents embed, using `fontkit` (already a transitive dependency
 * via `@pdf-lib/fontkit` — no new package added).
 *
 * @react-pdf/renderer has no measure-before-render API: you find out a
 * block overflowed only after it's rendered (see
 * `src/server/services/schedule-render.ts`'s render → count-pages → re-render
 * loop). This module lets a component decide to shrink text, split into
 * columns, or fall back to a denser layout BEFORE rendering, by measuring
 * against the same glyph outlines and metrics react-pdf/pdfkit will use.
 *
 * Measurements are in the same unit as react-pdf's `fontSize` and layout
 * dimensions — PDF points (pt), 1/72 inch — so a width returned here can be
 * compared directly against a `<View style={{ width: N }}>` or an A4/A5 page
 * dimension in pt.
 *
 * Font resolution here is intentionally independent of react-pdf's own
 * `Font.register` bookkeeping — it reads the same TTF files directly off
 * disk from `public/fonts`, matching the face tables `pdf-kit/fonts.ts`
 * registers. If a family gains a new weight/style file, add it to
 * `FACE_TABLES` below AND to `fonts.ts`'s `registerPdfKitFonts` /
 * `registerHankenGrotesk` — the two are kept in sync by hand, not by
 * sharing one table, because `fonts.ts` needs `Font.register`'s exact
 * `{ src, fontWeight, fontStyle }` shape while this module needs a flat
 * weight/style → file lookup.
 */
import fs from 'fs';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import type { PdfKitAnyFamily } from './fonts';

export type FontWeight = 400 | 500 | 600 | 700 | 800 | 'normal' | 'bold';
export type FontStyle = 'normal' | 'italic';

interface FaceDef {
  weight: number;
  style: FontStyle;
  file: string;
}

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

/** Mirrors the face sets `fonts.ts` registers (see file header for why this
 *  isn't literally the same table). Reused/synthesised faces — e.g. Inter's
 *  italic falling back to the upright regular.ttf, exactly as
 *  catalogue-styles.ts's own `Font.register` does — are listed explicitly so
 *  measurement always reads the file that will actually be embedded. */
const FACE_TABLES: Record<PdfKitAnyFamily, FaceDef[]> = {
  Times: [
    { weight: 400, style: 'normal', file: 'times-new-roman.ttf' },
    { weight: 700, style: 'normal', file: 'times-new-roman-bold.ttf' },
    { weight: 400, style: 'italic', file: 'times-new-roman-italic.ttf' },
    { weight: 700, style: 'italic', file: 'times-new-roman-italic.ttf' },
  ],
  LibreBaskerville: [
    { weight: 400, style: 'normal', file: 'libre-baskerville-regular.ttf' },
    { weight: 700, style: 'normal', file: 'libre-baskerville-bold.ttf' },
    { weight: 400, style: 'italic', file: 'libre-baskerville-regular.ttf' },
    { weight: 700, style: 'italic', file: 'libre-baskerville-bold.ttf' },
  ],
  Inter: [
    { weight: 400, style: 'normal', file: 'inter-regular.ttf' },
    { weight: 400, style: 'italic', file: 'inter-regular.ttf' },
    { weight: 700, style: 'normal', file: 'inter-semibold.ttf' },
    { weight: 700, style: 'italic', file: 'inter-semibold.ttf' },
  ],
  HankenGrotesk: [
    { weight: 400, style: 'normal', file: 'hanken-grotesk-regular.ttf' },
    { weight: 500, style: 'normal', file: 'hanken-grotesk-500.ttf' },
    { weight: 600, style: 'normal', file: 'hanken-grotesk-600.ttf' },
    { weight: 700, style: 'normal', file: 'hanken-grotesk-700.ttf' },
    { weight: 800, style: 'normal', file: 'hanken-grotesk-800.ttf' },
    { weight: 400, style: 'italic', file: 'hanken-grotesk-italic.ttf' },
    { weight: 700, style: 'italic', file: 'hanken-grotesk-700italic.ttf' },
  ],
};

function normalizeWeight(weight: FontWeight | undefined): number {
  if (weight === undefined || weight === 'normal') return 400;
  if (weight === 'bold') return 700;
  return weight;
}

// A minimal subset of the fontkit surface this module relies on — the
// published @pdf-lib/fontkit types are thin/untyped in places, so this pins
// exactly what we call.
interface FontkitFont {
  unitsPerEm: number;
  layout(text: string): { glyphs: unknown[]; positions: { xAdvance: number }[] };
}

const fontCache = new Map<string, FontkitFont>();

function loadFont(file: string): FontkitFont {
  const abs = path.join(FONTS_DIR, file);
  const cached = fontCache.get(abs);
  if (cached) return cached;
  const buf = fs.readFileSync(abs);
  const font = fontkit.create(buf) as unknown as FontkitFont;
  fontCache.set(abs, font);
  return font;
}

/** Picks the closest registered face for (family, weight, style): exact
 *  match first, then same weight ignoring style, then same style at the
 *  nearest weight, then the family's first face. Mirrors the fallback
 *  behaviour the existing hand-written `Font.register` calls document
 *  (e.g. "faces we don't have a dedicated file for are mapped to the
 *  closest available TTF", catalogue-styles.ts). */
function resolveFace(family: PdfKitAnyFamily, weight: FontWeight | undefined, style: FontStyle | undefined): FaceDef {
  const table = FACE_TABLES[family];
  const targetWeight = normalizeWeight(weight);
  const targetStyle: FontStyle = style ?? 'normal';

  let best: FaceDef = table[0];
  let bestScore = Infinity;
  for (const face of table) {
    const weightPenalty = Math.abs(face.weight - targetWeight);
    const stylePenalty = face.style === targetStyle ? 0 : 1000;
    const score = weightPenalty + stylePenalty;
    if (score < bestScore) {
      bestScore = score;
      best = face;
    }
  }
  return best;
}

export interface FontSpec {
  family: PdfKitAnyFamily;
  weight?: FontWeight;
  style?: FontStyle;
  size: number;
}

/**
 * Width, in PDF points, of `text` set in the given font/size — the same
 * unit as react-pdf's `fontSize` and layout dimensions. If `text` contains
 * `\n`, returns the width of its widest line (this function does not itself
 * wrap text — see `estimateLineCount` for that).
 */
export function measureTextWidth(text: string, spec: FontSpec): number {
  if (text === '') return 0;
  const face = resolveFace(spec.family, spec.weight, spec.style);
  const font = loadFont(face.file);
  const scale = spec.size / font.unitsPerEm;

  const lines = text.split('\n');
  let widest = 0;
  for (const line of lines) {
    const run = font.layout(line);
    let advance = 0;
    for (const pos of run.positions) advance += pos.xAdvance;
    widest = Math.max(widest, advance * scale);
  }
  return widest;
}

export interface LineWrapSpec extends FontSpec {
  /** Available width in points to wrap within. */
  width: number;
  /** Accepted for a shared options bag with `estimateTextHeight` — does not
   *  affect the returned line count. */
  lineHeight?: number;
}

/**
 * Estimates how many lines `text` will occupy when word-wrapped to
 * `width` at the given font/size — a greedy line-break simulation
 * equivalent to the one Yoga (react-pdf's layout engine) performs.
 *
 * Explicit `\n` characters always force a new line (each contributes at
 * least one line, including a run of blank lines). A single word wider than
 * `width` occupies its own line rather than looping forever.
 */
export function estimateLineCount(text: string, spec: LineWrapSpec): number {
  if (text === '') return 1;
  const face = resolveFace(spec.family, spec.weight, spec.style);
  const font = loadFont(face.file);
  const scale = spec.size / font.unitsPerEm;
  const widthOf = (s: string) => {
    const run = font.layout(s);
    let advance = 0;
    for (const pos of run.positions) advance += pos.xAdvance;
    return advance * scale;
  };
  const spaceWidth = widthOf(' ');

  let totalLines = 0;
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      totalLines += 1; // blank line
      continue;
    }
    let lines = 1;
    let lineWidth = 0;
    for (const word of words) {
      const wordWidth = widthOf(word);
      const needed = lineWidth === 0 ? wordWidth : lineWidth + spaceWidth + wordWidth;
      if (needed <= spec.width || lineWidth === 0) {
        // Either it fits, or the line is currently empty (a lone word wider
        // than `width` still goes on its own line rather than looping).
        lineWidth = needed;
      } else {
        lines += 1;
        lineWidth = wordWidth;
      }
    }
    totalLines += lines;
  }
  return totalLines;
}

/**
 * Total block height, in points, for `text` wrapped to `spec.width` — the
 * companion to `estimateLineCount` that actually uses `lineHeight`
 * (defaults to 1, i.e. no leading beyond the font's own size, matching
 * react-pdf's default `lineHeight: 1` when a style doesn't set one).
 */
export function estimateTextHeight(text: string, spec: LineWrapSpec): number {
  const lines = estimateLineCount(text, spec);
  return lines * spec.size * (spec.lineHeight ?? 1);
}

export interface FitFontSizeOptions {
  maxWidth: number;
  /** Defaults to 1 — the common "must fit on one line" case FitText covers. */
  maxLines?: number;
  family: PdfKitAnyFamily;
  weight?: FontWeight;
  style?: FontStyle;
  lineHeight?: number;
  min: number;
  max: number;
  /** Size decrement per trial. Defaults to 0.5pt. */
  step?: number;
}

/**
 * Largest font size in [min, max] (stepping down by `step`) at which `text`
 * fits within `maxWidth` in at most `maxLines` lines. Falls back to `min`
 * (the documented floor — see `FitText`) if even the minimum size overflows,
 * so callers always get a definite size rather than an error.
 */
export function fitFontSize(text: string, opts: FitFontSizeOptions): number {
  const { maxWidth, maxLines = 1, family, weight, style, lineHeight, min, max, step = 0.5 } = opts;
  if (min > max) {
    throw new Error(`pdf-kit fitFontSize: min (${min}) must be <= max (${max})`);
  }
  for (let size = max; size >= min; size -= step) {
    const lines = estimateLineCount(text, { width: maxWidth, family, weight, style, size, lineHeight });
    if (lines <= maxLines) return size;
  }
  return min;
}
