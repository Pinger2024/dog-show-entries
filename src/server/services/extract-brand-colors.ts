/**
 * Pull a primary + secondary brand colour out of a club's logo using
 * node-vibrant (MMCQ-based palette extraction, the same algorithm
 * Android's Palette API uses). Saturation-gated so logos with only
 * blacks / whites / greys land on `monochrome=true` and the SV
 * schedule's tonal wash falls back to the default Sieger dusty
 * pink/blue (Michael 2026-05-23).
 *
 *   • primary   — the Vibrant swatch (most saturated, prominent)
 *   • secondary — DarkVibrant if its hue is notably different from
 *                 primary, else LightVibrant. We want contrast, not
 *                 two near-identical tints.
 *   • monochrome — true when neither Vibrant nor DarkVibrant clear the
 *                  minimum saturation threshold.
 */
import { Vibrant } from 'node-vibrant/node';

export interface BrandColors {
  primary: string | null;
  secondary: string | null;
  monochrome: boolean;
}

const MIN_SATURATION = 0.20;
const MIN_HUE_DIFFERENCE = 30; // degrees

function hueDistance(a: number, b: number): number {
  // Hue is a circle — distance is min of forward / backward.
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

export async function extractBrandColors(
  source: string | Buffer,
): Promise<BrandColors> {
  const palette = await Vibrant.from(source).getPalette();

  const vibrant = palette.Vibrant;
  const darkVibrant = palette.DarkVibrant;
  const lightVibrant = palette.LightVibrant;

  // No vibrant swatch at all? Logo is essentially monochrome.
  if (!vibrant || vibrant.hsl[1] < MIN_SATURATION) {
    // Even the most-saturated swatch is bland → treat as monochrome.
    return { primary: null, secondary: null, monochrome: true };
  }

  const primary = vibrant.hex;
  const primaryHue = vibrant.hsl[0] * 360;

  // Pick a secondary that contrasts hue-wise with the primary.
  const candidates = [darkVibrant, lightVibrant]
    .filter((s): s is NonNullable<typeof s> => s != null)
    .filter((s) => s.hsl[1] >= MIN_SATURATION)
    .map((s) => ({ hex: s.hex, hueDiff: hueDistance(primaryHue, s.hsl[0] * 360) }))
    .sort((a, b) => b.hueDiff - a.hueDiff);

  const secondary =
    candidates[0] && candidates[0].hueDiff >= MIN_HUE_DIFFERENCE
      ? candidates[0].hex
      : candidates[0]?.hex ?? null;

  return {
    primary,
    secondary,
    monochrome: false,
  };
}
