/**
 * Mandy, demo, 30 Sept 2026 — photo of a grading card: "cutting off the show
 * name". Once the card carried the club's name with the show's ("Midland
 * Regional GSD Group Mock SV Catalogue Show"), the Show line on the judge's
 * half didn't wrap and ran off the edge of the card. The same render also
 * split words with a hyphen ("British Re-gional", "Cat-alogue"): the grading
 * cards never switched hyphenation off, so they only got it right when some
 * other document had been loaded first.
 *
 * Rendered for real and read back with `pdftotext -bbox` (poppler, installed
 * in CI): every word must sit inside the card, and no word may be broken.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { GradingCardsReport, type GradingCardEntry } from '@/components/reports/grading-cards-pdf';

// The longest names on Remi today — the League's winter show as Mandy
// approved it (Telegram 7638), and a judge from abroad.
const LONGEST_SHOW = 'GSD League of Great Britain British Regional Groups Winter Spectacular 2026';
const entry: GradingCardEntry = {
  ringNumber: '48',
  dogName: 'Wakematt’s Morty at Starkwill vom Haus Garyn',
  dob: '29/12/2023',
  microchipNumber: '985111001532779',
  regNumber: 'SZ2386790',
  sireName: 'Vater vom Bergkristall',
  damName: 'Mutter vom Bergkristall',
  breederName: 'Schäfer',
  ownerName: 'Paul Williams & Claire Starkey',
  sex: 'Female',
  coat: 'Long Coat',
  className: 'Junior — Long Coat',
  judgeName: 'Herr Heinrich Wölfle-Zimmermann (Germany)',
};

type Word = { page: number; pageWidth: number; xMin: number; xMax: number; text: string };

function wordsOf(pdf: Buffer): Word[] {
  const dir = mkdtempSync(join(tmpdir(), 'grading-card-'));
  const pdfPath = join(dir, 'card.pdf');
  const htmlPath = join(dir, 'card.html');
  writeFileSync(pdfPath, pdf);
  execFileSync('pdftotext', ['-bbox', pdfPath, htmlPath]);
  const html = readFileSync(htmlPath, 'utf8');
  const words: Word[] = [];
  let page = 0;
  let pageWidth = 0;
  for (const m of html.matchAll(/<page width="([\d.]+)"|<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g)) {
    if (m[1]) {
      page += 1;
      pageWidth = Number(m[1]);
    } else {
      words.push({ page, pageWidth, xMin: Number(m[2]), xMax: Number(m[3]), text: m[4]! });
    }
  }
  return words;
}

describe('grading card — the longest names stay on the card, whole', () => {
  it('wraps the show name inside the card and never splits a word', async () => {
    const pdf = Buffer.from(
      await renderToBuffer(
        React.createElement(GradingCardsReport, {
          // A club may type a long show name too, so the judge's Show line
          // is stressed with the same words as the heading.
          info: { showName: LONGEST_SHOW, showLine: LONGEST_SHOW, showDate: '06/12/2026' },
          entries: [entry],
        }) as React.ReactElement<DocumentProps>,
      ),
    );
    const words = wordsOf(pdf);
    // Still one card: outside + inside, nothing spilling onto a third page.
    expect(Math.max(...words.map((w) => w.page))).toBe(2);

    const inside = words.filter((w) => w.page === 2);
    const offTheCard = inside.filter((w) => w.xMax > w.pageWidth + 0.5 || w.xMin < 0);
    expect(offTheCard.map((w) => w.text)).toEqual([]);

    // Both halves show the whole name, word for word (the heading on the
    // details half, the Show line on the judge's half).
    const texts = inside.map((w) => w.text);
    for (const word of ['Regional', 'Spectacular']) {
      expect(texts.filter((t) => t === word)).toHaveLength(2);
    }
    // A line may end on a hyphen only where the name really has one
    // ("Wölfle-Zimmermann"); never one the renderer invented.
    const source = [LONGEST_SHOW, ...Object.values(entry)].join(' ');
    const invented = inside
      .map((w, i) => ({ w, next: inside[i + 1] }))
      .filter(({ w, next }) => w.text.endsWith('-') && !source.includes(w.text + (next?.text ?? '')))
      .map(({ w, next }) => `${w.text}${next?.text ?? ''}`);
    expect(invented).toEqual([]);
  });
});

describe('"never split a word" has ONE owner', () => {
  it('only src/lib/pdf-hyphenation.ts switches hyphenation, and the shared fonts load it', () => {
    const hits = execFileSync('git', ['grep', '-l', 'registerHyphenationCallback', '--', 'src'], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !f.includes('__tests__'));
    expect(hits).toEqual(['src/lib/pdf-hyphenation.ts']);
    expect(readFileSync(join(process.cwd(), 'src', 'lib', 'pdf-fonts.ts'), 'utf8')).toMatch(
      /import '@\/lib\/pdf-hyphenation';/,
    );
  });
});
