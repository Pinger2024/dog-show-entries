/**
 * PROVING THE TEST FAILS (brief requirement — noted here, not left in the
 * tree): removed the `normalPages <= budgetPages` early-return check in
 * `renderWithPageBudget` (always retried, even when the first render was
 * already within budget) — the "does not retry when already within budget"
 * test failed: the retry render (with compact forced on and a distinct
 * page count) came back instead of the normal one. Restored before
 * committing.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { Document, Page, Text } from '@react-pdf/renderer';
import { registerPdfKitFonts } from '../fonts';
import { renderWithPageBudget, pdfPageCount } from '../render-with-page-budget';

registerPdfKitFonts();

interface FakeDocProps {
  pages: number;
  compactPages?: number;
  compact?: boolean;
  density?: 'normal' | 'compact';
  [key: string]: unknown;
}

/** A minimal component whose page count is controlled directly by props,
 *  standing in for a real schedule/catalogue component for these tests —
 *  what matters is the render → count-pages → retry CONTRACT, not any
 *  particular document's content. */
function FakeDoc({ pages, compactPages, compact, density }: FakeDocProps) {
  const isCompact = compact === true || density === 'compact';
  const count = isCompact && compactPages != null ? compactPages : pages;
  return (
    <Document>
      {Array.from({ length: count }, (_, i) => (
        <Page key={i} size="A4" style={{ fontFamily: 'Times' }}>
          <Text>{`Page ${i + 1}`}</Text>
        </Page>
      ))}
    </Document>
  );
}

describe('renderWithPageBudget', () => {
  it('returns the normal render unconditionally when budgetPages is null', async () => {
    const buf = await renderWithPageBudget(FakeDoc, { pages: 5 }, null);
    expect(await pdfPageCount(buf)).toBe(5);
  });

  it('does not retry when the normal render is already within budget', async () => {
    const buf = await renderWithPageBudget(FakeDoc, { pages: 3, compactPages: 1 }, 3);
    // If it had retried, compactPages=1 would have come back instead.
    expect(await pdfPageCount(buf)).toBe(3);
  });

  it('retries with the default compactProp="compact"=true when the normal render overflows the budget', async () => {
    const buf = await renderWithPageBudget(FakeDoc, { pages: 5, compactPages: 3 }, 3);
    expect(await pdfPageCount(buf)).toBe(3);
  });

  it('supports a custom compactProp/compactValue (schedule-render.ts uses density/"compact")', async () => {
    const buf = await renderWithPageBudget<FakeDocProps>(FakeDoc, { pages: 6, compactPages: 4 }, 4, {
      compactProp: 'density',
      compactValue: 'compact',
    });
    expect(await pdfPageCount(buf)).toBe(4);
  });

  it('ships the compact render even if it STILL overflows the budget (better than nothing)', async () => {
    const buf = await renderWithPageBudget(FakeDoc, { pages: 10, compactPages: 8 }, 3);
    expect(await pdfPageCount(buf)).toBe(8);
  });

  it('calls onOverflow with (pagesRendered, budgetPages) exactly once on overflow, and not at all otherwise', async () => {
    const onOverflow = vi.fn();
    await renderWithPageBudget(FakeDoc, { pages: 5, compactPages: 3 }, 3, { onOverflow });
    expect(onOverflow).toHaveBeenCalledTimes(1);
    expect(onOverflow).toHaveBeenCalledWith(5, 3);

    const onOverflow2 = vi.fn();
    await renderWithPageBudget(FakeDoc, { pages: 3 }, 3, { onOverflow: onOverflow2 });
    expect(onOverflow2).not.toHaveBeenCalled();
  });

  it('logs a console.warn with pages/budget/prop/value when no onOverflow is given', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await renderWithPageBudget(FakeDoc, { pages: 5, compactPages: 3 }, 3);
    expect(spy).toHaveBeenCalledTimes(1);
    const message = spy.mock.calls[0][0] as string;
    expect(message).toContain('5 pages');
    expect(message).toContain('budget 3');
    expect(message).toContain('compact=true');
    spy.mockRestore();
  });
});
