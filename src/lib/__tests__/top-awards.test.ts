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

  // Live-show audit 2026-08-11 (Mandy: "how do we ensure these awards are on
  // the awards page and not just the sponsor page"): clubs write these in
  // spellings/word orders the strict lookup missed, so the awards printed in
  // the catalogue but were silently unrecordable in results.
  it('accepts the spellings clubs actually type', () => {
    // "Longcoat" as one word, with or without hyphens (Clyde Valley schedule).
    expect(awardNameToType('Best Longcoat in Show')).toBe('best_long_coat_in_show');
    expect(awardNameToType('Best Long-Coat in Show')).toBe('best_long_coat_in_show');
    expect(awardNameToType('Best Longcoat Adult')).toBe('best_long_coat_adult');
    expect(awardNameToType('Best Longcoat Puppy')).toBe('best_long_coat_puppy');
    // Sex-first word orders (North Eastern Championship 2026).
    expect(awardNameToType('Bitch Reserve Challenge Certificate')).toBe('reserve_bitch_cc');
    expect(awardNameToType('Dog Reserve Challenge Certificate')).toBe('reserve_dog_cc');
    expect(awardNameToType('Dog Best Long Coat')).toBe('best_long_coat_dog');
    expect(awardNameToType('Bitch Best Long Coat')).toBe('best_long_coat_bitch');
  });

  it('still refuses names that need a human decision', () => {
    // GSD Scotland's "Best Challenge Certificate" is a typo (Bitch CC?) — it
    // must stay unrecognised so the setup warning surfaces it, not guessed at.
    expect(awardNameToType('Best Challenge Certificate')).toBeNull();
    // Bare "Best Puppy" is ambiguous (in breed vs in show) until Mandy rules.
    expect(awardNameToType('Best Puppy')).toBeNull();
  });
});

