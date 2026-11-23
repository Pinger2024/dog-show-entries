import { describe, it, expect } from 'vitest';
import { championProgress, judgeKey, shcexPoints, shcexProgress, type ShcexAward, type TitleAward } from '@/lib/rkc-titles';
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

describe('Show Certificate of Excellence points (RKC table)', () => {
  const allBreedOpen = { showType: 'open' as const, showScope: 'general' as const };
  const premierOpen = { showType: 'premier_open' as const, showScope: 'general' as const };
  const award = (a: Partial<ShcexAward> & Pick<ShcexAward, 'kind' | 'date'>): ShcexAward => ({
    showType: null, showScope: null, groupPlace: null, groupSystem: null, ...a,
  });

  it("Paula's four shows for Bali come to 7 — her own sum: BOB 1 each, and 3 for Group 2nd at Eston", () => {
    const p = shcexProgress([
      award({ kind: 'bob', date: '2025-06-01', ...allBreedOpen }),   // Ripon & District
      award({ kind: 'bob', date: '2025-06-18', ...premierOpen }),    // Royal Cheshire Premier Open
      award({ kind: 'bob', date: '2025-07-13', ...allBreedOpen }),   // Durham County
      award({ kind: 'bob', date: '2025-07-19', ...premierOpen }),    // Eston & Barnaby Premier Open
      award({ kind: 'group', date: '2025-07-19', groupPlace: 2, ...premierOpen }),
    ], DOB);
    expect(p).toMatchObject({ points: 7, groupPoints: 3, met: false, needInfo: 0 });
  });

  it("Paula's Bali as she actually entered it — Group 2nd at Eston with no Best of Breed for that show — is still 7", () => {
    // Mandy, 5 Oct 2026, relaying Paula: "it's given me 6 for 3 BOB and 1 with group 2 but I have that as 7". A dog is
    // only placed in the group after winning its breed, and the RKC counts both (no one-award-per-show rule, unlike
    // the Junior Warrant), so Eston is 1 + 3.
    const p = shcexProgress([
      award({ kind: 'bob', date: '2025-06-01', ...allBreedOpen }),   // Ripon & District
      award({ kind: 'bob', date: '2025-06-18', ...premierOpen }),    // Royal Cheshire Premier Open
      award({ kind: 'bob', date: '2025-07-13', ...allBreedOpen }),   // Durham County
      award({ kind: 'group', date: '2025-07-19', groupPlace: 2, ...premierOpen }), // Eston & Barnaby
    ], DOB);
    expect(p).toMatchObject({ points: 7, groupPoints: 3, met: false, needInfo: 0, impliedBobs: 1 });
  });

  it('the Best of Breed point at a group show is never counted twice when the owner has entered it too', () => {
    const p = shcexProgress([
      award({ kind: 'bob', date: '2025-07-19', ...premierOpen }),
      award({ kind: 'group', date: '2025-07-19', groupPlace: 2, ...premierOpen }),
    ], DOB);
    expect(p).toMatchObject({ points: 4, groupPoints: 3, impliedBobs: 0 });
  });

  it('Best in Show on the group system was a group winner, and won its breed: 5 + 4 + 1', () => {
    const bisOnly = shcexProgress([award({ kind: 'bis', date: '2025-08-02', groupSystem: true, ...allBreedOpen })], DOB);
    expect(bisOnly).toMatchObject({ points: 10, groupPoints: 9 });
    const everything = shcexProgress([
      award({ kind: 'bob', date: '2025-08-02', ...allBreedOpen }),
      award({ kind: 'group', date: '2025-08-02', groupPlace: 1, ...allBreedOpen }),
      award({ kind: 'bis', date: '2025-08-02', groupSystem: true, ...allBreedOpen }),
    ], DOB);
    expect(everything).toMatchObject({ points: 10, groupPoints: 9 });
    const reserve = shcexProgress([award({ kind: 'rbis', date: '2025-08-02', groupSystem: true, ...allBreedOpen })], DOB);
    expect(reserve).toMatchObject({ points: 8, groupPoints: 7 });
  });

  it('Best in Show without groups still won its breed first: 9 + 1 at an all-breed show, 5 + 1 at a group show', () => {
    expect(shcexProgress([award({ kind: 'bis', date: '2025-08-02', groupSystem: false, ...allBreedOpen })], DOB))
      .toMatchObject({ points: 10, groupPoints: 0 });
    expect(shcexProgress([award({ kind: 'bis', date: '2025-08-02', groupSystem: false, showType: 'open', showScope: 'group' })], DOB))
      .toMatchObject({ points: 6, groupPoints: 0 });
  });

  it('no Best of Breed point is added where the show earns nothing, or before 18 months', () => {
    expect(shcexProgress([award({ kind: 'group', date: '2025-07-19', groupPlace: 1, showType: 'championship', showScope: 'general' })], DOB))
      .toMatchObject({ points: 0, impliedBobs: 0 });
    expect(shcexProgress([award({ kind: 'group', date: '2025-02-13', groupPlace: 1, ...allBreedOpen })], DOB))
      .toMatchObject({ points: 0, impliedBobs: 0 });
  });

  it('group placings 1st–4th are 4, 3, 2, 1 — and only at all-breed shows', () => {
    const at = (groupPlace: number, scope: 'general' | 'group') =>
      shcexPoints(award({ kind: 'group', date: '2025-07-19', groupPlace, showType: 'open', showScope: scope }), DOB).points;
    expect([1, 2, 3, 4].map((p) => at(p, 'general'))).toEqual([4, 3, 2, 1]);
    expect(at(1, 'group')).toBe(0);
  });

  it('Best in Show: 5 / Reserve 3 on the group system; 9 / 7 at an all-breed show without groups', () => {
    const bis = (kind: 'bis' | 'rbis', groupSystem: boolean) =>
      shcexPoints(award({ kind, date: '2025-07-19', groupSystem, ...allBreedOpen }), DOB);
    expect(bis('bis', true)).toEqual({ points: 5, group: true });
    expect(bis('rbis', true)).toEqual({ points: 3, group: true });
    expect(bis('bis', false)).toEqual({ points: 9, group: false });
    expect(bis('rbis', false)).toEqual({ points: 7, group: false });
  });

  it('nothing at championship shows or breed club shows', () => {
    expect(shcexPoints(award({ kind: 'bob', date: '2025-07-19', showType: 'championship', showScope: 'general' }), DOB).points).toBe(0);
    expect(shcexPoints(award({ kind: 'bob', date: '2025-07-19', showType: 'open', showScope: 'single_breed' }), DOB).points).toBe(0);
  });

  it('nothing before the dog is 18 months old, or before 1 January 2018', () => {
    expect(shcexPoints(award({ kind: 'bob', date: '2025-02-13', ...allBreedOpen }), DOB).points).toBe(0);
    expect(shcexPoints(award({ kind: 'bob', date: '2025-02-14', ...allBreedOpen }), DOB).points).toBe(1);
    expect(shcexPoints(award({ kind: 'bob', date: '2017-12-31', ...allBreedOpen }), '2010-01-01').points).toBe(0);
  });

  it('50 points is not enough without 5 from group competition', () => {
    const bobs = Array.from({ length: 50 }, (_, i) =>
      award({ kind: 'bob', date: `2025-${String((i % 12) + 1).padStart(2, '0')}-15`, ...allBreedOpen }));
    expect(shcexProgress(bobs, '2020-01-01')).toMatchObject({ points: 50, met: false });
    // (each group placing also brings the Best of Breed point won at that show)
    expect(shcexProgress([...bobs, award({ kind: 'group', date: '2025-06-01', groupPlace: 1, ...allBreedOpen })], '2020-01-01'))
      .toMatchObject({ points: 55, groupPoints: 4, met: false });
    expect(shcexProgress([...bobs, award({ kind: 'group', date: '2025-06-01', groupPlace: 1, ...allBreedOpen }),
      award({ kind: 'group', date: '2025-06-02', groupPlace: 4, ...allBreedOpen })], '2020-01-01'))
      .toMatchObject({ points: 57, groupPoints: 5, met: true });
  });

  it("a result added before Remi asked the type of show isn't counted — it's flagged so the owner can fill it in", () => {
    const p = shcexProgress([award({ kind: 'bob', date: '2025-06-01' }), award({ kind: 'group', date: '2025-07-19', ...premierOpen })], DOB);
    expect(p).toMatchObject({ points: 0, needInfo: 2 });
  });
});
