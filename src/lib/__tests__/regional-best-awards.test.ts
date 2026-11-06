import { describe, it, expect } from 'vitest';
import {
  buildBestAwards,
  bestAwardsPickerOptions,
  canonicalAwardName,
  commitPendingAward,
  REGIONAL_BEST_AWARDS,
  REGIONAL_OPTIONAL_AWARDS,
} from '../best-awards';
import { awardNameToType } from '../top-awards';

/**
 * Mandy, 21 Sept 2026: on a WUSV regional show (`showRuleset: 'wusv'`), the
 * Sponsors page's Best Awards picker offered the RKC championship list
 * (Best of Breed, Challenge Certificates, …) and never offered the four
 * awards a regional actually gives. Root cause: `buildBestAwards` keyed its
 * defaults on `showType` alone, and a regional is `showType: 'championship'`
 * + `showRuleset: 'wusv'` — the same showType as an RKC championship show.
 */
describe('buildBestAwards — WUSV/SV regional defaults', () => {
  it('a regional (championship + wusv) with no custom list gets the four regional awards, in order', () => {
    expect(buildBestAwards('championship', [], 'wusv')).toEqual([
      'Best Dog',
      'Best Bitch',
      'Most Promising Dog',
      'Most Promising Bitch',
    ]);
  });

  it('never leaks the RKC championship defaults (Best of Breed, CCs) into a regional', () => {
    const out = buildBestAwards('championship', [], 'wusv');
    expect(out).not.toContain('Best of Breed');
    expect(out).not.toContain('Dog Challenge Certificate');
    expect(out).not.toContain('Bitch Challenge Certificate');
  });

  it('a regional with a configured list still wins verbatim — same rule as every other show', () => {
    const configured = ['Best Dog', 'Best Bitch', 'Most Promising Dog'];
    expect(buildBestAwards('championship', configured, 'wusv')).toEqual(configured);
  });

  it('an RKC championship show (showRuleset rkc, or omitted) is unaffected', () => {
    expect(buildBestAwards('championship', [], 'rkc')[0]).toBe('Best of Breed');
    expect(buildBestAwards('championship', [])[0]).toBe('Best of Breed');
  });
});

describe('bestAwardsPickerOptions — the picker\'s "usual vs more" split', () => {
  it('a regional show gets the regional usual list and the regional optional pool', () => {
    const { usual, more } = bestAwardsPickerOptions('championship', 'wusv');
    expect(usual).toEqual(REGIONAL_BEST_AWARDS);
    expect(more).toEqual(REGIONAL_OPTIONAL_AWARDS);
  });

  it('a regional "more" list never offers Challenge Certificates or Best of Breed/Show', () => {
    const { more } = bestAwardsPickerOptions('championship', 'wusv');
    expect(more.some((a) => /challenge certificate/i.test(a))).toBe(false);
    expect(more).not.toContain('Best of Breed');
    expect(more).not.toContain('Best in Show');
  });

  it('an RKC championship show is unaffected', () => {
    const { usual, more } = bestAwardsPickerOptions('championship', 'rkc');
    expect(usual[0]).toBe('Best of Breed');
    expect(more).not.toEqual(REGIONAL_OPTIONAL_AWARDS);
  });
});

describe('canonicalAwardName — SV label -> recordable Dog/Bitch name', () => {
  it.each([
    ['Best Male', 'Best Dog'],
    ['best female', 'Best Bitch'],
    ['Most Promising Male', 'Most Promising Dog'],
    ['  most promising female  ', 'Most Promising Bitch'],
  ])('%s -> %s', (input, expected) => {
    expect(canonicalAwardName(input)).toBe(expected);
  });

  it('leaves an unrecognised / bespoke name unchanged (just trimmed)', () => {
    expect(canonicalAwardName('  The Smith Family Memorial Trophy  ')).toBe(
      'The Smith Family Memorial Trophy',
    );
  });
});

describe('awardNameToType — SV synonyms', () => {
  it.each([
    ['Best Male', 'best_dog'],
    ['Best Female', 'best_bitch'],
    ['Most Promising Male', 'most_promising_young_dog'],
    ['Most Promising Female', 'most_promising_young_bitch'],
  ])('%s -> %s', (input, expectedType) => {
    expect(awardNameToType(input)).toBe(expectedType);
  });
});

describe('commitPendingAward — flushing the "Add your own trophy" box', () => {
  // Mandy, 21 Sept 2026: typed "Most Promising Dog" into the free-text box
  // and pressed "Save Awards" directly (never tapped "+ Add") — the text was
  // silently discarded and she hit "You need at least one award". The
  // picker now commits the pending name on blur (which fires before any
  // Save button's click), using this same pure function.
  it('adds a non-empty pending name to the list', () => {
    expect(commitPendingAward(['Best Dog'], 'Most Promising Dog')).toEqual([
      'Best Dog',
      'Most Promising Dog',
    ]);
  });

  it('canonicalises an SV label before adding it', () => {
    expect(commitPendingAward([], 'Best Male')).toEqual(['Best Dog']);
  });

  it('returns the SAME array reference when the pending name is blank', () => {
    const value = ['Best Dog'];
    expect(commitPendingAward(value, '   ')).toBe(value);
  });

  it('returns the SAME array reference when the name is already present (case/whitespace-insensitive)', () => {
    const value = ['Best Dog', 'Best Bitch'];
    expect(commitPendingAward(value, '  best dog  ')).toBe(value);
  });
});
