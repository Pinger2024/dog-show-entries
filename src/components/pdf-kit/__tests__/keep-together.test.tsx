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

/**
 * REGRESSION — a real render bug found migrating the RKC catalogue onto
 * this kit: `<KeepTogether>` with no `minPresenceAhead` prop is meant to
 * behave exactly like the `<View wrap={false}>` it replaces, but the
 * implementation used to always pass `minPresenceAhead={minPresenceAhead}`
 * straight through to the underlying `<View>` — and @react-pdf/layout's
 * own `getMinPresenceAhead` reads this prop with `'minPresenceAhead' in
 * props`, NOT `!= null` (`const getMinPresenceAhead = (node) =>
 * 'minPresenceAhead' in node.props ? node.props.minPresenceAhead : 0` —
 * see node_modules/@react-pdf/layout/lib/index.js). An explicitly
 * `undefined` value is a PRESENT key with an undefined value, so it reads
 * back as `undefined` rather than the engine's documented default of 0,
 * which turns its own arithmetic (`child.box.top + child.box.height +
 * child.box.marginBottom + minPresenceAhead`) into `NaN` — silently
 * disabling react-pdf's built-in protection against a block's own trailing
 * margin being cut off at a page boundary (`Math.min(NaN, x)` is always
 * `NaN`, and every comparison against `NaN` is `false`).
 *
 * Confirmed live, not just by reading the source: swapping two
 * `wrap={false}` blocks for bare `<KeepTogether>` (no `minPresenceAhead`)
 * in the RKC catalogue's front matter reflowed page breaks on two real
 * shows' golden renders (gsd-scotland-champ-2026 and
 * north-eastern-champ-2026's catalogue-by-class/marked) with NO other
 * code change — reverting only this prop pass-through made the golden
 * diff disappear across three repeated runs. A synthetic single-block
 * page-count reproduction was attempted first but did not reliably
 * isolate the divergence (page-count alone wasn't a sensitive enough
 * probe for this particular arithmetic bug); the test below instead
 * asserts the actual prop-presence contract directly — the same thing
 * `getMinPresenceAhead` checks — which is exact and needs no PDF render.
 *
 * PROVING THIS TEST FAILS (brief requirement — noted here, not left in the
 * tree): reverted the fix (passed `minPresenceAhead={minPresenceAhead}`
 * unconditionally again) — `'minPresenceAhead' in element.props` came
 * back `true` even with no prop supplied by the caller. Restored the fix
 * before committing.
 */
describe('KeepTogether — never leaks an undefined minPresenceAhead prop key', () => {
  it('omits the minPresenceAhead prop entirely from the underlying View when the caller does not pass one (matches a plain <View wrap={false}> exactly — see the file header for why "in" vs "!= null" matters here)', () => {
    // Calling KeepTogether directly as a function (it's a plain component,
    // no hooks) returns the React element it would render — inspecting
    // `.props` here is exactly what @react-pdf/layout's own
    // `getMinPresenceAhead` inspects at render time.
    const element = KeepTogether({ children: <Text>hi</Text>, style: {} });
    expect('minPresenceAhead' in element.props).toBe(false);
  });

  it('still passes minPresenceAhead through when the caller supplies one (including 0)', () => {
    const withValue = KeepTogether({ children: <Text>hi</Text>, minPresenceAhead: 42 });
    expect(withValue.props.minPresenceAhead).toBe(42);

    const withZero = KeepTogether({ children: <Text>hi</Text>, minPresenceAhead: 0 });
    expect('minPresenceAhead' in withZero.props).toBe(true);
    expect(withZero.props.minPresenceAhead).toBe(0);
  });
});
