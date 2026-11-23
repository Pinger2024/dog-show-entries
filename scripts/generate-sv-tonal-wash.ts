/**
 * Generate the SV-schedule tonal wash PNGs once and bake them into
 * `public/sv-schedule/`. React-PDF's SVG <RadialGradient> doesn't honour
 * multi-stop opacity falloff the way the design needs, so we render the
 * wash externally with sharp (which converts SVG → PNG with full
 * gradient support) and use the resulting image as a fixed page
 * background. A cover-intensity variant and a quieter inside-page
 * variant.
 *
 *   npx tsx scripts/generate-sv-tonal-wash.ts
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import path from 'path';

const PAGE_W_MM = 148;
const PAGE_H_MM = 210;
const DPI = 300; // print-quality
const PX_PER_MM = DPI / 25.4;
const PX_W = Math.round(PAGE_W_MM * PX_PER_MM);
const PX_H = Math.round(PAGE_H_MM * PX_PER_MM);

/** SVG of solid-coloured ellipses with per-shape opacity. Heavy gaussian
 *  blur (applied by sharp downstream) turns the hard edges into a smooth
 *  radial-gradient-style wash without the banding artefacts that
 *  multi-stop SVG gradients produce on this size of canvas. */
function svg(intensity: number): string {
  const rose = Math.min(0.85, 0.50 * intensity).toFixed(3);
  const blue = Math.min(0.85, 0.42 * intensity).toFixed(3);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PX_W}" height="${PX_H}" viewBox="0 0 ${PAGE_W_MM} ${PAGE_H_MM}">
  <ellipse cx="0"   cy="-10"  rx="120" ry="90"  fill="#D4889C" fill-opacity="${rose}"/>
  <ellipse cx="148" cy="220"  rx="115" ry="80"  fill="#7A9BC5" fill-opacity="${blue}"/>
</svg>`;
}

async function bake(filename: string, intensity: number) {
  const out = path.join(process.cwd(), 'public', 'sv-schedule', filename);
  // Heavy blur (sigma ~120px at 300dpi) turns the two solid ellipses
  // into a smooth radial-gradient-style wash. Sharp blurs all channels
  // including alpha, so the ellipse edges fade naturally.
  await sharp(Buffer.from(svg(intensity)))
    .blur(120)
    .png({ quality: 95 })
    .toFile(out);
  console.log(`✅ ${filename} — ${PX_W}×${PX_H}px at ${DPI}dpi (intensity ${intensity})`);
}

async function main() {
  await bake('wash-cover.png', 1);
  await bake('wash-inside.png', 0.25);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
