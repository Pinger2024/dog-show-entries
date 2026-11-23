import { describe, it, expect } from 'vitest';
import { comparePlacing } from '../placements';

// One owner for "placing order" — six call sites (the SV results sheet and
// PDF, the steward's live results, the judge's approval page, the critique
// review pickers and the marked catalogue) each wrote their own
// `placement ?? 99 / 100 / 9999` sort until 25 Sept 2026.
describe('comparePlacing', () => {
  // Numbers past 9 on purpose: JavaScript's default sort compares as text and
  // would put 10th before 2nd.
  it('puts placings in number order — 2nd before 10th', () => {
    expect([10, 2, 1, 12].sort(comparePlacing)).toEqual([1, 2, 10, 12]);
  });

  it('puts anything without a placing after every placing', () => {
    expect([null, 12, 3].sort(comparePlacing)).toEqual([3, 12, null]);
    expect(comparePlacing(null, 50)).toBeGreaterThan(0);
    expect(comparePlacing(50, undefined)).toBeLessThan(0);
  });

  it('treats two unplaced dogs as equal, so a stable sort keeps their order', () => {
    expect(comparePlacing(null, undefined)).toBe(0);
    expect(comparePlacing(null, null)).toBe(0);
  });
});
