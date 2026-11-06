import { describe, it, expect } from 'vitest';
import { checkCatalogueNumberSequence } from '@/lib/catalogue-preflight';
import { expectedCatalogueNumbers } from '@/lib/catalogue-number-rule';

// The print preflight used to know only "1 … N with no gaps", so every Midland
// render after its +140 bib renumber (5 Oct 2026) was recorded as FAILED. It
// now checks the numbers against the show's own rule — the same one that
// issued them (lib/catalogue-number-rule.ts).
const BIBS = { start: 141, skip: [197, 212, 216] };

describe('print preflight — catalogue number sequence', () => {
  it('passes numbers issued from 141 with 197, 212 and 216 left out', () => {
    const numbers = expectedCatalogueNumbers(BIBS, 78);
    expect(checkCatalogueNumberSequence(numbers, BIBS)).toMatchObject({ ok: true });
  });

  it('still passes a plain 1 … N show, with no rule stored on an older snapshot', () => {
    expect(checkCatalogueNumberSequence([3, 1, 2], undefined)).toMatchObject({ ok: true });
  });

  it('fails the same numbers when the show has no such rule', () => {
    expect(checkCatalogueNumberSequence(expectedCatalogueNumbers(BIBS, 10), undefined)).toMatchObject({ ok: false });
  });

  it('names a real gap, a duplicate, and a left-out number that was printed anyway', () => {
    const gap = expectedCatalogueNumbers(BIBS, 60).filter((n) => n !== 150);
    expect(checkCatalogueNumberSequence(gap, BIBS)).toMatchObject({ ok: false });

    const dupe = [...expectedCatalogueNumbers(BIBS, 5), 141];
    const dupeResult = checkCatalogueNumberSequence(dupe, BIBS);
    expect(dupeResult.ok).toBe(false);
    expect(dupeResult.detail).toContain('141');

    const leftOutUsed = [...expectedCatalogueNumbers(BIBS, 56), 197]; // 141 … 196, then 197
    const leftOutResult = checkCatalogueNumberSequence(leftOutUsed, BIBS);
    expect(leftOutResult.ok).toBe(false);
    expect(leftOutResult.detail).toContain('197');
  });
});
