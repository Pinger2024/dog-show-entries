/**
 * TWO REAL ISSUES THIS TEST FILE CAUGHT DURING DEVELOPMENT (not
 * deliberately-injected bugs — genuine findings, kept here rather than
 * silently fixed):
 *
 * 1. A REACT-PDF LIMITATION (see flow.tsx's file header for the full
 *    writeup): the first Flow implementation wrapped each block (and the
 *    whole list) in its own `<View>`. `minPresenceAhead` on the heading
 *    inside that wrapper had ZERO effect — swept values of 1, 5, 14, 28,
 *    100, and 300 points and got an IDENTICAL orphan crossover height every
 *    time, which only makes sense if the prop was being ignored entirely.
 *    Removing every wrapping `View` (Flow now renders a flat
 *    `React.Fragment` per block, no container of its own) restored normal,
 *    magnitude-sensitive `minPresenceAhead` behaviour. This is why Flow has
 *    no `style` prop and must be rendered directly into a page's flow.
 *
 * 2. `DEFAULT_FLOW_KEEP_WITH_HEADING` was originally 14 (a bare single-line
 *    estimate). The "multi-block document" test below caught it as
 *    genuinely insufficient: across 60 real blocks, "Block 18" orphaned
 *    alone on a page anyway. Raised the default to 28 (matching
 *    `SectionTitle`'s own, independently-arrived-at default) and the same
 *    test passed with no orphan anywhere across all 60 blocks.
 *
 * PROVING THE PRECISE CROSSOVER TEST FAILS (brief requirement): with the
 * wrapping `View`s reintroduced (or `keepWithHeadingHeight` hardcoded to
 * 0), the crossover test below fails — the heading renders alone as page
 * 1's last line instead of moving to page 2 with its body.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { registerPdfKitFonts } from '../fonts';
import { Flow } from '../flow';
import { extractBBoxLayout } from './poppler';

registerPdfKitFonts();

async function renderWithSpacer(spacerHeight: number, keepWithHeadingHeight?: number) {
  const buf = await renderToBuffer(
    <Document>
      <Page size="A4" style={{ padding: 40, fontFamily: 'Times', fontSize: 10 }}>
        <View style={{ height: spacerHeight }} />
        <Flow
          blocks={[
            {
              key: 'a',
              heading: <Text>Orphan Heading</Text>,
              body: <Text>This is the body text that follows the heading immediately.</Text>,
              keepWithHeadingHeight,
            },
          ]}
        />
      </Page>
    </Document>,
  );
  return extractBBoxLayout(buf);
}

describe('Flow — orphan protection (precise crossover)', () => {
  it('at the exact spacer height where a bare heading would just fit alone, the default keepWithHeadingHeight moves heading+body together to page 2', async () => {
    // Found by a 1pt-step linear search on an A4 page (usable height
    // 761.89pt): at spacerHeight=739 the default keepWithHeadingHeight=14
    // already engages (page 1 has zero text lines below the spacer);
    // spacerHeight=735 still fits both on page 1 together.
    const protectedPages = await renderWithSpacer(739);
    expect(protectedPages.length).toBe(2);
    expect(protectedPages[0].lines).toHaveLength(0);
    expect(protectedPages[1].lines.map((l) => l.text)).toContain('Orphan Heading');

    const fittingPages = await renderWithSpacer(735);
    expect(fittingPages.length).toBe(1);
    expect(fittingPages[0].lines.map((l) => l.text)).toContain('Orphan Heading');
  });

  it('a very small keepWithHeadingHeight narrows the protected zone — heading CAN still orphan closer to the edge', async () => {
    // With keepWithHeadingHeight=1 (barely any look-ahead required), the
    // heading-alone orphan reappears in a small window before the "both
    // move" crossover — demonstrating the value's magnitude genuinely
    // matters (this is what the broken all-wrapped build could NOT do:
    // every value from 1 to 300 gave the identical, broken result).
    const pages = await renderWithSpacer(742, 1);
    expect(pages.length).toBe(2);
    expect(pages[0].lines.map((l) => l.text)).toContain('Orphan Heading');
  });
});

describe('Flow — multi-block document', () => {
  it('renders every block heading and body, in order, across pages', async () => {
    const blocks = Array.from({ length: 60 }, (_, i) => ({
      key: `b${i}`,
      heading: <Text>{`Block ${i + 1}`}</Text>,
      body: (
        <Text>
          {`Body content for block ${i + 1}, with enough text to take up some room on the page and force real pagination across this multi-block document.`}
        </Text>
      ),
    }));

    const buf = await renderToBuffer(
      <Document>
        <Page size="A4" style={{ padding: 40, fontFamily: 'Times', fontSize: 10 }}>
          <Flow blocks={blocks} />
        </Page>
      </Document>,
    );
    const pages = extractBBoxLayout(buf);
    expect(pages.length).toBeGreaterThan(1);

    const allText = pages.flatMap((p) => p.lines.map((l) => l.text)).join(' | ');
    for (let i = 1; i <= 60; i++) {
      expect(allText).toContain(`Block ${i}`);
    }

    // No page ends with a bare block heading as its last line.
    const headings = blocks.map((_, i) => `Block ${i + 1}`);
    for (const [pageIndex, page] of pages.entries()) {
      if (page.lines.length === 0) continue;
      const lastLine = page.lines[page.lines.length - 1];
      expect(
        headings.includes(lastLine.text.trim()),
        `page ${pageIndex + 1} ended with a bare heading ("${lastLine.text}")`,
      ).toBe(false);
    }
  });
});
