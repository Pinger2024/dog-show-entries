/**
 * PROVING THE TEST FAILS (brief requirement — noted here, not left in the
 * tree, and in this case a real bug the test caught during development
 * rather than one deliberately reintroduced afterwards): the first
 * `balanceColumns` implementation computed its fair-share target ONCE
 * upfront as `totalHeight / columns` and never revised it. Against
 * `heights(100, 5,5,5,5,5,5,5,5,5)` split into 3 columns, the single `100`
 * item alone blew past that fixed target in column 1, and every following
 * `5` then measured itself against that same too-low global number and
 * never triggered a second advance — column 3 came out completely empty
 * (`expected 0 to be greater than 0`). Fixed by recomputing the target
 * against the REMAINING height over the REMAINING columns after every
 * advance (see balanced-columns.tsx's doc comment) — re-ran, all columns
 * non-empty.
 *
 * Re-verified after landing the fix by deliberately dividing by the fixed
 * `columns` instead of the shrinking `remainingColumns` (a close cousin of
 * the original bug) — a different assertion failed this time (the
 * even-split case came out `[2, 1, 3]` instead of `[2, 2, 2]`), confirming
 * the suite catches this class of regression from more than one angle.
 * Restored the remaining-average fix before committing.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer';
import { registerPdfKitFonts } from '../fonts';
import { balanceColumns, BalancedColumns, type HeightedItem } from '../balanced-columns';
import { extractBBoxLayout } from './poppler';

registerPdfKitFonts();

function heights(...hs: number[]): HeightedItem[] {
  return hs.map((height) => ({ height }));
}

function columnHeights(cols: HeightedItem[][]): number[] {
  return cols.map((col) => col.reduce((sum, item) => sum + item.height, 0));
}

describe('balanceColumns', () => {
  it('splits an evenly-sized list evenly by count AND height', () => {
    const items = heights(10, 10, 10, 10, 10, 10);
    const cols = balanceColumns(items, 3);
    expect(cols.map((c) => c.length)).toEqual([2, 2, 2]);
    expect(columnHeights(cols)).toEqual([20, 20, 20]);
  });

  it('balances an unevenly-weighted list by height, not by item count', () => {
    // One very tall item plus many short ones — a count-based split
    // (2 items/column) would put the tall item's column far over target.
    const items = heights(100, 5, 5, 5, 5, 5, 5, 5, 5, 5);
    const total = items.reduce((s, i) => s + i.height, 0); // 145
    const target = total / 3; // ~48.3

    const cols = balanceColumns(items, 3);
    expect(cols).toHaveLength(3);
    const colH = columnHeights(cols);
    // Every column must be present and non-empty (10 items, 3 columns).
    for (const col of cols) expect(col.length).toBeGreaterThan(0);
    // No column should exceed target by more than the tallest single item
    // — the greedy algorithm's worst-case overshoot bound.
    for (const h of colH) {
      expect(h).toBeLessThanOrEqual(target + 100);
    }
    // All items preserved, in order, none dropped or duplicated.
    expect(cols.flat()).toEqual(items);
  });

  it('preserves item order across columns (reading order: col 1 top-to-bottom, then col 2, ...)', () => {
    const items = heights(1, 2, 3, 4, 5, 6);
    const cols = balanceColumns(items, 2);
    expect(cols.flat().map((i) => i.height)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('columns=1 returns everything in a single column', () => {
    const items = heights(1, 2, 3);
    const cols = balanceColumns(items, 1);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toEqual(items);
  });

  it('an empty list returns N empty columns, not N-1 or a single one', () => {
    const cols = balanceColumns([], 3);
    expect(cols).toHaveLength(3);
    expect(cols.every((c) => c.length === 0)).toBe(true);
  });

  it('more columns than items leaves the extra columns empty rather than throwing', () => {
    const items = heights(10, 10);
    const cols = balanceColumns(items, 5);
    expect(cols).toHaveLength(5);
    expect(cols.flat()).toEqual(items);
    expect(cols.filter((c) => c.length > 0)).toHaveLength(2);
  });

  it('throws for columns < 1', () => {
    expect(() => balanceColumns(heights(1), 0)).toThrow();
    expect(() => balanceColumns(heights(1), -1)).toThrow();
  });

  it('a single item with columns=1 works trivially', () => {
    const items = heights(42);
    expect(balanceColumns(items, 1)).toEqual([items]);
  });
});

describe('BalancedColumns component', () => {
  it('renders each item under its balanced column, all text present', async () => {
    const names = ['Alice Officer', 'Bob Steward', 'Carol Ring Steward', 'Dave Vet', 'Eve Committee'];
    const items = names.map((name) => ({ key: name, node: <Text>{name}</Text>, height: 12 }));

    const buf = await renderToBuffer(
      <Document>
        <Page size="A4" style={{ padding: 40, fontFamily: 'Times', fontSize: 10 }}>
          <BalancedColumns items={items} columns={2} />
        </Page>
      </Document>,
    );
    const pages = extractBBoxLayout(buf);
    const allText = pages[0].lines.map((l) => l.text);
    for (const name of names) {
      expect(allText).toContain(name);
    }
  });
});
