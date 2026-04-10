import { describe, it, expect } from 'vitest';
import {
  KC_PLACEMENTS,
  SPECIAL_AWARDS,
  getPlacementLabel,
  getPlacementShortLabel,
  isCcType,
  isRccType,
  CC_ACHIEVEMENT_TYPES,
  RCC_ACHIEVEMENT_TYPES,
} from '@/lib/placements';

describe('KC_PLACEMENTS', () => {
  it('has 7 placements in order', () => {
    expect(KC_PLACEMENTS).toHaveLength(7);
    expect(KC_PLACEMENTS[0].value).toBe(1);
    expect(KC_PLACEMENTS[6].value).toBe(7);
  });

  it('has expected labels for standard RKC placements', () => {
    expect(KC_PLACEMENTS[0].label).toBe('1st');
    expect(KC_PLACEMENTS[1].label).toBe('2nd');
    expect(KC_PLACEMENTS[2].label).toBe('3rd');
    expect(KC_PLACEMENTS[3].label).toBe('Reserve');
    expect(KC_PLACEMENTS[4].label).toBe('VHC');
    expect(KC_PLACEMENTS[5].label).toBe('HC');
    expect(KC_PLACEMENTS[6].label).toBe('Commended');
  });
});

describe('SPECIAL_AWARDS', () => {
  it('includes Best in Show', () => {
    expect(SPECIAL_AWARDS).toContain('Best in Show');
  });

  it('includes Best of Breed', () => {
    expect(SPECIAL_AWARDS).toContain('Best of Breed');
  });
});

describe('getPlacementLabel', () => {
  it('returns correct label for known placements', () => {
    expect(getPlacementLabel(1)).toBe('1st');
    expect(getPlacementLabel(2)).toBe('2nd');
    expect(getPlacementLabel(3)).toBe('3rd');
    expect(getPlacementLabel(4)).toBe('Reserve');
    expect(getPlacementLabel(5)).toBe('VHC');
    expect(getPlacementLabel(6)).toBe('HC');
    expect(getPlacementLabel(7)).toBe('Commended');
  });

  it('returns fallback for unknown placement', () => {
    expect(getPlacementLabel(8)).toBe('8th');
    expect(getPlacementLabel(10)).toBe('10th');
  });
});

describe('getPlacementShortLabel', () => {
  it('returns short labels', () => {
    expect(getPlacementShortLabel(1)).toBe('1st');
    expect(getPlacementShortLabel(4)).toBe('Res');
    expect(getPlacementShortLabel(6)).toBe('HC');
    expect(getPlacementShortLabel(7)).toBe('C');
  });

  it('returns fallback for unknown placement', () => {
    expect(getPlacementShortLabel(9)).toBe('9th');
  });
});

describe('isCcType / CC_ACHIEVEMENT_TYPES', () => {
  // Regression: Hundark Christmas Spirit had 2 `bitch_cc` achievements but
  // the title progress query only filtered for `a.type === 'cc'`, so the
  // CC count showed 0. This caused an inconsistent count vs the awards table
  // on the dog profile. See dogs.ts:874 and dashboard.ts ccProgress.
  it('includes all three CC variants', () => {
    expect(CC_ACHIEVEMENT_TYPES).toEqual(['cc', 'dog_cc', 'bitch_cc']);
  });

  it('recognises sex-specific CCs (the RKC championship-show reality)', () => {
    expect(isCcType('cc')).toBe(true);
    expect(isCcType('dog_cc')).toBe(true);
    expect(isCcType('bitch_cc')).toBe(true);
  });

  it('does not match unrelated types', () => {
    expect(isCcType('best_of_breed')).toBe(false);
    expect(isCcType('best_in_show')).toBe(false);
    expect(isCcType('reserve_cc')).toBe(false);
    expect(isCcType('reserve_bitch_cc')).toBe(false);
    expect(isCcType('')).toBe(false);
    expect(isCcType('CC')).toBe(false); // case sensitive on purpose
  });
});

describe('isRccType / RCC_ACHIEVEMENT_TYPES', () => {
  it('includes all three RCC variants', () => {
    expect(RCC_ACHIEVEMENT_TYPES).toEqual([
      'reserve_cc',
      'reserve_dog_cc',
      'reserve_bitch_cc',
    ]);
  });

  it('recognises sex-specific reserve CCs', () => {
    expect(isRccType('reserve_cc')).toBe(true);
    expect(isRccType('reserve_dog_cc')).toBe(true);
    expect(isRccType('reserve_bitch_cc')).toBe(true);
  });

  it('does not conflate RCCs with CCs', () => {
    expect(isRccType('cc')).toBe(false);
    expect(isRccType('dog_cc')).toBe(false);
    expect(isRccType('bitch_cc')).toBe(false);
  });
});
