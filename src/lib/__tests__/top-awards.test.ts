import { describe, it, expect } from 'vitest';
import {
  awardNameToType,
  awardFilter,
  resolveTopAwards,
  buildPlacementIndex,
  beatenByRival,
  eligibleCandidates,
  isReserveAward,
  RESERVE_TYPES,
  type IndexClass,
  type TopAward,
} from '@/lib/top-awards';
import type { AchievementType } from '@/lib/placements';

// Build a TopAward the way the surfaces do, straight off the award type.
const award = (type: AchievementType, name = type): TopAward => ({
  name,
  type,
  filter: awardFilter(type),
});

// A placed dog for the candidate pool. `sex` is the only field the engine reads;
// the rest stands in for the display fields the real surfaces carry.
const dog = (dogId: string, sex: 'dog' | 'bitch' | null) => ({ dogId, sex, dogName: dogId });

// A class for the index: id, human name (drives age-band inference), placings.
const cls = (
  className: string,
  placings: Array<[string, number | null]>,
): IndexClass => ({
  key: className,
  className,
  results: placings.map(([dogId, placement]) => ({ dogId, placement })),
});

describe('awardNameToType', () => {
  it('maps the full RKC vocabulary, case/spacing-insensitive', () => {
    expect(awardNameToType('Best in Show')).toBe('best_in_show');
    expect(awardNameToType('  best of breed ')).toBe('best_of_breed');
    expect(awardNameToType('Best Dog')).toBe('best_dog');
    expect(awardNameToType('Res Best Dog')).toBe('reserve_best_dog');
    expect(awardNameToType('Reserve Best Bitch')).toBe('reserve_best_bitch');
    expect(awardNameToType('Best Puppy in Show')).toBe('best_puppy_in_show');
    expect(awardNameToType('Best Veteran')).toBe('best_veteran_in_show');
    expect(awardNameToType('Best Long Coat in Show')).toBe('best_long_coat_in_show');
    expect(awardNameToType('Dog CC')).toBe('dog_cc');
  });

  it('returns null for a bespoke trophy name we do not record', () => {
    expect(awardNameToType('The Smith Memorial Trophy')).toBeNull();
  });
});

describe('awardFilter', () => {
  it('derives sex / puppy / veteran / long-coat bands', () => {
    expect(awardFilter('best_dog')).toEqual({ sex: 'dog', puppy: false, veteran: false, longCoat: false });
    expect(awardFilter('best_bitch').sex).toBe('bitch');
    expect(awardFilter('reserve_best_dog').sex).toBe('dog');
    expect(awardFilter('best_puppy_dog')).toMatchObject({ sex: 'dog', puppy: true });
    expect(awardFilter('best_puppy_in_show')).toMatchObject({ sex: null, puppy: true });
    expect(awardFilter('best_veteran_in_show').veteran).toBe(true);
    expect(awardFilter('best_long_coat_in_show')).toMatchObject({ sex: null, longCoat: true });
  });
});

describe('resolveTopAwards', () => {
  it("uses the show's own configured list verbatim (BAGSD: Best Dog/Bitch + reserves, not CCs)", () => {
    const bagsd = [
      'Best in Show', 'Best Dog', 'Best Bitch', 'Res Best Bitch',
      'Best Puppy Dog', 'Best Puppy Bitch', 'Best Veteran',
      'Best Puppy in Show', 'Res Best Dog', 'Best Long Coat in Show',
    ];
    const resolved = resolveTopAwards('championship', bagsd);
    expect(resolved.map((a) => a.type)).toEqual([
      'best_in_show', 'best_dog', 'best_bitch', 'reserve_best_bitch',
      'best_puppy_dog', 'best_puppy_bitch', 'best_veteran_in_show',
      'best_puppy_in_show', 'reserve_best_dog', 'best_long_coat_in_show',
    ]);
    // Crucially, "Best Dog" is NOT silently swapped to a CC.
    expect(resolved.some((a) => a.type === 'dog_cc')).toBe(false);
    // Display names are preserved exactly as configured.
    expect(resolved.find((a) => a.type === 'reserve_best_dog')?.name).toBe('Res Best Dog');
  });

  it('drops names we cannot record and de-dups repeated types', () => {
    const resolved = resolveTopAwards('open', [
      'Best in Show', 'The Founders Trophy', 'Best in Show',
    ]);
    expect(resolved.map((a) => a.type)).toEqual(['best_in_show']);
  });

  it('falls back to show-type defaults when nothing is configured', () => {
    const resolved = resolveTopAwards('championship', []);
    expect(resolved.length).toBeGreaterThan(0);
  });
});

describe('RESERVE_TYPES / isReserveAward', () => {
  it('flags reserves (which keep runners-up) and not bests', () => {
    expect(isReserveAward('reserve_best_dog')).toBe(true);
    expect(isReserveAward('reserve_best_bitch')).toBe(true);
    expect(isReserveAward('best_dog')).toBe(false);
    expect(RESERVE_TYPES.has('reserve_best_veteran_in_show')).toBe(true);
  });
});

