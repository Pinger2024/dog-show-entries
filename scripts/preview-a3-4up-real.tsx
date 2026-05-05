/**
 * A3 4-up prize card preview using Amanda's ACTUAL stored designs
 * (rosette + metallic swoosh artwork). Resent by Amanda 2026-04-23
 * via Telegram after she flagged that preview-a3-4up.tsx used a
 * generated layout instead of the real cards.
 *
 * Output: /tmp/a3-4up-real.pdf
 */
import React from 'react';
import fs from 'node:fs/promises';
import { Document, Page, Image, StyleSheet } from '@react-pdf/renderer';
import { renderToBuffer } from '@react-pdf/renderer';

const INBOX = '/Users/michaeljames/.claude/channels/telegram/inbox';

const CARDS = [
  `${INBOX}/1776983867964-AQADZQ1rG-VqWFN8.jpg`, // FIRST
  `${INBOX}/1776983868123-AQADZg1rG-VqWFN8.jpg`, // SECOND
  `${INBOX}/1776983868233-AQADZA1rG-VqWFN8.jpg`, // THIRD
  `${INBOX}/1776983868343-AQADZw1rG-VqWFN8.jpg`, // RESERVE
];

// A3 landscape pt: 1191 × 842. Each A5 quadrant: 595 × 421.
const CARD_W = 595;
const CARD_H = 421;

const s = StyleSheet.create({
  page: { padding: 0, backgroundColor: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: CARD_W * 2, height: CARD_H * 2 },
  card: { width: CARD_W, height: CARD_H, objectFit: 'cover' },
});

function A3Sheet() {
  return (
    <Document title="A3 4-up prize cards (real artwork)" author="Remi Show Manager">
      <Page size="A3" orientation="landscape" style={s.page}>
        <Image src={CARDS[0]} style={{ ...s.card, position: 'absolute', left: 0, top: 0 }} />
        <Image src={CARDS[1]} style={{ ...s.card, position: 'absolute', left: CARD_W, top: 0 }} />
        <Image src={CARDS[2]} style={{ ...s.card, position: 'absolute', left: 0, top: CARD_H }} />
        <Image src={CARDS[3]} style={{ ...s.card, position: 'absolute', left: CARD_W, top: CARD_H }} />
      </Page>
    </Document>
  );
}

async function main() {
  const buf = await renderToBuffer(<A3Sheet />);
  const out = '/tmp/a3-4up-real.pdf';
  await fs.writeFile(out, buf);
  console.log(`Wrote ${out} (${(buf.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
