import { describe, it, expect } from 'vitest';
import {
  toPhoneBookName,
  surnameOf,
  ownerHeading,
  smartOwnerTitleCase,
  formatRkcOwnerHeading,
  formatOwnerKC,
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

describe('ownerHeading — RKC compound format (Amanda 2026-05-22)', () => {
  it('single owner with title', () => {
    const result = ownerHeading(
      [{ title: 'Mrs', name: 'Amanda McAteer', address: null }],
      null,
    );
    expect(result).toEqual({ heading: 'MCATEER, MRS A', sortKey: 'mcateer' });
  });

  it('single owner without title falls back to bare initial', () => {
    const result = ownerHeading([{ name: 'Amanda McAteer', address: null }], null);
    expect(result.heading).toBe('MCATEER, A');
  });

  it('joint owners — surnames combined alphabetically, titles in same order', () => {
    const result = ownerHeading(
      [
        { title: 'Ms', name: 'Ann Swift', address: null },
        { title: 'Mr', name: 'Neil Dodds', address: null },
      ],
      null,
    );
    expect(result.heading).toBe('DODDS & SWIFT, MR N & MS A');
  });

  it('joint owners — works with three owners', () => {
    const result = ownerHeading(
      [
        { title: 'Mr', name: 'John McGough', address: null },
        { title: 'Ms', name: 'Rachel Craik', address: null },
        { title: 'Mr', name: 'Liam Henderson', address: null },
      ],
      null,
    );
    expect(result.heading).toBe('CRAIK & HENDERSON & MCGOUGH, MS R & MR L & MR J');
  });

  it('mixes present + missing titles', () => {
    const result = ownerHeading(
      [
        { title: 'Miss', name: 'Amber Kemble', address: null },
        { name: 'Ben Pascoe', address: null },
      ],
      null,
    );
    expect(result.heading).toBe('KEMBLE & PASCOE, MISS A & B');
  });

  it('sortKey is the alphabetically-first surname', () => {
    const result = ownerHeading(
      [
        { name: 'Zoe Young', address: null },
        { name: 'Amanda Adams', address: null },
      ],
      null,
    );
    expect(result.sortKey).toBe('adams');
  });

  it('falls back to exhibitor when owners empty', () => {
    const result = ownerHeading([], 'Denise Hensley');
    expect(result).toEqual({ heading: 'HENSLEY, D', sortKey: 'hensley' });
  });

  it('returns UNKNOWN when both empty', () => {
    const result = ownerHeading([], null);
    expect(result.heading).toBe('UNKNOWN');
    expect(result.sortKey).toBe('unknown');
  });
});

describe('formatRkcOwnerHeading — direct unit tests', () => {
  it('Amanda fixture: Dodds & Swift', () => {
    expect(
      formatRkcOwnerHeading([
        { title: 'Mr', name: 'N Dodds' },
        { title: 'Ms', name: 'A Swift' },
      ]),
    ).toBe('DODDS & SWIFT, MR N & MS A');
  });

  it('Amanda fixture: Kemble & Pascoe', () => {
    expect(
      formatRkcOwnerHeading([
        { title: 'Miss', name: 'Amber Kemble' },
        { title: 'Mr', name: 'Ben Pascoe' },
      ]),
    ).toBe('KEMBLE & PASCOE, MISS A & MR B');
  });

  it('Amanda fixture: Landgren & Towning (both Miss)', () => {
    expect(
      formatRkcOwnerHeading([
        { title: 'Miss', name: 'R Landgren' },
        { title: 'Miss', name: 'L Towning' },
      ]),
    ).toBe('LANDGREN & TOWNING, MISS R & MISS L');
  });

  it('empty array → UNKNOWN', () => {
    expect(formatRkcOwnerHeading([])).toBe('UNKNOWN');
  });

  it('single owner, no title', () => {
    expect(formatRkcOwnerHeading([{ title: null, name: 'Cher' }])).toBe('CHER, C');
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

// Mandy 2026-07-22: the trailing "Exh." exhibitor marker is binned —
// owner lines are name + address (or "address withheld"), nothing else.
describe('formatOwnerKC (no Exh. marker)', () => {
  const owner = { title: 'Mrs', name: 'Amanda McAteer', address: '1 Kennel Lane, ML10 6SY', userId: 'u1' };

  it('renders name + address with no trailing marker', () => {
    const out = formatOwnerKC([owner]);
    expect(out).toContain('1 Kennel Lane, ML10 6SY');
    expect(out).not.toContain('Exh');
  });

  it('renders "address withheld" when withheld, still no marker', () => {
    const out = formatOwnerKC([owner], true);
    expect(out).toContain('address withheld');
    expect(out).not.toContain('1 Kennel Lane');
    expect(out).not.toContain('Exh');
  });
});