describe('awardFilter', () => {
  it('derives sex / puppy / veteran / long-coat bands', () => {
    expect(awardFilter('best_dog')).toEqual({ sex: 'dog', puppy: false, veteran: false, longCoat: false, babyPuppy: false });
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

// Adversarial cases drawn from Mandy's 2026-07-02 demo run-through of the real
// BAGSD award list — the exact things a steward will hit on the day.
describe('eligibleCandidates — real-show scenarios (Mandy 2026-07-02)', () => {
  it('Best Dog: a class winner beaten in a SECOND class is dropped ("why only 3?")', () => {
    // Mirrors the demo: Open winner also ran Long Coat Open and came 9th; the
    // Long Coat Open winner also ran Open and came 6th — they beat each other, so
    // BOTH are out. Only the dog that won its one-and-only class survives.
    const index = buildPlacementIndex([
      cls('Open Dog', [['blackDiamond', 1], ['ruby', 6]]),
      cls('Special Long Coat Open Dog', [['ruby', 1], ['blackDiamond', 9]]),
      cls('Minor Puppy Dog', [['dragon', 1]]),
    ]);
    const dogs = [dog('blackDiamond', 'dog'), dog('ruby', 'dog'), dog('dragon', 'dog')];
    const out = eligibleCandidates(award('best_dog'), dogs, index).map((d) => d.dogId).sort();
    expect(out).toEqual(['dragon']);
  });

  it('an unbeaten dog stays eligible however many classes it entered (positive control)', () => {
    const index = buildPlacementIndex([
      cls('Open Dog', [['champ', 1], ['a', 2]]),
      cls('Limit Dog', [['champ', 1], ['b', 2]]),
      cls('Post Graduate Dog', [['champ', 1], ['c', 2]]),
    ]);
    const dogs = ['champ', 'a', 'b', 'c'].map((id) => dog(id, 'dog'));
    const out = eligibleCandidates(award('best_dog'), dogs, index).map((d) => d.dogId);
    expect(out).toEqual(['champ']);
  });

  it('Best Puppy Dog INCLUDES the Long Coat Puppy class when scheduled (Mandy: GSD coat varieties)', () => {
    const index = buildPlacementIndex([
      cls('Special Long Coat Puppy Dog', [['lcPup', 1]]),
      cls('Minor Puppy Dog', [['scPup', 1]]),
    ]);
    const dogs = [dog('lcPup', 'dog'), dog('scPup', 'dog')];
    const out = eligibleCandidates(award('best_puppy_dog'), dogs, index).map((d) => d.dogId).sort();
    // Long Coat Puppy is a "puppy" class, so its winner is eligible for Best Puppy Dog.
    expect(out).toEqual(['lcPup', 'scPup']);
  });

  it('Best Puppy Dog: a Long Coat Puppy winner beaten in another puppy class drops off', () => {
    // Springfield Highland Gold: won Long Coat Puppy but 4th in Minor Puppy & Puppy.
    const index = buildPlacementIndex([
      cls('Special Long Coat Puppy Dog', [['highlandGold', 1]]),
      cls('Minor Puppy Dog', [['dragon', 1], ['highlandGold', 4]]),
      cls('Puppy Dog', [['sapphire', 1], ['highlandGold', 4]]),
    ]);
    const dogs = [dog('highlandGold', 'dog'), dog('dragon', 'dog'), dog('sapphire', 'dog')];
    const out = eligibleCandidates(award('best_puppy_dog'), dogs, index).map((d) => d.dogId).sort();
    expect(out).toEqual(['dragon', 'sapphire']);
  });

  it('Best Veteran draws only from the Veteran class, minus the beaten runner-up (C1)', () => {
    const index = buildPlacementIndex([
      cls('Veteran Dog', [['vet1', 1], ['vet2', 2]]),
      cls('Open Dog', [['open1', 1]]),
    ]);
    const dogs = [dog('vet1', 'dog'), dog('vet2', 'dog'), dog('open1', 'dog')];
    const out = eligibleCandidates(award('best_veteran_in_show'), dogs, index).map((d) => d.dogId);
    // open1 is unbeaten but not a veteran → excluded; vet2 was beaten by vet1 → excluded.
    expect(out).toEqual(['vet1']);
  });

  it('Best Veteran fills from a breed-qualified Veteran class across groups (C1 all-groups scan)', () => {
    // The page flattens every breed group's classes with breed-qualified keys; the
    // Veteran dog from a non-first group must reach the pool and not be conflated
    // with an identically-named class in another group.
    const index = buildPlacementIndex([
      { key: 'Any Breed:::Open', className: 'Open', results: [{ dogId: 'openWin', placement: 1 }] },
      { key: 'German Shepherd Dog:::Veteran', className: 'Veteran', results: [{ dogId: 'gsdVet', placement: 1 }] },
    ]);
    const dogs = [dog('openWin', 'dog'), dog('gsdVet', 'dog')];
    const out = eligibleCandidates(award('best_veteran_in_show'), dogs, index).map((d) => d.dogId);
    expect(out).toEqual(['gsdVet']);
  });

  it('Best Puppy in Show spans both sexes but only puppies, minus beaten', () => {
    const index = buildPlacementIndex([
      cls('Minor Puppy Dog', [['pupDog', 1]]),
      cls('Minor Puppy Bitch', [['pupBitch', 1]]),
      cls('Open Dog', [['adult', 1]]),
    ]);
    const dogs = [dog('pupDog', 'dog'), dog('pupBitch', 'bitch'), dog('adult', 'dog')];
    const out = eligibleCandidates(award('best_puppy_in_show'), dogs, index).map((d) => d.dogId).sort();
    expect(out).toEqual(['pupBitch', 'pupDog']);
  });
});

// South Western GSD club's real stored bestAwards list (2026-07-27 audit): 13
// names, 3 of which had NO recordable type at all until this fix — they
// printed in the catalogue/judges' book but could never appear in results.
describe("resolveTopAwards — South Western's real 13-award list", () => {
  const southWestern = [
    'Best in Show',
    'Reserve Best in Show',
    'Dog Challenge Certificate',
    'Reserve Dog Challenge Certificate',
    'Bitch Challenge Certificate',
    'Reserve Bitch Challenge Certificate',
    'Best Long Coat Adult',
    'Best Puppy in Show',
    'Best Puppy Dog',
    'Best Puppy Bitch',
    'Best Long Coat Puppy',
    'Best Baby Puppy',
    'Best Veteran',
  ];

  it('resolves all 13 configured names to recordable types, in her exact order, none dropped', () => {
    const resolved = resolveTopAwards('championship', southWestern);
    expect(resolved.map((a) => a.name)).toEqual(southWestern);
    expect(resolved.map((a) => a.type)).toEqual([
      'best_in_show',
      'reserve_best_in_show',
      'dog_cc',
      'reserve_dog_cc',
      'bitch_cc',
      'reserve_bitch_cc',
      'best_long_coat_adult',
      'best_puppy_in_show',
      'best_puppy_dog',
      'best_puppy_bitch',
      'best_long_coat_puppy',
      'best_baby_puppy',
      'best_veteran_in_show',
    ]);
  });

  it('aliases the SV short-form "most promising dog/bitch" to the existing WUSV types', () => {
    expect(awardNameToType('most promising dog')).toBe('most_promising_young_dog');
    expect(awardNameToType('Most Promising Bitch')).toBe('most_promising_young_bitch');
  });
});

describe('eligibleCandidates — baby puppy is its own disjoint band', () => {
  it('a Baby Puppy class winner is eligible for Best Baby Puppy but NOT Best Puppy in Show', () => {
    const index = buildPlacementIndex([
      cls('Baby Puppy Dog', [['babyWin', 1]]),
      cls('Minor Puppy Dog', [['minorWin', 1]]),
    ]);
    const dogs = [dog('babyWin', 'dog'), dog('minorWin', 'dog')];

    const babyOut = eligibleCandidates(award('best_baby_puppy'), dogs, index).map((d) => d.dogId);
    expect(babyOut).toEqual(['babyWin']);

    const puppyOut = eligibleCandidates(award('best_puppy_in_show'), dogs, index).map((d) => d.dogId);
    expect(puppyOut).toEqual(['minorWin']); // baby puppy winner is NOT in the puppy band
  });

  it('a Minor Puppy winner is eligible for Best Puppy in Show but NOT Best Baby Puppy', () => {
    const index = buildPlacementIndex([cls('Minor Puppy Dog', [['minorWin', 1]])]);
    const dogs = [dog('minorWin', 'dog')];
    expect(eligibleCandidates(award('best_baby_puppy'), dogs, index)).toEqual([]);
    expect(eligibleCandidates(award('best_puppy_in_show'), dogs, index).map((d) => d.dogId)).toEqual(['minorWin']);
  });
});
