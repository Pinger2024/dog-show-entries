import { describe, it, expect } from 'vitest';
import { toPhoneBookName, surnameOf, ownerHeading } from '../catalogue-utils';

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
  it('formats as phone-book uppercase', () => {
    const result = ownerHeading([{ name: 'Amanda McAteer', address: null }], null);
    expect(result).toEqual({ heading: 'MCATEER, AMANDA', sortKey: 'mcateer' });
  });

  it('falls back to exhibitor when owners array empty', () => {
    const result = ownerHeading([], 'Denise Hensley');
    expect(result).toEqual({ heading: 'HENSLEY, DENISE', sortKey: 'hensley' });
  });

  it('returns UNKNOWN when both empty', () => {
    const result = ownerHeading([], null);
    expect(result.heading).toBe('UNKNOWN');
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
      heading: 'JOHNSTONE, ANDY & MCATEER, MANDY',
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