describe('buildPlacementIndex', () => {
  it('infers puppy band from "puppy" but NOT "baby puppy"', () => {
    const index = buildPlacementIndex([
      cls('Minor Puppy Dog', [['p1', 1]]),
      cls('Baby Puppy Dog', [['b1', 1]]),
      cls('Veteran Dog', [['v1', 1]]),
    ]);
    expect(index.inPuppyClass.has('p1')).toBe(true);
    expect(index.inPuppyClass.has('b1')).toBe(false); // baby puppy is not "puppy"
    expect(index.inVeteranClass.has('v1')).toBe(true);
  });

  it('records placements per dog and skips unplaced / null-dog rows', () => {
    const index = buildPlacementIndex([
      cls('Open Dog', [['a', 1], ['b', 2], ['c', null]]),
      cls('Limit Dog', [[null as unknown as string, 1]]),
    ]);
    expect(index.placements.get('a')).toEqual([{ key: 'Open Dog', placement: 1 }]);
    expect(index.placements.has('c')).toBe(false); // placed null → not recorded
  });
});

describe('beatenByRival', () => {
  it('is true only when a rival placed ABOVE in a SHARED class', () => {
    const index = buildPlacementIndex([cls('Open Dog', [['a', 1], ['b', 2]])]);
    expect(beatenByRival('b', ['a', 'b'], index.placements)).toBe(true);
    expect(beatenByRival('a', ['a', 'b'], index.placements)).toBe(false);
    // A dog never beats itself.
    expect(beatenByRival('a', ['a'], index.placements)).toBe(false);
  });
});

describe('eligibleCandidates — the RKC beaten rule', () => {
  it('keeps a puppy beaten only by ADULTS in a mixed class (Paula’s rule)', () => {
    // pup came 4th in Junior behind three adults, but won Minor Puppy.
    const index = buildPlacementIndex([
      cls('Junior Dog', [['adult1', 1], ['adult2', 2], ['adult3', 3], ['pup', 4]]),
      cls('Minor Puppy Dog', [['pup', 1]]),
    ]);
    const dogs = [dog('adult1', 'dog'), dog('adult2', 'dog'), dog('adult3', 'dog'), dog('pup', 'dog')];
    const out = eligibleCandidates(award('best_puppy_dog'), dogs, index);
    // Adults are not in the puppy band, so they cannot eliminate the pup.
    expect(out.map((d) => d.dogId)).toEqual(['pup']);
  });

  it('excludes a puppy beaten by ANOTHER puppy', () => {
    const index = buildPlacementIndex([cls('Minor Puppy Dog', [['pA', 1], ['pB', 2]])]);
    const dogs = [dog('pA', 'dog'), dog('pB', 'dog')];
    const out = eligibleCandidates(award('best_puppy_dog'), dogs, index);
    expect(out.map((d) => d.dogId)).toEqual(['pA']);
  });

  it('split-class edge: two puppies each beat the other → BOTH out (empty)', () => {
    // pA wins Minor Puppy beating pB; pB wins Puppy beating pA. (Mandy 2026-06-26)
    const index = buildPlacementIndex([
      cls('Minor Puppy Dog', [['pA', 1], ['pB', 2]]),
      cls('Puppy Dog', [['pB', 1], ['pA', 2]]),
    ]);
    const dogs = [dog('pA', 'dog'), dog('pB', 'dog')];
    const out = eligibleCandidates(award('best_puppy_dog'), dogs, index);
    expect(out).toEqual([]);
  });

  it('reserve awards keep the runners-up (the reserve IS a beaten dog)', () => {
    const index = buildPlacementIndex([cls('Open Dog', [['a', 1], ['b', 2]])]);
    const dogs = [dog('a', 'dog'), dog('b', 'dog')];
    expect(eligibleCandidates(award('best_dog'), dogs, index).map((d) => d.dogId)).toEqual(['a']);
    expect(eligibleCandidates(award('reserve_best_dog'), dogs, index).map((d) => d.dogId)).toEqual(['a', 'b']);
  });

  it('filters by sex and ignores unplaced dogs', () => {
    const index = buildPlacementIndex([
      cls('Open Dog', [['d1', 1]]),
      cls('Open Bitch', [['b1', 1]]),
    ]);
    const dogs = [dog('d1', 'dog'), dog('b1', 'bitch'), dog('absent', 'dog')];
    expect(eligibleCandidates(award('best_dog'), dogs, index).map((d) => d.dogId)).toEqual(['d1']);
    expect(eligibleCandidates(award('best_bitch'), dogs, index).map((d) => d.dogId)).toEqual(['b1']);
  });

  it('Best in Show spans both sexes (no sex filter)', () => {
    const index = buildPlacementIndex([
      cls('Open Dog', [['d1', 1]]),
      cls('Open Bitch', [['b1', 1]]),
    ]);
    const dogs = [dog('d1', 'dog'), dog('b1', 'bitch')];
    const out = eligibleCandidates(award('best_in_show'), dogs, index).map((d) => d.dogId).sort();
    expect(out).toEqual(['b1', 'd1']);
  });
});
