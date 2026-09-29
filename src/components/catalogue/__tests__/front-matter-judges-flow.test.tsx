/**
 * Mandy, North Eastern GSD Championship Show 2026 (29 Sept): half of the page
 * under Awards / Practical Information / Additional Notes was left blank, and
 * the List of Judges started on the next page even though it fitted in the
 * gap. Cause: the judges section's wrapper carried `minPresenceAhead={140}`,
 * which demands 140pt of the NEXT section (Class Definitions) fit after the
 * WHOLE judges list — so a list that fitted completely was still pushed over.
 *
 * The band is protected another way now — it's atomic with the table header
 * and the first judge — so the guard is gone. These tests pin both halves:
 * a list that fits stays on the page, and the band never strands alone.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { FrontMatterPage } from '../catalogue-front-matter';
import type { CatalogueShowInfo } from '../catalogue-types';

/** Page number (1-indexed) of every line of text, folded to [a-z0-9]. */
function linesByPage(buf: Buffer): { page: number; text: string; yMin: number }[] {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'judges-flow-test-'));
  try {
    const pdfPath = path.join(tmpDir, 'doc.pdf');
    writeFileSync(pdfPath, buf);
    const xml = execFileSync('pdftotext', ['-bbox-layout', pdfPath, '-']).toString('utf8');
    const out: { page: number; text: string; yMin: number }[] = [];
    xml.split('<page ').slice(1).forEach((pageXml, i) => {
      const lineRe = /<line xMin="[\d.-]+" yMin="([\d.-]+)"[^>]*>([\s\S]*?)<\/line>/g;
      let m: RegExpExecArray | null;
      while ((m = lineRe.exec(pageXml))) {
        const words = [...m[2]!.matchAll(/<word[^>]*>([^<]*)<\/word>/g)].map((w) => w[1]);
        out.push({ page: i + 1, text: words.join('').toLowerCase().replace(/[^a-z0-9]/g, ''), yMin: parseFloat(m[1]!) });
      }
    });
    return out;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

const pageOf = (lines: { page: number; text: string }[], needle: string) =>
  lines.find((l) => l.text.includes(needle))?.page;

const BIO =
  'Born in 1958 into a family passionate about German Shepherds, I became a vet in 1983 and have bred ' +
  'under my own affix for more than forty years, with over two hundred litters and many champions. ' +
  'I was a board member of my breed club for twenty years and its president for eight. I became a ' +
  'specialist judge for German Shepherds in 2005 and have judged national breed shows many times, ' +
  'as well as working trials and endurance tests. I warmly thank the committee for inviting me.';

const CLASS_NAMES = ['Veteran', 'Minor Puppy', 'Puppy', 'Junior', 'Yearling', 'Post Graduate', 'Limit', 'Open'];

function show(welcomeLines: number): CatalogueShowInfo {
  return {
    name: 'Test GSD Championship Show 2030',
    showType: 'championship',
    date: '2030-10-11',
    venue: 'Test Showground',
    venueAddress: 'Test Lane, Testtown',
    organisation: 'Test GSD Club',
    kcLicenceNo: null,
    welcomeNote: Array.from({ length: welcomeLines }, (_, i) => `Welcome line ${i + 1} — thank you for supporting our show.`).join('\n'),
    awardsDescription: 'Rosettes 1st to 3rd in all classes. Trophies for all the Bests.',
    latestArrivalTime: '09:00',
    catering: 'Refreshments available',
    additionalNotes: 'Your support through sponsorship and donations is greatly appreciated.',
    judgesByBreedName: { 'German Shepherd Dog': 'Judge Testperson' },
    judgeBios: { 'Judge Testperson': BIO },
    classDefinitions: CLASS_NAMES.map((name) => ({
      name,
      description: `For dogs eligible for ${name} under the Royal Kennel Club's regulations for this class at the Show.`,
    })),
  };
}

async function render(welcomeLines: number) {
  const buf = await renderToBuffer(
    <Document>
      <FrontMatterPage show={show(welcomeLines)} />
    </Document>,
  );
  return linesByPage(buf);
}

describe('front matter — List of Judges flows into the space it fits', () => {
  it('keeps a judges list that fits on the same page as Additional Notes', async () => {
    // 34 welcome lines: the judges list fits under Additional Notes, but the
    // list PLUS the old 140pt allowance for Class Definitions does not —
    // the North Eastern shape. Before the fix, lengths 29–40 all pushed the
    // list to the next page.
    const lines = await render(34);
    const notesPage = pageOf(lines, 'additionalnotes');
    expect(notesPage).toBeDefined();
    expect(pageOf(lines, 'listofjudges')).toBe(notesPage);
    expect(pageOf(lines, 'judgetestperson')).toBe(notesPage);
  });

  it('never leaves the List of Judges band alone at the foot of a page', async () => {
    // Walk the welcome note down the page one line at a time so the band
    // lands at every position relative to the page foot. The old 140pt
    // guard stranded the band at lengths 1 and 41–44.
    for (let welcome = 0; welcome <= 60; welcome += 1) {
      const lines = await render(welcome);
      const band = pageOf(lines, 'listofjudges');
      const firstJudge = pageOf(lines, 'judgetestperson');
      expect({ welcome, band }).toEqual({ welcome, band: firstJudge });
    }
  }, 120_000);
});
