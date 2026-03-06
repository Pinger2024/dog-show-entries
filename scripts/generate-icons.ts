/**
 * Generate PWA icons from SVG source using sharp.
 * Run: npx tsx scripts/generate-icons.ts
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';

const SVG_PATH = join(process.cwd(), 'public/icons/icon.svg');
const OUT_DIR = join(process.cwd(), 'public/icons');

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
];

async function generate() {
  const svgRaw = readFileSync(SVG_PATH, 'utf-8');

  for (const { name, size, maskable } of sizes) {
    let svg = svgRaw;

    // Maskable icons need no border radius — fill entire canvas
    if (maskable) {
      svg = svg.replace('rx="96"', 'rx="0"');
    }

    // Re-render SVG at target density for crisp output
    const svgBuf = Buffer.from(svg);
    await sharp(svgBuf, { density: Math.round((72 * size) / 512) * 2 })
      .resize(size, size)
      .png()
      .toFile(join(OUT_DIR, name));

    console.log(`  ${name} (${size}x${size})`);
  }

  // Also copy apple-touch-icon to root public/ for maximum compatibility
  const appleBuf = readFileSync(join(OUT_DIR, 'apple-touch-icon.png'));
  require('fs').writeFileSync(join(process.cwd(), 'public/apple-touch-icon.png'), appleBuf);
  console.log('  public/apple-touch-icon.png (copied)');

  console.log('Done!');
}

generate().catch(console.error);
