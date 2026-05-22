import { describe, it, expect } from 'vitest';
import {
  toPhoneBookName,
  surnameOf,
  ownerHeading,
  smartOwnerTitleCase,
} from '../catalogue-utils';

// Locked with Amanda 2026-05-14: the exhibitor index at the back of
// every catalogue sorts by surname and displays each name in phone-book
// format ("McAteer, Amanda"). Joint owners sort by the FIRST owner's
// surname.

describe('toPhoneBookName', () => {
  it('flips "Amanda McAteer" to "McAteer, Amanda"', () => {
    expect(toPhoneBookName('Amanda McAteer')).toBe('McAteer, Amanda');
  });
  it('handles middle names', () => {
    expect(toPhoneBookName('John William Smith')).toBe('Smith, John William');
  });
  it('handles titles', () => {
    expect(toPhoneBookName('Mrs A Smith')).toBe('Smith, Mrs A');
  });
  it('leaves single-word names untouched', () => {
    expect(toPhoneBookName('Cher')).toBe('Cher');
  });
  it('trims whitespace', () => {
    expect(toPhoneBookName('  Ann Swift  ')).toBe('Swift, Ann');
  });
  it('returns empty for empty input', () => {
    expect(toPhoneBookName('')).toBe('');
  });
});

describe('surnameOf', () => {
  it('returns lowercased last word', () => {
    expect(surnameOf('Amanda McAteer')).toBe('mcateer');
  });
  it('handles trailing whitespace', () => {
    expect(surnameOf('Ann Swift  ')).toBe('swift');
  });
});

describe('ownerHeading — single owner', () => {
  it('formats as phone-book title case (Amanda 2026-05-22)', () => {
    const result = ownerHeading([{ name: 'Amanda McAteer', address: null }], null);
    expect(result).toEqual({ heading: 'McAteer, Amanda', sortKey: 'mcateer' });
  });

  it('normalises raw all-lower input to title case', () => {
    const result = ownerHeading([{ name: 'alan william hall', address: null }], null);
    expect(result.heading).toBe('Hall, Alan William');
  });

  it('normalises raw all-upper input to title case', () => {
    const result = ownerHeading([{ name: 'MALCOLM READMAN', address: null }], null);
    expect(result.heading).toBe('Readman, Malcolm');
  });

  it('falls back to exhibitor when owners array empty', () => {
    const result = ownerHeading([], 'Denise Hensley');
    expect(result).toEqual({ heading: 'Hensley, Denise', sortKey: 'hensley' });
  });

  it('returns Unknown when both empty', () => {
    const result = ownerHeading([], null);
    expect(result.heading).toBe('Unknown');
    expect(result.sortKey).toBe('unknown');
  });
});

describe('ownerHeading — joint owners (Amanda fixture)', () => {
  it('Andy Johnstone + Mandy McAteer → sorts under Johnstone, both flipped', () => {
    const result = ownerHeading(
      [
        { name: 'Andy Johnstone', address: null },
        { name: 'Mandy McAteer', address: null },
      ],
      null,
    );
    expect(result).toEqual({
      heading: 'Johnstone, Andy & McAteer, Mandy',
      sortKey: 'johnstone',
    });
  });

  it('uses FIRST owner surname even when later names sort earlier', () => {
    const result = ownerHeading(
      [
        { name: 'Zoe Young', address: null },
        { name: 'Amanda Adams', address: null },
      ],
      null,
    );
    expect(result.sortKey).toBe('young');
  });
});

describe('smartOwnerTitleCase', () => {
  it('all-lowercase → title case', () => {
    expect(smartOwnerTitleCase('alan william hall')).toBe('Alan William Hall');
  });
  it('all-uppercase → title case', () => {
    expect(smartOwnerTitleCase('MALCOLM READMAN')).toBe('Malcolm Readman');
  });
  it('preserves mixed case (McAteer family)', () => {
    expect(smartOwnerTitleCase('Mandy McAteer')).toBe('Mandy McAteer');
    expect(smartOwnerTitleCase('Liam O\'Brien')).toBe("Liam O'Brien");
  });
  it("title-cases all-lower O'Brien", () => {
    expect(smartOwnerTitleCase("liam o'brien")).toBe("Liam O'Brien");
  });
  it('title-cases hyphenated surnames', () => {
    expect(smartOwnerTitleCase('smith-jones')).toBe('Smith-Jones');
  });
  it('preserves single-letter initials', () => {
    expect(smartOwnerTitleCase('A Swift & N Dodds')).toBe('A Swift & N Dodds');
  });
  it('handles trailing whitespace', () => {
    expect(smartOwnerTitleCase('Pauline Adam ')).toBe('Pauline Adam');
  });
  it('returns empty for empty input', () => {
    expect(smartOwnerTitleCase('')).toBe('');
    expect(smartOwnerTitleCase(null)).toBe('');
  });
  it('mixed case in one word, all-upper in next', () => {
    expect(smartOwnerTitleCase('Maxine COWAN')).toBe('Maxine Cowan');
  });
});
