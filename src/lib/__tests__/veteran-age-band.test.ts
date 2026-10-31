/**
 * The veteran age band — RKC F(1)27 as amended for 2027: "A Best Veteran is
 * declared from any Veterans entered in any breed classes", a Veteran being
 * "a dog of 7 years or more on the first day of the show".
 *
 * Before 2026-10-27 the award engine decided veteran status from the CLASS
 * NAME alone, so a 7-year-old running in Open could never be Best Veteran —
 * the comment in `buildPlacementIndex` said so, and parked it "awaiting
 * Mandy on an age threshold". Mandy answered on 26 Oct 2026: a veteran in a
 * non-veteran class counts, and only another dog "of the veteran age" beats
 * it out of the running. The regulation supplies the threshold.
 *
 * Two halves are tested here because only one of them is new code:
 *  - the band is now AGE-based (new), and
 *  - the beaten rule is already veteran-vs-veteran (unchanged) — because
 *    `eligibleCandidates` filters to the band BEFORE comparing, so widening
 *    the band silently re-scopes the comparison. That is the half most
 *    likely to be broken by a future "simplification", so it is pinned.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  isVeteranOnShowDate,
  ageInCompletedMonths,
  VETERAN_MIN_AGE_MONTHS,
} from '@/lib/date-utils';
import {
  buildPlacementIndex,
  eligibleCandidates,
  awardFilter,
  type TopAward,
} from '@/lib/top-awards';

const SHOW_DATE = '2026-06-14';
/** Exactly seven years before show day — a veteran on the day, not before it. */
const EXACTLY_SEVEN = '2019-06-14';
/** One day short of seven years on show day. */
const A_DAY_YOUNG = '2019-06-15';

describe('isVeteranOnShowDate', () => {
  it('a dog that turns 7 ON show day is a veteran', () => {
    expect(isVeteranOnShowDate(EXACTLY_SEVEN, SHOW_DATE)).toBe(true);
  });

  it('a dog one day short of 7 on show day is not', () => {
    expect(isVeteranOnShowDate(A_DAY_YOUNG, SHOW_DATE)).toBe(false);
  });

  it('agrees with the Veteran Warrant gate on the boundary dog', () => {
    // dogs.getTitleProgress gates on `ageInCompletedMonths(...) >=
    // VETERAN_MIN_AGE_MONTHS`. If these two ever disagree, a dog is a veteran
    // for one surface and not the other — the exact CLAUDE.md failure.
    expect(ageInCompletedMonths(EXACTLY_SEVEN, SHOW_DATE)).toBe(VETERAN_MIN_AGE_MONTHS);
    expect(ageInCompletedMonths(A_DAY_YOUNG, SHOW_DATE)).toBe(VETERAN_MIN_AGE_MONTHS - 1);
  });

  it('a missing or unusable DOB is not a veteran (callers fall back to class name)', () => {
    expect(isVeteranOnShowDate(null, SHOW_DATE)).toBe(false);
    expect(isVeteranOnShowDate(undefined, SHOW_DATE)).toBe(false);
    expect(isVeteranOnShowDate('', SHOW_DATE)).toBe(false);
    expect(isVeteranOnShowDate('not a date', SHOW_DATE)).toBe(false);
  });

  it('a dog well past 7 stays a veteran', () => {
    expect(isVeteranOnShowDate('2015-01-01', SHOW_DATE)).toBe(true);
  });
});

