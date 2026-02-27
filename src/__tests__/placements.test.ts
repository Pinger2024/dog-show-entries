import { describe, it, expect } from 'vitest';
import {
  KC_PLACEMENTS,
  SPECIAL_AWARDS,
  getPlacementLabel,
  getPlacementShortLabel,
} from '@/lib/placements';

describe('KC_PLACEMENTS', () => {
  it('has 7 placements in order', () => {
    expect(KC_PLACEMENTS).toHaveLength(7);
    expect(KC_PLACEMENTS[0].value).toBe(1);
    expect(KC_PLACEMENTS[6].value).toBe(7);
  });

  it('has expected labels for standard KC placements', () => {
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
