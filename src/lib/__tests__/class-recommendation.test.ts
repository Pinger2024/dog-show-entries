import { describe, it, expect } from 'vitest';
import {
  pickRecommendedAgeClass,
  isLongCoatClass,
  type AgeClassOption,
} from '../class-recommendation';

/**
 * Mandy 2026-07-12 (spotted on the demo): the class recommendation grabbed the
 * first age-eligible class in DB order, so an 8-month-old got "Puppy" not
 * "Minor Puppy", and a dog got "Special Long Coat Yearling" recommended when
 * its coat wasn't known to be long. Both are locked down here.
 */

const MINOR_PUPPY: AgeClassOption = { name: 'Minor Puppy', minMonths: 6, maxMonths: 9 };
const PUPPY: AgeClassOption = { name: 'Puppy', minMonths: 6, maxMonths: 12 };
const JUNIOR: AgeClassOption = { name: 'Junior', minMonths: 6, maxMonths: 18 };
const YEARLING: AgeClassOption = { name: 'Yearling', minMonths: 12, maxMonths: 24 };
const LC_YEARLING: AgeClassOption = { name: 'Special Long Coat Yearling', minMonths: 12, maxMonths: 24 };
const LC_PUPPY: AgeClassOption = { name: 'Special Long Coat Puppy', minMonths: 6, maxMonths: 12 };
const ADULT: AgeClassOption = { name: 'Adult', minMonths: 18, maxMonths: null };

describe('pickRecommendedAgeClass', () => {
  it('picks the tightest age band — an 8mo dog gets Minor Puppy, not Puppy', () => {
    expect(pickRecommendedAgeClass([MINOR_PUPPY, PUPPY, JUNIOR])?.name).toBe('Minor Puppy');
  });

  it('is independent of the order the classes arrive in (DB order is arbitrary)', () => {
    expect(pickRecommendedAgeClass([JUNIOR, PUPPY, MINOR_PUPPY])?.name).toBe('Minor Puppy');
    expect(pickRecommendedAgeClass([PUPPY, JUNIOR, MINOR_PUPPY])?.name).toBe('Minor Puppy');
  });

  it('does NOT recommend a Long Coat class when the dog coat is unknown', () => {
    expect(pickRecommendedAgeClass([YEARLING, LC_YEARLING])?.name).toBe('Yearling');
    expect(pickRecommendedAgeClass([YEARLING, LC_YEARLING], null)?.name).toBe('Yearling');
  });

  it('does NOT recommend a Long Coat class for a stock-coat dog', () => {
    expect(pickRecommendedAgeClass([YEARLING, LC_YEARLING], 'stock')?.name).toBe('Yearling');
  });

  it('DOES steer a known long-coat dog to the Long Coat class', () => {
    expect(pickRecommendedAgeClass([YEARLING, LC_YEARLING], 'long_stock')?.name).toBe('Special Long Coat Yearling');
  });

  it('a long-coat dog gets the most specific Long Coat band available', () => {
    // Only a wider Long Coat band exists → coat match beats age-specificity.
    expect(pickRecommendedAgeClass([MINOR_PUPPY, LC_PUPPY], 'long_stock')?.name).toBe('Special Long Coat Puppy');
  });

  it('falls back to a Long Coat class when it is the only option for a stock dog', () => {
    expect(pickRecommendedAgeClass([LC_YEARLING], 'stock')?.name).toBe('Special Long Coat Yearling');
  });

  it('treats an open-ended (null max) band as the widest', () => {
    // Adult (18+, open) vs Junior (6–18): the same 18mo dog prefers the bounded band.
    expect(pickRecommendedAgeClass([ADULT, JUNIOR])?.name).toBe('Junior');
  });

  it('returns null when nothing is eligible', () => {
    expect(pickRecommendedAgeClass([])).toBeNull();
  });
});

describe('isLongCoatClass', () => {
  it('matches the RKC "Special Long Coat" naming, case/space-insensitively', () => {
    expect(isLongCoatClass('Special Long Coat Yearling Dog')).toBe(true);
    expect(isLongCoatClass('Long Coat Puppy')).toBe(true);
    expect(isLongCoatClass('longcoat junior')).toBe(true);
    expect(isLongCoatClass('Yearling Dog')).toBe(false);
    expect(isLongCoatClass('Minor Puppy')).toBe(false);
  });
});
