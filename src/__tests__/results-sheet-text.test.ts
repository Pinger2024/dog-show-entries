/**
 * The Results Sheet PDF, rendered for real from in-memory data (no database)
 * and read back with pdftotext (poppler, installed in CI).
 *
 * Set RESULTS_SHEET_SAMPLE_PATH to also write the PDF to disk for a look.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import { ResultsSheetReport, type ResultsSheetData } from '@/components/reports/results-sheet-pdf';

const LONG = 'Westmac Lleuad Leo Mit Tollelite';

const data: ResultsSheetData = {
  showName: 'Sample Regional GSD Show',
  showDate: 'Sunday, 11 October 2026',
  judges: ['Peter Schorling'],
  jhJudges: ['Mandy McAteer'],
  blocks: [
    { showClassId: 'a', label: '1a', heading: 'Class 1a  ·  Minor Puppy Bitch  ·  Long Coat', measured: false, isJuniorHandling: false,
      rows: [
        { ringNumber: '2', name: 'Anton Vom Haus Garyn', absent: false },
        { ringNumber: '9', name: LONG, absent: false },
        { ringNumber: '10', name: 'Bailey Vom Springberg', absent: true },
        { ringNumber: '11', name: 'Cara Vom Haus', absent: false },
      ] },
    { showClassId: 'b', label: '2a', heading: 'Class 2a  ·  Junior Bitch  ·  Long Coat', measured: true, isJuniorHandling: false,
      rows: [
        { ringNumber: '20', name: 'Dora Vom Berg', absent: false },
        { ringNumber: '21', name: 'Elsa Vom Berg', absent: false },
        { ringNumber: '22', name: 'Frieda Vom Berg', absent: false },
        { ringNumber: '23', name: 'Greta Vom Berg', absent: false },
        { ringNumber: '24', name: 'Hanna Vom Berg', absent: false },
      ] },
    { showClassId: 'c', label: 'JHA', heading: 'Class JHA  ·  Junior Handling', measured: false, isJuniorHandling: true,
      rows: [
        { ringNumber: '60', name: 'Grace-Jane Wotton', absent: false },
        { ringNumber: '61', name: 'Smilte Petrauskaite', absent: false },
      ] },
  ],
  awards: [{ label: 'Best Male' }, { label: 'Best Female' }, { label: 'Most Promising Male' }, { label: 'Most Promising Female' }],
};

async function render(d: ResultsSheetData) {
  return Buffer.from(
    await renderToBuffer(React.createElement(ResultsSheetReport, { data: d }) as React.ReactElement<DocumentProps>),
  );
}

function text(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'results-sheet-'));
  const p = join(dir, 'sheet.pdf');
  writeFileSync(p, pdf);
  execFileSync('pdftotext', ['-layout', p, join(dir, 'sheet.txt')]);
  return readFileSync(join(dir, 'sheet.txt'), 'utf8');
}

describe('Results Sheet PDF text', () => {
  it('has both half headings, the signature line, the awards, and each name once per half', async () => {
    const pdf = await render(data);
    if (process.env.RESULTS_SHEET_SAMPLE_PATH) writeFileSync(process.env.RESULTS_SHEET_SAMPLE_PATH, pdf);
    const t = text(pdf);
    expect(t).toContain('Master sheet — please pass to the Secretary');
    expect(t).toContain('For the scoreboard');
    expect(t).toContain("Judge's signature");
    expect(t).toContain('Best Male');
    expect(t).toContain('Grace-Jane');
    expect(t).toContain('Wotton');
    // A name wraps inside its cell, so count a word that is never split.
    expect(t.match(/Anton/g)).toHaveLength(2);
    expect(t.match(/Springberg/g)).toHaveLength(2);
    expect(t).toContain('Judge: Peter Schorling');
    expect(t).toContain('Junior Handling judge: Mandy McAteer');
  });

  it('is A4 landscape and every word stays on the page', async () => {
    const pdf = await render(data);
    const doc = await PDFDocument.load(pdf);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(841.89, 1);
    expect(height).toBeCloseTo(595.28, 1);
    const dir = mkdtempSync(join(tmpdir(), 'results-sheet-bbox-'));
    const p = join(dir, 's.pdf');
    writeFileSync(p, pdf);
    execFileSync('pdftotext', ['-bbox', p, join(dir, 's.html')]);
    const html = readFileSync(join(dir, 's.html'), 'utf8');
    const out = [...html.matchAll(/xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)"/g)].filter(
      (m) => Number(m[2]) > width + 0.5 || Number(m[1]) < 0,
    );
    expect(out).toHaveLength(0);
  });

  it('runs onto more pages with the heading, column row and page count on every page, and never strands a class band', async () => {
    const many: ResultsSheetData = {
      ...data,
      blocks: Array.from({ length: 6 }, (_, i) => ({
        showClassId: `c${i}`, label: `${i + 1}a`, heading: `Class ${i + 1}a  ·  Junior Bitch  ·  Long Coat`,
        measured: true, isJuniorHandling: false,
        rows: Array.from({ length: 9 }, (_, j) => ({ ringNumber: String(i * 10 + j + 1), name: `Dog ${i}-${j}`, absent: false })),
      })),
    };
    const pdf = await render(many);
    const doc = await PDFDocument.load(pdf);
    const pages = doc.getPageCount();
    expect(pages).toBeGreaterThan(1);
    const t = text(pdf);
    expect(t.match(/For the scoreboard/g)).toHaveLength(pages);
    expect(t.match(/Judge's signature/g)).toHaveLength(pages);
    expect(t).toContain(`Page ${pages} of ${pages}`);
    // A band never ends a page: the last body line of each page is not a band.
    for (const pageText of t.split('\f').filter((p) => p.trim())) {
      const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);
      const body = lines.filter((l) => !/Judge's signature|Page \d+ of/.test(l));
      expect(/^Class \d+a/.test(body[body.length - 1] ?? '')).toBe(false);
    }
  });
});
