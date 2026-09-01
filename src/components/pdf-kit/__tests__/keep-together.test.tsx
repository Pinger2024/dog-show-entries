/**
 * PROVING THE TEST FAILS (brief requirement — noted here, not left in the
 * tree): removed the `tooTallForOnePage` check in `KeepTogether` (hardcoded
 * `wrap={false}` unconditionally, ignoring `estimatedHeight`/`maxHeight`/
 * `forceWrap`) — the escape-hatch test failed: a block genuinely taller
 * than the page still rendered as a single page (content silently
 * overflowing) instead of pagination kicking in. Restored before
 * committing.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import { registerPdfKitFonts } from '../fonts';
import { KeepTogether } from '../keep-together';

registerPdfKitFonts();

// 200 short lines — comfortably taller than one A4 page's usable height at
// 10pt Times (an A4 page holds well under 100 such lines).
const TALL_CONTENT = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`);

async function renderTallBlock(props: Omit<React.ComponentProps<typeof KeepTogether>, 'children'>) {
  const buf = await renderToBuffer(
    <Document>
      <Page size="A4" style={{ padding: 40, fontFamily: 'Times', fontSize: 10 }}>
        <KeepTogether {...props}>
          {TALL_CONTENT.map((l) => (
            <Text key={l}>{l}</Text>
          ))}
        </KeepTogether>
      </Page>
    </Document>,
  );
  return (await PDFDocument.load(buf)).getPageCount();
}

describe('KeepTogether — escape hatch', () => {
  it('defaults to wrap={false}: a block taller than a page overflows silently rather than paginating (matches every existing wrap={false} call site today)', async () => {
    const pages = await renderTallBlock({});
    expect(pages).toBe(1);
  });

  it('falls back to normal wrapping when estimatedHeight exceeds maxHeight, so a too-tall block paginates instead of overflowing', async () => {
    const pages = await renderTallBlock({ estimatedHeight: 3000, maxHeight: 700 });
    expect(pages).toBeGreaterThan(1);
  });

  it('stays wrap={false} when estimatedHeight is within maxHeight (no unnecessary split for a block that DOES fit)', async () => {
    const pages = await renderTallBlock({ estimatedHeight: 500, maxHeight: 700 });
    expect(pages).toBe(1);
  });

  it('forceWrap always overrides the height comparison', async () => {
    const forced = await renderTallBlock({ forceWrap: true, estimatedHeight: 10, maxHeight: 10000 });
    expect(forced).toBeGreaterThan(1);
  });
});
