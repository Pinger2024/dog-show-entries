import { describe, it, expect } from 'vitest';
import {
  svCoatDisplayName,
  svCoatCode,
  formatSvClassName,
  classNameAbbreviation,
  specialAwardClassFee,
  isUnnumberedClassDef,
} from '../class-labels';

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

/**
 * ONE owner for "which classes charge their own flat fee instead of the
 * first/subsequent tier" (co-founder ruling 2026-07-19). The bug this guards:
 * `classDefinition.type === 'special'` is a broader bucket than Special
 * Award Classes — production has nine other `type: 'special'` definitions
 * (Special Beginners, Any Variety Not Separately Classified, …) that are
 * ORDINARY classes for pricing. Only a real Special Award Class (type
 * 'special' AND name starting "Special Award Class") should return its own
 * fee; every other 'special'-typed class must return null (priced on the
 * normal tier).
 */
describe('specialAwardClassFee', () => {
  it('returns the class own fee for a real Special Award Class', () => {
    expect(
      specialAwardClassFee({
        classDefinition: { type: 'special', name: 'Special Award Class - Post Graduate' },
        entryFee: 300,
      }),
    ).toBe(300);
  });

  it('returns null for an ordinary class of type "special" (e.g. Special Beginners)', () => {
    expect(
      specialAwardClassFee({
        classDefinition: { type: 'special', name: 'Special Beginners' },
        entryFee: 500,
      }),
    ).toBeNull();
  });

  it('returns null for other non-Special-Award "special"-typed definitions', () => {
    for (const name of [
      'Any Variety Not Separately Classified',
      'Variety Class',
      'Good Citizen Dog Scheme',
      'Rare Breeds',
    ]) {
      expect(
        specialAwardClassFee({ classDefinition: { type: 'special', name }, entryFee: 400 }),
      ).toBeNull();
    }
  });

  it('returns null for a regular (non-special) class', () => {
    expect(
      specialAwardClassFee({
        classDefinition: { type: 'breed', name: 'Post Graduate Dog' },
        entryFee: 2000,
      }),
    ).toBeNull();
  });

  it('works from the flat classType/className fallback fields too', () => {
    expect(
      specialAwardClassFee({
        classType: 'special',
        className: 'Special Award Class - Junior',
        entryFee: 300,
      }),
    ).toBe(300);
  });
});

/**
 * ONE owner (bug-hunt #5, CLAUDE.md "One owner per rule") for "which class
 * definitions carry no printed classNumber" — Junior Handler and Special
 * Award Classes both sit outside the RKC-licensed count. Every numbering
 * path (secretary.ts, shows.create) calls this instead of re-testing
 * `type === 'junior_handler'` / the `'Special Award Class'` name prefix.
 */
describe('isUnnumberedClassDef', () => {
  it('is true for a Junior Handler class definition', () => {
    expect(isUnnumberedClassDef({ type: 'junior_handler', name: 'Junior Handling' })).toBe(true);
  });

  it('is true for a Special Award Class definition', () => {
    expect(isUnnumberedClassDef({ type: 'special', name: 'Special Award Class 1' })).toBe(true);
  });

  it('is false for an ordinary breed class definition', () => {
    expect(isUnnumberedClassDef({ type: 'age', name: 'Puppy Dog' })).toBe(false);
  });

  it('is false for other type: special definitions that are not Special Award Classes', () => {
    // type: 'special' is a broader bucket — Special Beginners, AVNSC, Variety
    // Class, GCDS, Rare Breeds, … are ordinary numbered classes.
    expect(isUnnumberedClassDef({ type: 'special', name: 'Special Beginners' })).toBe(false);
  });

  it('is false for null/undefined class definitions', () => {
    expect(isUnnumberedClassDef(null)).toBe(false);
    expect(isUnnumberedClassDef(undefined)).toBe(false);
  });
});

// The League's SV results sheet writes the coat as a two-letter code inside
// the Class column — "Adult LCB", "Working SCD" (Shirley, GSDL BRG, 24 Sept 2026).
describe('svCoatCode', () => {
  it('abbreviates Long Coat to LC and Short (stock) Coat to SC', () => {
    expect(svCoatCode('long_stock')).toBe('LC');
    expect(svCoatCode('stock')).toBe('SC');
  });

  it('is empty when the class has no coat', () => {
    expect(svCoatCode(null)).toBe('');
    expect(svCoatCode(undefined)).toBe('');
  });
});
