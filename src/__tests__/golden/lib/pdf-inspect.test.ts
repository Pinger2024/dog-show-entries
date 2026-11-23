/**
 * Unit coverage for diffGeometry's text-layer-drift tolerance.
 *
 * Real-world motivation (coordinator's review, 2026-09-02): roughly one
 * render in six, the PDF's ToUnicode text layer drops specific letters
 * (a, c, j, x, z, m confirmed) while the rasterised page is pixel-
 * identical — "friday" extracts as "fridy", "isjudged" as "isudged". This
 * is a fontkit/pdfkit process-state issue (out of scope to fix here — see
 * diffGeometry's own doc comments), not a real layout change, so the
 * comparator must not fail a document over it. It DOES still need to fail
 * over an actual content or position change — these tests cover both
 * sides of that line.
 *
 * PROVING THE TEST FAILS (brief requirement — noted here, not left in the
 * tree): temporarily reverted diffLineLists to skip the text-drift pass
 * entirely (drop straight to the moved/added/removed pairing) — "resolves
 * a dropped-letter line as a tolerated match, not a real change" failed
 * with the drifted line reported as one added + one removed line, and
 * `isGeometryDiffEmpty` came back false. Restored before committing.
 */
import { describe, it, expect } from 'vitest';
import { diffGeometry, isGeometryDiffEmpty, type DocumentGeometry, type LineEntry } from './pdf-inspect';

function geometry(lines: LineEntry[]): DocumentGeometry {
  return { pageCount: 1, pages: [lines], fonts: [] };
}

function line(text: string, overrides: Partial<LineEntry> = {}): LineEntry {
  return { text, x: 34, y: 82.5, w: 100, h: 10.5, ...overrides };
}

describe('diffGeometry — text-layer drift tolerance', () => {
  it('resolves a dropped-letter line (same bbox, text is a subsequence) as a tolerated match, not a real change', () => {
    const baseline = geometry([line('friday')]);
    const current = geometry([line('fridy')]); // dropped "a" — the exact case from the real render
    const diff = diffGeometry(baseline, current);

    expect(isGeometryDiffEmpty(diff)).toBe(true);
    expect(diff.changedPages).toEqual([]);
    expect(diff.textDrift).toEqual([{ page: 1, baseline: 'friday', current: 'fridy', x: 34, y: 82.5 }]);
  });

  it('resolves an added-letter line (current is a superset) the same way, symmetrically', () => {
    const baseline = geometry([line('isudged')]); // as if the BASELINE itself was captured mid-drift
    const current = geometry([line('isjudged')]);
    const diff = diffGeometry(baseline, current);

    expect(isGeometryDiffEmpty(diff)).toBe(true);
    expect(diff.textDrift).toEqual([{ page: 1, baseline: 'isudged', current: 'isjudged', x: 34, y: 82.5 }]);
  });

  it('multiple dropped letters in one render are each resolved independently', () => {
    const baseline = geometry([line('friday'), line('classic', { y: 100 })]);
    const current = geometry([line('fridy'), line('clasic', { y: 100 })]);
    const diff = diffGeometry(baseline, current);

    expect(isGeometryDiffEmpty(diff)).toBe(true);
    expect(diff.textDrift).toHaveLength(2);
  });

  it('still fails on a genuine text change at the same position (not a subsequence relation)', () => {
    const baseline = geometry([line('friday')]);
    const current = geometry([line('monday')]); // real content change — not a dropped letter
    const diff = diffGeometry(baseline, current);

    expect(isGeometryDiffEmpty(diff)).toBe(false);
    expect(diff.textDrift).toEqual([]);
    expect(diff.changedPages[0]!.added).toEqual([line('monday')]);
    expect(diff.changedPages[0]!.removed).toEqual([line('friday')]);
  });

  it('still fails when the SAME text moves to a different position (not a bbox match)', () => {
    const baseline = geometry([line('friday', { x: 34, y: 82.5 })]);
    const current = geometry([line('friday', { x: 34, y: 200 })]);
    const diff = diffGeometry(baseline, current);

    expect(isGeometryDiffEmpty(diff)).toBe(false);
    expect(diff.textDrift).toEqual([]);
    expect(diff.changedPages[0]!.moved).toEqual([{ text: 'friday', from: { x: 34, y: 82.5 }, to: { x: 34, y: 200 } }]);
  });

  it('does not treat a same-length anagram-like reordering as a dropped letter', () => {
    // "abc" vs "bca" — same letters, different order. Not what the real
    // bug produces (it only ever drops/adds, never reorders), and
    // treating it as tolerable would hide a real content swap.
    const baseline = geometry([line('abc')]);
    const current = geometry([line('bca')]);
    const diff = diffGeometry(baseline, current);

    expect(isGeometryDiffEmpty(diff)).toBe(false);
    expect(diff.textDrift).toEqual([]);
  });

  it('a page identical apart from drift still reports zero changedPages, but records the drift for counting', () => {
    const baseline = geometry([line('friday'), line('generated1september2026', { y: 100 })]);
    const current = geometry([line('fridy'), line('generated1september2026', { y: 100 })]);
    const diff = diffGeometry(baseline, current);

    expect(diff.changedPages).toEqual([]);
    expect(diff.textDrift).toHaveLength(1);
  });
});
