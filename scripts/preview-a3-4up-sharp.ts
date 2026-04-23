/**
 * A3 4-up prize card preview using Sharp (faster than react-pdf with Image
 * for large JPEGs). Output: PNG + PDF at /tmp/a3-4up-real.{png,pdf}.
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';

// Canonical stored artwork now lives in the repo at public/prize-cards/
// (committed 2026-04-23). Previous versions of this script pointed at
// a /tmp/ pipeline that got wiped on reboot — hence the copy into
// public/ so we have a durable reference.
const CARDS = [
  'public/prize-cards/1-first.jpg',
  'public/prize-cards/2-second.jpg',
  'public/prize-cards/3-third.jpg',
  'public/prize-cards/4-reserve.jpg',
];

// A3 at 150 DPI = 2480 × 1754 px (landscape) — proof-quality, fast.
const A3_W = 2480;
const A3_H = 1754;
const CARD_W = A3_W / 2;
const CARD_H = A3_H / 2;

async function main() {
  // Resize each source card to exactly 1240×877 (half of A3 landscape)
  const resized = await Promise.all(
    CARDS.map((f) =>
      sharp(f)
        .resize(CARD_W, CARD_H, { fit: 'cover' })
        .png()
        .toBuffer()
    )
  );

  const sheet = await sharp({
    create: { width: A3_W, height: A3_H, channels: 3, background: '#fff' },
  })
    .composite([
      { input: resized[0], left: 0, top: 0 },
      { input: resized[1], left: CARD_W, top: 0 },
      { input: resized[2], left: 0, top: CARD_H },
      { input: resized[3], left: CARD_W, top: CARD_H },
    ])
    .png()
    .toBuffer();

  await fs.writeFile('/tmp/a3-4up-real.png', sheet);
  console.log(`Wrote /tmp/a3-4up-real.png (${(sheet.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
