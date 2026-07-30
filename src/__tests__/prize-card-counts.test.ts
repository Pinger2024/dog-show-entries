import { describe, it, expect } from 'vitest';
import { computePrizeCardCounts } from '@/lib/prize-card-counts';

describe('computePrizeCardCounts', () => {
  it('returns all zeros for no classes', () => {
    expect(computePrizeCardCounts([])).toEqual({
      first: 0,
      second: 0,
      third: 0,
      reserve: 0,
      total: 0,
    });
  });

  it('returns all zeros for a class with no entries', () => {
    expect(computePrizeCardCounts([0])).toEqual({
      first: 0,
      second: 0,
      third: 0,
      reserve: 0,
      total: 0,
    });
  });

  it('a single-entry class only needs a 1st card', () => {
    expect(computePrizeCardCounts([1])).toEqual({
      first: 1,
      second: 0,
      third: 0,
      reserve: 0,
      total: 1,
    });
  });

  it('a class with exactly 4 entries needs one card per place', () => {
    expect(computePrizeCardCounts([4])).toEqual({
      first: 1,
      second: 1,
      third: 1,
      reserve: 1,
      total: 4,
    });
  });

  it('caps a large class at 4 cards — no 5th/VHC card', () => {
    expect(computePrizeCardCounts([7])).toEqual({
      first: 1,
      second: 1,
      third: 1,
      reserve: 1,
      total: 4,
    });
  });

  it('sums correctly across a mixed set of classes', () => {
    // 0 -> no cards; 1 -> 1st only; 2 -> 1st+2nd; 5 -> capped at 4; 9 -> capped at 4.
    const result = computePrizeCardCounts([0, 1, 2, 5, 9]);
    expect(result.first).toBe(4); // classes with >=1: the 1, 2, 5, 9
    expect(result.second).toBe(3); // classes with >=2: the 2, 5, 9
    expect(result.third).toBe(2); // classes with >=3: the 5, 9
    expect(result.reserve).toBe(2); // classes with >=4: the 5, 9
    expect(result.total).toBe(1 + 2 + 4 + 4); // min(n,4) per class = 0+1+2+4+4
    expect(result.total).toBe(11);
  });
});
