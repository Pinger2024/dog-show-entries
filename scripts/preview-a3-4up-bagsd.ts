/**
 * A3 4-up prize card preview with BAGSD club overlay. Amanda 2026-04-23:
 * "knock me up a sample using Bagsd as that's gonna be our first live show,
 * I'd want the club logo on it too when there is one".
 *
 * Composes club logo + club name + show name + date onto each of the 4 base
 * placement templates, then tiles them into one A3 landscape sheet at 300 DPI.
 *
 * Output: /tmp/a3-4up-bagsd.{png,jpg}
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';

const TEMPLATES = [
  'public/prize-cards/1-first.jpg',
  'public/prize-cards/2-second.jpg',
  'public/prize-cards/3-third.jpg',
  'public/prize-cards/4-reserve.jpg',
];

const CLUB = {
  name: 'British Association for German Shepherd Dogs',
  short: 'BAGSD',
  logoPath: '/tmp/bagsd-logo.png',
};

const SHOW = {
  name: '19 Class Single Breed Championship Show',
  date: 'Saturday 4 July 2026',
  judge: 'Mr John Smith',
};

// Template source is 2480 × 1766 px. We overlay into the cream central area —
// roughly from y=600 (below the placement word + rule) down to y=1350
// (above the rosette at bottom).
const TEMPLATE_W = 2480;
const TEMPLATE_H = 1766;
const LOGO_HEIGHT = 280; // target height for the club logo (bigger per Amanda 2026-04-23)

// A3 landscape @ 300 DPI = 4960 × 3508 px
const A3_W = 4960;
const A3_H = 3508;
const CARD_SLOT_W = A3_W / 2;  // 2480
const CARD_SLOT_H = A3_H / 2;  // 1754

function overlaySvg(placementColour: string): string {
  // Centered text + space for a logo. The logo is composited separately by
  // Sharp since text-via-SVG and image-via-SVG-href is inconsistent across
  // platforms. We allocate vertical space for it in the layout.
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${TEMPLATE_W}" height="${TEMPLATE_H}">
      <style>
        .clubName {
          font-family: 'Playfair Display', 'Times New Roman', serif;
          font-weight: 700;
          font-size: 82px;
          fill: #1a1a1a;
          text-anchor: middle;
          letter-spacing: 1px;
        }
        .showName {
          font-family: 'Times New Roman', serif;
          font-style: italic;
          font-size: 60px;
          fill: #333;
          text-anchor: middle;
        }
        .showDate {
          font-family: 'Times New Roman', serif;
          font-size: 50px;
          fill: #555;
          text-anchor: middle;
          letter-spacing: 2px;
        }
        .judgeName {
          font-family: 'Times New Roman', serif;
          font-style: italic;
          font-size: 58px;
          fill: #444;
          text-anchor: middle;
        }
        .divider {
          stroke: ${placementColour};
          stroke-width: 2;
          opacity: 0.5;
        }
      </style>

      <!-- Club name — main identity, bold serif, centred (moved up per Amanda 2026-04-23) -->
      <text x="${TEMPLATE_W / 2}" y="760" class="clubName">${CLUB.name}</text>

      <!-- Decorative rule under club name -->
      <line x1="${TEMPLATE_W / 2 - 500}" y1="810" x2="${TEMPLATE_W / 2 + 500}" y2="810" class="divider" />

      <!-- Show name in italic -->
      <text x="${TEMPLATE_W / 2}" y="895" class="showName">${SHOW.name}</text>

      <!-- Show date -->
      <text x="${TEMPLATE_W / 2}" y="975" class="showDate">${SHOW.date}</text>

      <!-- Judge name (added per Amanda 2026-04-23) -->
      <text x="${TEMPLATE_W / 2}" y="1055" class="judgeName">Judge: ${SHOW.judge}</text>
    </svg>
  `;
}

const PLACEMENT_COLOURS = ['#8A0F25', '#12315A', '#6B5A1A', '#104A22']; // 1st 2nd 3rd Reserve

async function composeCard(templatePath: string, placementIdx: number): Promise<Buffer> {
  // Resize logo to target height, preserve aspect
  const logo = await sharp(CLUB.logoPath)
    .resize({ height: LOGO_HEIGHT, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();

  const svgText = Buffer.from(overlaySvg(PLACEMENT_COLOURS[placementIdx]));

  // Centre the logo horizontally, place it near the top just under the placement word
  const logoTop = 420;
  const logoLeft = Math.round((TEMPLATE_W - (logoMeta.width ?? LOGO_HEIGHT)) / 2);

  return sharp(templatePath)
    .composite([
      { input: logo, top: logoTop, left: logoLeft },
      { input: svgText, top: 0, left: 0 },
    ])
    .toBuffer();
}

async function main() {
  console.log('Composing overlay on each card...');
  const cards = await Promise.all(
    TEMPLATES.map((t, i) => composeCard(t, i))
  );

  console.log(`Resizing each card to ${CARD_SLOT_W} × ${CARD_SLOT_H}...`);
  const resized = await Promise.all(
    cards.map((buf) =>
      sharp(buf)
        .resize(CARD_SLOT_W, CARD_SLOT_H, { fit: 'cover', position: 'top' })
        .png()
        .toBuffer()
    )
  );

  console.log(`Tiling onto A3 ${A3_W} × ${A3_H}...`);
  const sheet = await sharp({
    create: { width: A3_W, height: A3_H, channels: 3, background: '#fff' },
  })
    .composite([
      { input: resized[0], left: 0, top: 0 },
      { input: resized[1], left: CARD_SLOT_W, top: 0 },
      { input: resized[2], left: 0, top: CARD_SLOT_H },
      { input: resized[3], left: CARD_SLOT_W, top: CARD_SLOT_H },
    ])
    .png()
    .toBuffer();

  await fs.writeFile('/tmp/a3-4up-bagsd.png', sheet);
  console.log(`Wrote /tmp/a3-4up-bagsd.png (${(sheet.length / 1024 / 1024).toFixed(1)} MB)`);

  // Also JPEG for Telegram delivery
  const jpg = await sharp(sheet).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  await fs.writeFile('/tmp/a3-4up-bagsd.jpg', jpg);
  console.log(`Wrote /tmp/a3-4up-bagsd.jpg (${(jpg.length / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
