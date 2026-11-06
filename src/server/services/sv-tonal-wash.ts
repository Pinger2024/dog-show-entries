/**
 * Bake the SV-schedule tonal wash PNG from a pair of brand colours.
 *
 * React-PDF's SVG primitives can't produce a smooth radial gradient
 * (RadialGradient drops multi-stop opacity falloff; stacked translucent
 * Ellipses band visibly). We render two solid-coloured ellipses anchored
 * at opposite corners and run them through sharp's gaussian blur, which
 * blurs the alpha channel as well as RGB — producing a smooth wash with
 * exactly the colours we feed it.
 *
 * Results are memoised in-process by (primary, secondary, variant) so
 * repeated renders of the same show during a single server lifetime
 * reuse the same buffer.
 */
import sharp from 'sharp';
import { BoundedCache } from '@/lib/bounded-cache';

export type WashVariant = 'cover' | 'inside';

// The Sieger Editorial defaults used when an org doesn't have brand
// colours extracted yet — soft pink + soft blue on bone paper.
export const DEFAULT_PRIMARY = '#D4889C';
export const DEFAULT_SECONDARY = '#7A9BC5';

const PAGE_W_MM = 148;
const PAGE_H_MM = 210;
const DPI = 300;
const PX_W = Math.round((PAGE_W_MM * DPI) / 25.4);
const PX_H = Math.round((PAGE_H_MM * DPI) / 25.4);

/**
 * Bounded, because the key is derived from a club's brand colours: an
 * unbounded Map here accumulates one full-page 1748×2480 PNG per distinct
 * colour pair ever rendered, for the lifetime of the server process. 32 is
 * comfortably more than any single render needs (one show uses 2 entries)
 * while capping the worst case at tens of MB rather than unbounded.
 */
const cache = new BoundedCache<string, Promise<Buffer>>(32);

function svg(primary: string, secondary: string, intensity: number): string {
  const rose = Math.min(0.85, 0.50 * intensity).toFixed(3);
  const blue = Math.min(0.85, 0.42 * intensity).toFixed(3);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PX_W}" height="${PX_H}" viewBox="0 0 ${PAGE_W_MM} ${PAGE_H_MM}">
  <ellipse cx="0"   cy="-10"  rx="120" ry="90"  fill="${primary}"   fill-opacity="${rose}"/>
  <ellipse cx="148" cy="220"  rx="115" ry="80"  fill="${secondary}" fill-opacity="${blue}"/>
</svg>`;
}

async function bake(primary: string, secondary: string, variant: WashVariant): Promise<Buffer> {
  const intensity = variant === 'cover' ? 1 : 0.25;
  return sharp(Buffer.from(svg(primary, secondary, intensity)))
    .blur(120)
    .png({ quality: 90 })
    .toBuffer();
}

/**
 * Resolve a wash buffer for a given pair of brand colours. Memoised so
 * the multi-page SV schedule render only bakes each (primary, secondary,
 * variant) once.
 */
export function getTonalWash(
  primary: string | null | undefined,
  secondary: string | null | undefined,
  variant: WashVariant,
): Promise<Buffer> {
  const p = primary || DEFAULT_PRIMARY;
  const s = secondary || DEFAULT_SECONDARY;
  const key = `${p}|${s}|${variant}`;
  let cached = cache.get(key);
  if (!cached) {
    cached = bake(p, s, variant);
    // Evict a failed bake so a transient sharp error doesn't poison this key
    // for the rest of the process's life. Caching the promise (rather than the
    // resolved buffer) is deliberate — it de-dupes concurrent renders of the
    // same show — but it means a rejection would otherwise be replayed to
    // every future caller.
    cached.catch(() => cache.delete(key));
    cache.set(key, cached);
  }
  return cached;
}
