/**
 * InfoCard defaults to wrap={false} (a small card should move to the next
 * page as one unit, never split mid-card) — but a card whose content is an
 * unbounded LIST (Judges, Officers & Committee) can legitimately outgrow a
 * whole blank page on a show with a big panel or committee. With
 * wrap={false} a card that big can't be split, so react-pdf warns "Node of
 * type VIEW can't wrap between pages and it's bigger than available page
 * height" and — the real bug, not just the noise — keeps it on one page
 * and stops rendering once it runs out of room: 4 of 30 officers vanished
 * from the printed schedule entirely (verified against real render output,
 * rasterised page PNGs compared before/after, in the golden guard's
 * 30-officer stress fixture, 2026-09-03 — see that commit for the visual
 * proof; a *reliable* isolated repro of the exact content-loss geometry
 * turned out to be render-context-sensitive, so this file pins the
 * mechanism InfoCard actually controls instead).
 *
 * INFO_CARD_LIST_WRAP_THRESHOLD-gated call sites (show-schedule.tsx /
 * show-schedule-multibreed.tsx) pass wrap={true} once a list is long
 * enough to plausibly hit that ceiling. This test proves the warning
 * itself is exactly gated on that `wrap` prop.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { InfoCard, INFO_CARD_LIST_WRAP_THRESHOLD } from '../elements';
import { extractDocumentGeometry } from '../../../../__tests__/golden/lib/pdf-inspect';

const ROW_COUNT = 30;
const rowLabel = (i: number) => `Committee Role ${i}`;

function renderOfficersCard(wrap: boolean) {
  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A5', style: { padding: 22 } },
      React.createElement(
        InfoCard,
        { title: 'Officers & Committee', wrap },
        Array.from({ length: ROW_COUNT }, (_, i) =>
          React.createElement(
            View,
            { key: i },
            React.createElement(Text, null, rowLabel(i)),
          ),
        ),
      ),
    ),
  );
  return renderToBuffer(doc);
}

describe('InfoCard overflow (a list too long for one page)', () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  afterEach(() => {
    console.warn = origWarn;
    warnings.length = 0;
  });

  it('the threshold is above every real-show fixture count and below this test\'s stress count', () => {
    expect(INFO_CARD_LIST_WRAP_THRESHOLD).toBeGreaterThan(12); // max real officers count (clyde-valley-open-2026)
    expect(INFO_CARD_LIST_WRAP_THRESHOLD).toBeLessThan(ROW_COUNT);
  });

  it('wrap=false (below-threshold default) on an oversized list: react-pdf warns', async () => {
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
    await renderOfficersCard(false);
    console.warn = origWarn;

    expect(warnings.some((w) => w.includes("can't wrap between pages"))).toBe(true);
  });

  it('wrap=true (over-threshold call sites): no warning, list splits across pages, every row present', async () => {
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
    const buf = await renderOfficersCard(true);
    console.warn = origWarn;

    expect(warnings.some((w) => w.includes("can't wrap between pages"))).toBe(false);

    const geo = await extractDocumentGeometry(buf);
    expect(geo.pageCount).toBeGreaterThan(1); // the list needed to split to fit
    const allText = geo.pages.flatMap((p) => p.map((l) => l.text)).join(' ');
    for (let i = 0; i < ROW_COUNT; i++) {
      expect(allText).toContain(rowLabel(i).toLowerCase().replace(/\s+/g, ''));
    }
  });
});
