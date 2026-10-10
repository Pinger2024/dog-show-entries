/**
 * A4 proof print — single prize card (First place) centred on an A4 landscape
 * page at true A5 size, so Amanda can print at home and see the real scale
 * in-hand without needing A3 paper.
 *
 * Output: /tmp/a4-proof-first.pdf
 */
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs/promises';

const TEMPLATES = [
  { path: 'public/prize-cards/1-first.jpg', colour: '#8A0F25' },
  { path: 'public/prize-cards/2-second.jpg', colour: '#12315A' },
  { path: 'public/prize-cards/3-third.jpg', colour: '#6B5A1A' },
  { path: 'public/prize-cards/4-reserve.jpg', colour: '#104A22' },
];

const CLUB = {
  name: 'British Association for German Shepherd Dogs',
  logoPath: '/tmp/bagsd-logo.png',
};
const SHOW = {
  name: '19 Class Single Breed Championship Show',
  date: 'Saturday 4 July 2026',
  judge: 'Mr John Smith',
};

const TEMPLATE_W = 2480;
const TEMPLATE_H = 1766;
const LOGO_HEIGHT = 280;

// A4 landscape @ 300 DPI = 3508 × 2480 px. We print the card at true A5 size
// (2480 × 1754 px) centred on the page, with bleed of 14px all round.
const A4_W = 3508;
const A4_H = 2480;
const A5_W = 2480;
const A5_H = 1754;

function overlaySvg(colour: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${TEMPLATE_W}" height="${TEMPLATE_H}">
      <style>
        .clubName { font-family: 'Playfair Display', 'Times New Roman', serif; font-weight: 700; font-size: 82px; fill: #1a1a1a; text-anchor: middle; letter-spacing: 1px; }
        .showName { font-family: 'Times New Roman', serif; font-style: italic; font-size: 60px; fill: #333; text-anchor: middle; }
        .showDate { font-family: 'Times New Roman', serif; font-size: 50px; fill: #555; text-anchor: middle; letter-spacing: 2px; }
        .judgeName { font-family: 'Times New Roman', serif; font-style: italic; font-size: 58px; fill: #444; text-anchor: middle; }
        .divider { stroke: ${colour}; stroke-width: 2; opacity: 0.5; }
      </style>
      <text x="${TEMPLATE_W / 2}" y="760" class="clubName">${CLUB.name}</text>
      <line x1="${TEMPLATE_W / 2 - 500}" y1="810" x2="${TEMPLATE_W / 2 + 500}" y2="810" class="divider" />
      <text x="${TEMPLATE_W / 2}" y="895" class="showName">${SHOW.name}</text>
      <text x="${TEMPLATE_W / 2}" y="975" class="showDate">${SHOW.date}</text>
      <text x="${TEMPLATE_W / 2}" y="1055" class="judgeName">Judge: ${SHOW.judge}</text>
    </svg>
  `;
}

async function composedCard(template: (typeof TEMPLATES)[number]): Promise<Buffer> {
  const logo = await sharp(CLUB.logoPath)
    .resize({ height: LOGO_HEIGHT, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();
  const svgText = Buffer.from(overlaySvg(template.colour));
  const logoTop = 420;
  const logoLeft = Math.round((TEMPLATE_W - (logoMeta.width ?? LOGO_HEIGHT)) / 2);
  return sharp(template.path)
    .composite([
      { input: logo, top: logoTop, left: logoLeft },
      { input: svgText, top: 0, left: 0 },
    ])
    .toBuffer();
}

async function main() {
  // Build a 4-page PDF, one card per A4 landscape page at true A5 size
  const pdf = await PDFDocument.create();
  for (const template of TEMPLATES) {
    const card = await composedCard(template);
    // Resize composed card to exactly A5 pixels
    const sized = await sharp(card).resize(A5_W, A5_H, { fit: 'cover', position: 'top' }).jpeg({ quality: 92 }).toBuffer();
    // Centre on A4 landscape canvas
    const a4 = await sharp({
      create: { width: A4_W, height: A4_H, channels: 3, background: '#fff' },
    })
      .composite([{ input: sized, left: Math.round((A4_W - A5_W) / 2), top: Math.round((A4_H - A5_H) / 2) }])
      .jpeg({ quality: 92 })
      .toBuffer();
    const image = await pdf.embedJpg(a4);
    // A4 landscape in points: 842 × 595
    const page = pdf.addPage([842, 595]);
    page.drawImage(image, { x: 0, y: 0, width: 842, height: 595 });
  }
  const bytes = await pdf.save();
  await fs.writeFile('/tmp/a4-proof-all.pdf', bytes);
  console.log(`Wrote /tmp/a4-proof-all.pdf (${(bytes.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
