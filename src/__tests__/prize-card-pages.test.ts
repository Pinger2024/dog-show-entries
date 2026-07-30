import { describe, it, expect } from 'vitest';
import { buildPrizeCardPages, type PrizeCardClassInput } from '@/lib/prize-card-pages';

describe('buildPrizeCardPages', () => {
  it('returns no pages for no classes', () => {
    expect(buildPrizeCardPages([])).toEqual([]);
  });

  it('a class with zero confirmed entries contributes nothing', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 0, judgeId: 'j1', judgeName: 'Hugh De Zutter' },
    ];
    expect(buildPrizeCardPages(classes)).toEqual([]);
  });

  it('a class with 3 confirmed entries makes 1st/2nd/3rd cards but no Reserve', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 3, judgeId: 'j1', judgeName: 'Hugh De Zutter' },
    ];
    const pages = buildPrizeCardPages(classes);
    expect(pages.map((p) => p.placement)).toEqual([1, 2, 3]);
    expect(pages.every((p) => p.judgeLine === 'Judge: Hugh De Zutter')).toBe(true);
  });

  it('caps at Reserve (4) — a class with 9 confirmed entries still only makes 4 cards', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 9, judgeId: 'j1', judgeName: 'Hugh De Zutter' },
    ];
    const pages = buildPrizeCardPages(classes);
    expect(pages.map((p) => p.placement)).toEqual([1, 2, 3, 4]);
  });

  it('formats the judge line with affix when present, without when absent', () => {
    const withAffix = buildPrizeCardPages([
      { confirmedCount: 1, judgeId: 'j1', judgeName: 'Hugh De Zutter', judgeAffix: 'Ch.' },
    ]);
    expect(withAffix[0].judgeLine).toBe('Judge: Hugh De Zutter (Ch.)');

    const noAffix = buildPrizeCardPages([
      { confirmedCount: 1, judgeId: 'j1', judgeName: 'Hugh De Zutter' },
    ]);
    expect(noAffix[0].judgeLine).toBe('Judge: Hugh De Zutter');
  });

  it('a class with no assigned judge yields a null judge line rather than being dropped', () => {
    const pages = buildPrizeCardPages([
      { confirmedCount: 2, judgeId: null, judgeName: null },
    ]);
    expect(pages).toHaveLength(2);
    expect(pages.every((p) => p.judgeLine === null)).toBe(true);
  });

  it('SAC and JH classes attribute their cards to their OWN judge, not the breed judge', () => {
    // Same shape as the real trap: a single-breed show where the breed judge,
    // the SAC judge and the JH judge are three different people, and each
    // class must carry its own resolved judge (resolveJudgeForClass's job,
    // upstream of this function) rather than falling back to the breed judge.
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 2, judgeId: 'breed-judge', judgeName: 'Hugh De Zutter' }, // breed class
      { confirmedCount: 2, judgeId: 'sac-judge', judgeName: 'Ms K Salamon' }, // Special Award Class
      { confirmedCount: 2, judgeId: 'jh-judge', judgeName: 'Mandy McAteer' }, // Junior Handling
    ];
    const pages = buildPrizeCardPages(classes);
    const firstPlacementJudges = pages.filter((p) => p.placement === 1).map((p) => p.judgeLine);
    expect(firstPlacementJudges).toContain('Judge: Hugh De Zutter');
    expect(firstPlacementJudges).toContain('Judge: Ms K Salamon');
    expect(firstPlacementJudges).toContain('Judge: Mandy McAteer');
    // None of them collapse onto one judge — three distinct 1st-place cards.
    expect(new Set(firstPlacementJudges).size).toBe(3);
  });

  it('aggregates multiple classes judged by the same judge into one stack per placement', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 2, judgeId: 'j1', judgeName: 'Hugh De Zutter' }, // dog class: 1st, 2nd
      { confirmedCount: 1, judgeId: 'j1', judgeName: 'Hugh De Zutter' }, // bitch class: 1st only
    ];
    const pages = buildPrizeCardPages(classes);
    // 1st: 2 cards (one per class), 2nd: 1 card. Total 3.
    expect(pages.filter((p) => p.placement === 1)).toHaveLength(2);
    expect(pages.filter((p) => p.placement === 2)).toHaveLength(1);
    expect(pages).toHaveLength(3);
  });

  it('orders pages placement-major, then judge-major (first-seen order), with that judge\'s cards stacked together', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 2, judgeId: 'judge-b', judgeName: 'Judge B' }, // seen first
      { confirmedCount: 2, judgeId: 'judge-a', judgeName: 'Judge A' }, // seen second
    ];
    const pages = buildPrizeCardPages(classes);
    // All placement-1 cards before all placement-2 cards.
    expect(pages.map((p) => p.placement)).toEqual([1, 1, 2, 2]);
    // Within each placement, Judge B's stack (first-seen) comes before Judge A's.
    expect(pages.map((p) => p.judgeLine)).toEqual([
      'Judge: Judge B',
      'Judge: Judge A',
      'Judge: Judge B',
      'Judge: Judge A',
    ]);
  });

  it('the total page count matches Σ min(confirmedCount, 4) across all classes', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 0, judgeId: 'j1', judgeName: 'A' },
      { confirmedCount: 1, judgeId: 'j2', judgeName: 'B' },
      { confirmedCount: 2, judgeId: 'j3', judgeName: 'C' },
      { confirmedCount: 5, judgeId: 'j4', judgeName: 'D' },
      { confirmedCount: 9, judgeId: 'j5', judgeName: 'E' },
    ];
    // 0 + 1 + 2 + 4 + 4 = 11 — same arithmetic as computePrizeCardCounts.
    expect(buildPrizeCardPages(classes)).toHaveLength(11);
  });
});
