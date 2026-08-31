import { describe, it, expect } from 'vitest';
import { svCoatDisplayName, formatSvClassName, classNameAbbreviation } from '../class-labels';

/**
 * Regional coat-type WORDING (regional groups' decision 2026-08-11, via
 * Amanda): "Long Coat" / "Short Coat" everywhere a coat type is shown on a
 * show class — replacing the old "Stock Coat" / "Long Stock Coat" wording.
 * `svCoatDisplayName` is the single source every call site should go
 * through instead of its own stock/long_stock → string mapping.
 */
describe('svCoatDisplayName', () => {
  it('returns "Short Coat" for stock', () => {
    expect(svCoatDisplayName('stock')).toBe('Short Coat');
  });

  it('returns "Long Coat" for long_stock', () => {
    expect(svCoatDisplayName('long_stock')).toBe('Long Coat');
  });

  it('returns null for null/undefined (no coat split on this class)', () => {
    expect(svCoatDisplayName(null)).toBeNull();
    expect(svCoatDisplayName(undefined)).toBeNull();
  });
});

describe('formatSvClassName', () => {
  it('appends " — Long Coat" for long_stock', () => {
    expect(formatSvClassName('SV Junior', 'long_stock')).toBe('Junior — Long Coat');
  });

  it('appends " — Short Coat" for stock', () => {
    expect(formatSvClassName('SV Junior', 'stock')).toBe('Junior — Short Coat');
  });

  it('leaves the name bare when there is no coat split', () => {
    expect(formatSvClassName('SV Junior', null)).toBe('Junior');
    expect(formatSvClassName('Working', null)).toBe('Working');
  });

  it('strips the "SV " prefix and falls back to "Unknown Class" for a missing name', () => {
    expect(formatSvClassName(null, null)).toBe('Unknown Class');
  });
});

/**
 * Challenge Register abbreviations (steward catalogue's final page, Mandy
 * 2026-08-31) — first letter of each word in the class name, plus D/B for
 * the sex, with a trailing " Dog"/" Bitch" word stripped first so it's
 * never counted twice.
 */
describe('classNameAbbreviation', () => {
  it('abbreviates a two-word class name', () => {
    expect(classNameAbbreviation('Minor Puppy', 'dog')).toBe('MPD');
  });

  it('abbreviates a one-word class name', () => {
    expect(classNameAbbreviation('Puppy', 'bitch')).toBe('PB');
    expect(classNameAbbreviation('Open', 'bitch')).toBe('OB');
  });

  it('abbreviates a three-word class name', () => {
    expect(classNameAbbreviation('Post Graduate', 'dog')).toBe('PGD');
    expect(classNameAbbreviation('Special Beginners', 'dog')).toBe('SBD');
  });

  it('strips a trailing " Dog"/" Bitch" word rather than doubling the letter', () => {
    expect(classNameAbbreviation('Veteran Dog', 'dog')).toBe('VD');
    expect(classNameAbbreviation('Veteran Bitch', 'bitch')).toBe('VB');
  });

  it('is a total function — a missing name never throws', () => {
    expect(classNameAbbreviation(null, 'dog')).toBe('');
    expect(classNameAbbreviation(undefined, 'dog')).toBe('');
    expect(classNameAbbreviation('', 'dog')).toBe('');
  });

  it('skips tokens that do not start with a letter rather than throwing', () => {
    expect(classNameAbbreviation('1st Special', 'dog')).toBe('SD');
  });

  it('is case-insensitive when matching the trailing sex word', () => {
    expect(classNameAbbreviation('Veteran dog', 'dog')).toBe('VD');
  });
});
