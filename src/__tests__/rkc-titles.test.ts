import { describe, it, expect } from 'vitest';
import { championProgress, judgeKey, type TitleAward } from '@/lib/rkc-titles';
import { scanFiles } from './helpers/static-scan';

/**
 * The RKC Champion rule (royalkennelclub.com, May 2023): 3 CCs under 3
 * different judges, or 2 CCs + 5 RCCs (awarded from 1 July 2023) from 7
 * different judges — either way one CC won when the dog was over 12 months.
 */

const DOB = '2023-08-14'; // Paluka Bali
const cc = (date: string, judgeName: string | null): TitleAward => ({ kind: 'cc', date, judgeName });
const rcc = (date: string, judgeName: string | null): TitleAward => ({ kind: 'rcc', date, judgeName });

describe('judges are counted by name', () => {
  it("Paula's Bali: a CC and a Reserve CC from two judges she typed in — 2 judges, not 0", () => {
    const p = championProgress([cc('2026-07-03', 'Josh Henderson'), rcc('2026-01-17', 'Andy Foreman')], DOB);
    expect(p.classic).toMatchObject({ ccs: 1, judges: 1 });
    expect(p.alternative).toMatchObject({ ccs: 1, rccs: 1, judges: 2 });
  });

  it('two spellings of one judge are one judge', () => {
    expect(judgeKey('Mrs J. Smith')).toBe(judgeKey('mrs j smith'));
    const p = championProgress([cc('2025-01-01', 'Mrs J. Smith'), cc('2025-02-01', 'mrs j smith')], DOB);
    expect(p.classic.judges).toBe(1);
  });

  it('an award with no judge recorded counts as an award but not as a judge', () => {
    const p = championProgress([cc('2025-01-01', null)], DOB);
    expect(p.classic).toMatchObject({ ccs: 1, judges: 0 });
  });
});

describe('classic route — 3 CCs under 3 different judges, one after 12 months', () => {
  it('met', () => {
    expect(championProgress([cc('2025-01-01', 'A'), cc('2025-02-01', 'B'), cc('2025-03-01', 'C')], DOB).classic.met).toBe(true);
  });

  it('3 CCs but only 2 judges — not met', () => {
    expect(championProgress([cc('2025-01-01', 'A'), cc('2025-02-01', 'A'), cc('2025-03-01', 'B')], DOB).classic.met).toBe(false);
  });

  it('every CC won before 12 months of age — not met, and it says why', () => {
    const p = championProgress([cc('2024-03-01', 'A'), cc('2024-04-01', 'B'), cc('2024-05-01', 'C')], DOB);
    expect(p.classic.met).toBe(false);
    expect(p.classic.hasCcOver12Months).toBe(false);
  });
});

describe('alternative route — 2 CCs + 5 RCCs from 7 different judges (from 1 July 2023)', () => {
  const rccsFrom = (judges: string[], date = '2025-06-01') => judges.map((j) => rcc(date, j));

  it('met', () => {
    const p = championProgress([cc('2025-01-01', 'A'), cc('2025-02-01', 'B'), ...rccsFrom(['C', 'D', 'E', 'F', 'G'])], DOB);
    expect(p.alternative.met).toBe(true);
    expect(p.met).toBe(true);
  });

  it('1 CC + 7 RCCs is NOT a route (the old "1 CC + 7 RCCs" box was wrong)', () => {
    const p = championProgress([cc('2025-01-01', 'A'), ...rccsFrom(['B', 'C', 'D', 'E', 'F', 'G', 'H'])], DOB);
    expect(p.alternative.met).toBe(false);
  });

  it('Reserve CCs from before 1 July 2023 do not count', () => {
    const p = championProgress(
      [cc('2025-01-01', 'A'), cc('2025-02-01', 'B'), ...rccsFrom(['C', 'D', 'E', 'F', 'G'], '2023-06-30')],
      DOB,
    );
    expect(p.alternative.rccs).toBe(0);
    expect(p.alternative.met).toBe(false);
  });

  it('a judge who gave a CC and an RCC only counts once — seven different judges are needed', () => {
    const p = championProgress([cc('2025-01-01', 'A'), cc('2025-02-01', 'B'), ...rccsFrom(['A', 'C', 'D', 'E', 'F'])], DOB);
    expect(p.alternative.met).toBe(false);
  });

  it('both CCs from the same judge — not met', () => {
    const p = championProgress([cc('2025-01-01', 'A'), cc('2025-02-01', 'A'), ...rccsFrom(['C', 'D', 'E', 'F', 'G'])], DOB);
    expect(p.alternative.met).toBe(false);
  });
});

describe('the Champion rule has one owner', () => {
  it('no file outside lib/rkc-titles.ts writes the "N RCCs" route itself', () => {
    const hits = scanFiles(['src'], ['.ts', '.tsx'], /RCCs? under 7|7 RCCs|requiredRCCs:\s*7|qualifyingRCCs/)
      .filter((m) => m.file !== 'src/lib/rkc-titles.ts' && !m.file.includes('__tests__'));
    expect(hits).toEqual([]);
  });
});