describe('buildPlacementIndex — the veteran band follows AGE, not the class name', () => {
  it('a 7-year-old placed in Open is a veteran candidate', () => {
    const index = buildPlacementIndex(
      [{
        key: 'Open Dog',
        className: 'Open Dog',
        results: [{ dogId: 'elderStatesman', placement: 1, dogDateOfBirth: EXACTLY_SEVEN }],
      }],
      SHOW_DATE,
    );
    expect(index.inVeteranClass.has('elderStatesman')).toBe(true);
  });

  it('a 5-year-old placed in a class NAMED Veteran is not', () => {
    const index = buildPlacementIndex(
      [{
        key: 'Veteran Dog',
        className: 'Veteran Dog',
        results: [{ dogId: 'tooYoung', placement: 1, dogDateOfBirth: '2021-06-14' }],
      }],
      SHOW_DATE,
    );
    expect(index.inVeteranClass.has('tooYoung')).toBe(false);
  });

  it('falls back to the class name when the DOB is unknown', () => {
    const index = buildPlacementIndex(
      [
        { key: 'Veteran Dog', className: 'Veteran Dog', results: [{ dogId: 'noDobVeteranClass', placement: 1 }] },
        { key: 'Open Dog', className: 'Open Dog', results: [{ dogId: 'noDobOpenClass', placement: 1 }] },
      ],
      SHOW_DATE,
    );
    expect(index.inVeteranClass.has('noDobVeteranClass')).toBe(true);
    expect(index.inVeteranClass.has('noDobOpenClass')).toBe(false);
  });

  it('falls back to the class name when no show date is given', () => {
    const index = buildPlacementIndex([
      { key: 'Veteran Dog', className: 'Veteran Dog', results: [{ dogId: 'a', placement: 1, dogDateOfBirth: '2021-06-14' }] },
    ]);
    expect(index.inVeteranClass.has('a')).toBe(true);
  });
});

describe('Best Veteran — beaten by another VETERAN, not by anyone (Mandy, 26 Oct 2026)', () => {
  const bestVeteran: TopAward = {
    name: 'Best Veteran in Show',
    type: 'best_veteran_in_show',
    filter: awardFilter('best_veteran_in_show'),
  };
  const dog = (dogId: string) => ({ dogId, sex: 'dog' as const });

  it('a veteran beaten in Open by a YOUNGER dog is still in the running', () => {
    const index = buildPlacementIndex(
      [{
        key: 'Open Dog',
        className: 'Open Dog',
        results: [
          { dogId: 'youngster', placement: 1, dogDateOfBirth: '2023-01-01' },
          { dogId: 'veteran', placement: 2, dogDateOfBirth: EXACTLY_SEVEN },
        ],
      }],
      SHOW_DATE,
    );
    const candidates = eligibleCandidates(bestVeteran, [dog('youngster'), dog('veteran')], index);
    expect(candidates.map((c) => c.dogId)).toEqual(['veteran']);
  });

  it('a veteran beaten by ANOTHER VETERAN is out', () => {
    const index = buildPlacementIndex(
      [{
        key: 'Open Dog',
        className: 'Open Dog',
        results: [
          { dogId: 'topVeteran', placement: 1, dogDateOfBirth: EXACTLY_SEVEN },
          { dogId: 'beatenVeteran', placement: 2, dogDateOfBirth: '2018-01-01' },
        ],
      }],
      SHOW_DATE,
    );
    const candidates = eligibleCandidates(bestVeteran, [dog('topVeteran'), dog('beatenVeteran')], index);
    expect(candidates.map((c) => c.dogId)).toEqual(['topVeteran']);
  });
});

/**
 * Guard: the 84-month figure has ONE owner. It was written out as a bare 84
 * in the title-progress router, the class-definition seed and the test-data
 * generator, each with its own comment and no link between them.
 *
 * A bare `84` is too common to scan for; a COMPARISON against 84 is not —
 * checked 2026-10-27, the pattern matched nothing outside the owner.
 */
describe('veteran minimum age — one owner', () => {
  const SRC = join(process.cwd(), 'src');
  const OWNER = join(SRC, 'lib/date-utils.ts');

  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === '__tests__' || name === 'node_modules') continue;
        sourceFiles(full, acc);
      } else if (/\.tsx?$/.test(name)) {
        acc.push(full);
      }
    }
    return acc;
  }

  it('no file outside date-utils compares an age against a bare 84', () => {
    const offenders = sourceFiles(SRC).filter(
      (f) => f !== OWNER && /(>=|<=|>|<|===|!==)\s*84\b/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('the award engine asks the owner rather than re-deriving the band', () => {
    expect(readFileSync(join(SRC, 'lib/top-awards.ts'), 'utf8')).toContain('isVeteranOnShowDate(');
  });
});
