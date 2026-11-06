/**
 * PROVING THE TEST FAILS (brief requirement — noted here, not left in the
 * tree): set `estimateLineCount`'s `spaceWidth` to a hardcoded `0` (so
 * words pack together with no gap accounted for) — `fitFontSize`'s
 * real-render integration test failed (predicted a size that fit in 1 line;
 * the actual react-pdf render wrapped it to 2 lines). Restored before
 * committing.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, Page, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { registerPdfKitFonts } from '../fonts';
import { measureTextWidth, estimateLineCount, fitFontSize } from '../measure';
import { extractBBoxLayout, findLineWidth } from './poppler';

registerPdfKitFonts();

const styles = StyleSheet.create({
  page: { padding: 40 },
});

async function renderSingleLine(text: string, family: 'Times' | 'Inter' | 'LibreBaskerville', size: number) {
  const buf = await renderToBuffer(
    React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: 'A4', style: styles.page },
        React.createElement(Text, { style: { fontFamily: family, fontSize: size } }, text),
      ),
    ),
  );
  return extractBBoxLayout(buf);
}

describe('measureTextWidth — against a real render extracted via pdftotext -bbox-layout', () => {
  const cases: Array<{ text: string; family: 'Times' | 'Inter' | 'LibreBaskerville'; size: number }> = [
    { text: 'Hello World', family: 'Times', size: 24 },
    { text: 'The quick brown fox', family: 'Times', size: 14 },
    { text: 'Remi Show Manager', family: 'Inter', size: 18 },
    { text: 'German Shepherd Dog', family: 'LibreBaskerville', size: 20 },
    { text: 'Championship Show 2026', family: 'Inter', size: 10 },
  ];

  for (const { text, family, size } of cases) {
    it(`"${text}" at ${size}pt ${family} is within 2% of the rendered bbox width`, async () => {
      const pages = await renderSingleLine(text, family, size);
      const actualWidth = findLineWidth(pages, text);
      expect(actualWidth).not.toBeNull();

      const predicted = measureTextWidth(text, { family, size });
      const pctDiff = (Math.abs(predicted - actualWidth!) / actualWidth!) * 100;
      expect(pctDiff).toBeLessThan(2);
    });
  }

  it('measures the widest of several lines when text contains \\n', () => {
    const short = measureTextWidth('Hi', { family: 'Times', size: 12 });
    const long = measureTextWidth('Hello there friend', { family: 'Times', size: 12 });
    const combined = measureTextWidth('Hi\nHello there friend', { family: 'Times', size: 12 });
    expect(combined).toBeCloseTo(long, 5);
    expect(combined).toBeGreaterThan(short);
  });

  it('returns 0 for an empty string', () => {
    expect(measureTextWidth('', { family: 'Times', size: 12 })).toBe(0);
  });
});

describe('estimateLineCount — against a real wrapped render', () => {
  it('matches the actual number of lines react-pdf wraps a paragraph into', async () => {
    const text =
      'This is a longer paragraph of body text that should wrap onto several lines within its two hundred point width column so we can see how pdftotext bbox groups words into lines.';
    const width = 200;
    const size = 10;
    const family = 'Times' as const;

    const buf = await renderToBuffer(
      React.createElement(
        Document,
        null,
        React.createElement(
          Page,
          { size: 'A4', style: styles.page },
          React.createElement(Text, { style: { fontFamily: family, fontSize: size, width } }, text),
        ),
      ),
    );
    const pages = extractBBoxLayout(buf);
    const actualLines = pages[0].lines.length;

    const predicted = estimateLineCount(text, { width, family, size });
    expect(predicted).toBe(actualLines);
  });

  it('a single short word within the width is exactly 1 line', () => {
    expect(estimateLineCount('Hi', { width: 500, family: 'Times', size: 12 })).toBe(1);
  });

  it('an empty string is 1 line', () => {
    expect(estimateLineCount('', { width: 500, family: 'Times', size: 12 })).toBe(1);
  });

  it('each blank line (consecutive \\n) counts as its own line', () => {
    expect(estimateLineCount('a\n\n\nb', { width: 500, family: 'Times', size: 12 })).toBe(4);
  });

  it('a single word wider than the available width still gets exactly one line (never loops)', () => {
    const lines = estimateLineCount('Supercalifragilisticexpialidocious', {
      width: 5,
      family: 'Times',
      size: 12,
    });
    expect(lines).toBe(1);
  });
});

describe('fitFontSize', () => {
  it('returns `max` when the text already fits at the largest size', () => {
    const size = fitFontSize('Hi', { family: 'Times', maxWidth: 500, min: 6, max: 24 });
    expect(size).toBe(24);
  });

  it('shrinks long text to fit within maxWidth, verified against a real render', async () => {
    const text = 'A Very Long Championship Show Title That Needs To Shrink';
    const maxWidth = 220;
    const size = fitFontSize(text, { family: 'Times', maxWidth, min: 6, max: 24, step: 0.5 });
    expect(size).toBeLessThan(24);
    expect(size).toBeGreaterThanOrEqual(6);

    const buf = await renderToBuffer(
      React.createElement(
        Document,
        null,
        React.createElement(
          Page,
          { size: 'A4', style: styles.page },
          React.createElement(
            Text,
            { style: { fontFamily: 'Times', fontSize: size, width: maxWidth } },
            text,
          ),
        ),
      ),
    );
    const pages = extractBBoxLayout(buf);
    expect(pages[0].lines.length).toBe(1);
    const actualWidth = pages[0].lines[0].xMax - pages[0].lines[0].xMin;
    // Allow a small margin: fitFontSize is deliberately conservative
    // (it only accepts a size once estimateLineCount says it fits), so the
    // real render should never exceed maxWidth by more than a point or two
    // of measurement/rounding slack.
    expect(actualWidth).toBeLessThanOrEqual(maxWidth + 2);
  });

  it('floors at `min` when even the minimum size does not fit', () => {
    const size = fitFontSize('An extremely long championship show title that will never fit', {
      family: 'Times',
      maxWidth: 30,
      min: 8,
      max: 24,
    });
    expect(size).toBe(8);
  });

  it('throws if min > max', () => {
    expect(() => fitFontSize('x', { family: 'Times', maxWidth: 100, min: 20, max: 10 })).toThrow();
  });
});
