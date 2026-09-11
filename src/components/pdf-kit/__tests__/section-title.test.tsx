/**
 * PROVING THE TEST FAILS (brief requirement — noted here, not left in the
 * tree): temporarily hardcoded `SectionTitle` to ignore its
 * `minPresenceAhead` prop and always pass `0` — the crossover test below
 * failed for real: at the same spacer height where the working component
 * pushes the heading to the next page (page 1 ends with zero text lines),
 * the broken component rendered "Orphan Heading" as page 1's LAST line.
 * Restored before committing. See that test's comment for the exact
 * before/after numbers.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { registerPdfKitFonts } from '../fonts';
import { SectionTitle, type SectionTitleVariant } from '../section-title';
import { extractBBoxLayout } from './poppler';

registerPdfKitFonts();

async function renderWithSpacer(spacerHeight: number) {
  const buf = await renderToBuffer(
    <Document>
      <Page size="A4" style={{ padding: 40, fontFamily: 'Times', fontSize: 10 }}>
        <View style={{ height: spacerHeight }} />
        <SectionTitle title="Orphan Heading" />
        <Text>This is the body text that follows the heading immediately.</Text>
      </Page>
    </Document>,
  );
  return extractBBoxLayout(buf);
}

describe('SectionTitle — orphan protection (precise crossover)', () => {
  it('at the exact spacer height where a bare heading would just fit alone, the heading moves to the next page WITH its body instead of being stranded', async () => {
    // Found by a linear search over spacer heights on an A4 page (usable
    // height 841.89 - 2*40 = 761.89pt): at spacerHeight=735 the heading
    // alone fits in the remaining ~27pt if minPresenceAhead didn't apply
    // (confirmed against a deliberately broken build — see file header),
    // but the default minPresenceAhead=28 requires the heading AND its
    // first ~28pt of following content to fit together, which they don't
    // at this height — so both move to page 2 as one unit.
    const spacerHeight = 735;
    const pages = await renderWithSpacer(spacerHeight);

    expect(pages.length).toBe(2);
    // The whole heading+body pair moved to page 2 — page 1 has NO text
    // lines below the spacer (the orphan-protection actually engaged,
    // rather than there merely being "some" room left over).
    expect(pages[0].lines).toHaveLength(0);
    expect(pages[1].lines.map((l) => l.text)).toContain('Orphan Heading');
  });

  it('a shorter spacer leaves enough room for heading+body together on one page', async () => {
    const pages = await renderWithSpacer(700);
    expect(pages.length).toBe(1);
    expect(pages[0].lines.map((l) => l.text)).toContain('Orphan Heading');
  });
});

describe('SectionTitle — realistic multi-section document (secondary smoke check)', () => {
  const FILLER =
    'This paragraph exists purely to consume vertical space so that section ' +
    'headings land at varying points relative to the page boundary, the way ' +
    'real secretary-entered content does across a real catalogue or schedule.';

  function ManySectionsDoc({ variant, count }: { variant: SectionTitleVariant; count: number }) {
    const titles = Array.from({ length: count }, (_, i) => `Section ${i + 1}`);
    return (
      <Document>
        <Page size="A4" style={{ padding: 40, fontFamily: 'Times', fontSize: 10 }}>
          {titles.map((title, i) => (
            <View key={title} style={{ marginBottom: 10 }}>
              <SectionTitle title={title} variant={variant} />
              <Text>{FILLER.slice(0, 120 + (i % 4) * 40)}</Text>
            </View>
          ))}
        </Page>
      </Document>
    );
  }

  const variants: SectionTitleVariant[] = ['sv', 'catalogue', 'schedule', 'judgesBook'];

  for (const variant of variants) {
    it(`(${variant}) a multi-page document never ends a page with a bare heading as the last line`, async () => {
      const count = 24;
      const titles = Array.from({ length: count }, (_, i) => `Section ${i + 1}`);
      const buf = await renderToBuffer(<ManySectionsDoc variant={variant} count={count} />);
      const pages = extractBBoxLayout(buf);
      expect(pages.length).toBeGreaterThan(1); // sanity: the fixture actually paginates

      for (const [pageIndex, page] of pages.entries()) {
        if (page.lines.length === 0) continue; // whole section pushed to next page — fine
        const lastLine = page.lines[page.lines.length - 1];
        expect(
          titles.includes(lastLine.text.trim()),
          `page ${pageIndex + 1}'s last line was a bare heading ("${lastLine.text}") — orphaned`,
        ).toBe(false);
      }
    });
  }
});
