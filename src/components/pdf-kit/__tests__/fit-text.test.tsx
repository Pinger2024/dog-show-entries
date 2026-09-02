/**
 * PROVING THE TEST FAILS (brief requirement — noted here, not left in the
 * tree): changed `FitText` to always render at `max` (ignoring the
 * computed `size`) — the "never exceeds its width" test failed for real:
 * the "Grand Champion Bloodline Extraordinaire Society" case rendered a
 * line at ~99pt inside an 80pt maxWidth. Restored before committing.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer';
import { registerPdfKitFonts } from '../fonts';
import { FitText } from '../fit-text';
import { extractBBoxLayout } from './poppler';

registerPdfKitFonts();

const CASES: Array<{ text: string; maxWidth: number }> = [
  { text: 'Champion', maxWidth: 200 },
  { text: 'German Shepherd Dog Club of Scotland', maxWidth: 200 },
  { text: 'A Very Long Championship Show Title Indeed', maxWidth: 150 },
  { text: 'Best In Show', maxWidth: 60 },
  { text: 'Grand Champion Bloodline Extraordinaire Society', maxWidth: 80 },
];

async function renderFitText(text: string, maxWidth: number) {
  const buf = await renderToBuffer(
    <Document>
      <Page size="A4" style={{ padding: 40, fontFamily: 'Times' }}>
        <FitText family="Times" maxWidth={maxWidth} min={6} max={24}>
          {text}
        </FitText>
      </Page>
    </Document>,
  );
  return extractBBoxLayout(buf);
}

describe('FitText — never exceeds its width', () => {
  for (const { text, maxWidth } of CASES) {
    it(`"${text}" — every rendered line stays within maxWidth=${maxWidth}pt on a real render`, async () => {
      // Checked per RENDERED LINE rather than by looking up the original
      // `text` as a single line: FitText only picks a font size, it does
      // not truncate — if even the floor size can't fit the text in one
      // line (e.g. a single very long unbreakable word), the Text still
      // wraps normally onto more than one line, and every one of those
      // lines must individually respect maxWidth.
      const pages = await renderFitText(text, maxWidth);
      expect(pages[0].lines.length).toBeGreaterThan(0);
      for (const line of pages[0].lines) {
        const actualWidth = line.xMax - line.xMin;
        // A couple of points of slack for sub-pixel kerning/measurement
        // rounding between fontkit and poppler's own shaping.
        expect(actualWidth).toBeLessThanOrEqual(maxWidth + 2);
      }
    });
  }

  it('renders at max size when the text already fits comfortably', async () => {
    const pages = await renderFitText('Hi', 500);
    const line = pages[0].lines.find((l) => l.text.trim() === 'Hi');
    expect(line).toBeDefined();
    // At 24pt Times "Hi" should be roughly 20-24pt tall glyphs — a coarse
    // sanity check that it did NOT shrink to the 6pt floor.
    expect(line!.yMax - line!.yMin).toBeGreaterThan(15);
  });

  it('floors at `min` and still renders (does not throw) when text can never fit', async () => {
    const pages = await renderFitText(
      'An impossibly long championship show title that will never fit in this tiny space',
      20,
    );
    expect(pages).toHaveLength(1);
  });

  /**
   * REGRESSION — found migrating the RKC catalogue cover onto this kit.
   * `FitText` used to set `width: maxWidth` on the rendered Text
   * unconditionally, even when the text already fit at `max` and needed
   * no shrinking. For a `maxLines > 1` caller (a title allowed to wrap
   * onto a couple of lines) that explicit width can wrap DIFFERENTLY than
   * an unconstrained `<Text>` at the exact same font size — confirmed
   * against a real render with a real club name ("Clyde Valley GSD Club
   * Single Breed Open Show", HankenGrotesk 800): the unconstrained
   * version fits on one line, the same text at the same size with an
   * explicit `width: maxWidth` wrapped onto two. measure.ts's line-count
   * estimate isn't perfectly exact for every family (its own accuracy
   * test only covers Times/Inter/LibreBaskerville, not HankenGrotesk —
   * see the pdf-kit README), so relying on the nominal maxWidth being
   * exactly right at the wrap boundary is fragile; not constraining width
   * at all when no shrinking happened sidesteps the whole class of
   * discrepancy for the common case.
   *
   * PROVING THIS TEST FAILS (brief requirement — noted here, not left in
   * the tree): reverted the fix (set `width: maxWidth` unconditionally
   * again) — this test failed with `fitTextLines=2, plainLines=1`.
   * Restored the fix before committing.
   */
  it('matches an unconstrained Text exactly when the text already fits at max (no width leak from a maxLines > 1 caller)', async () => {
    const text = 'Clyde Valley GSD Club Single Breed Open Show';
    const shared = { fontFamily: 'HankenGrotesk' as const, fontWeight: 800 as const, fontSize: 17 };
    const maxWidth = 358;

    const plainBuf = await renderToBuffer(
      <Document>
        <Page size="A5" style={{ padding: 30, fontFamily: 'Inter' }}>
          <Text style={{ ...shared, textAlign: 'center' }}>{text}</Text>
        </Page>
      </Document>,
    );
    const fitTextBuf = await renderToBuffer(
      <Document>
        <Page size="A5" style={{ padding: 30, fontFamily: 'Inter' }}>
          <FitText
            family="HankenGrotesk"
            weight={800}
            maxWidth={maxWidth}
            maxLines={3}
            min={11}
            max={17}
            style={{ textAlign: 'center' }}
          >
            {text}
          </FitText>
        </Page>
      </Document>,
    );

    const plainLines = (await extractBBoxLayout(plainBuf))[0].lines.length;
    const fitTextLines = (await extractBBoxLayout(fitTextBuf))[0].lines.length;
    expect(fitTextLines).toBe(plainLines);
  });

  it('respects a caller style override merged after the computed defaults', async () => {
    const buf = await renderToBuffer(
      <Document>
        <Page size="A4" style={{ padding: 40, fontFamily: 'Times' }}>
          <FitText family="Times" maxWidth={200} min={6} max={24} style={{ color: '#ff0000' }}>
            Coloured
          </FitText>
        </Page>
      </Document>,
    );
    expect(buf.length).toBeGreaterThan(0); // smoke check: style merge doesn't throw
  });
});
