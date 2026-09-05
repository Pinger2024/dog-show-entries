import { describe, it, expect } from 'vitest';
import { normaliseJudgeName } from '../catalogue-front-matter';

// Mandy's RKC catalogue review (2026-07-20, commits 07b580c/b761adb): the
// main breed judge was listed a SECOND time under "Other Judges" in the List
// of Judges section. The breed table stores the plain name ("Hugh De
// Zutter") while the judge display list can carry an approval suffix ("Hugh
// De Zutter (subject to RKC approval)") — an exact-string de-dupe match
// missed that. normaliseJudgeName is the fix: strip a trailing parenthetical
// suffix, trim whitespace, lowercase — then compare.

describe('normaliseJudgeName', () => {
  it('strips a trailing "(subject to RKC approval)" suffix', () => {
    expect(normaliseJudgeName('Hugh De Zutter (subject to RKC approval)')).toBe(
      'hugh de zutter',
    );
  });

  it('leaves a plain name unchanged (aside from lowercasing)', () => {
    expect(normaliseJudgeName('Hugh De Zutter')).toBe('hugh de zutter');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normaliseJudgeName('  Amanda McAteer  ')).toBe('amanda mcateer');
  });

  it('is case-insensitive', () => {
    expect(normaliseJudgeName('AMANDA MCATEER')).toBe('amanda mcateer');
    expect(normaliseJudgeName('amanda mcateer')).toBe('amanda mcateer');
  });

  it('strips any parenthetical suffix, not just the RKC-approval one', () => {
    expect(normaliseJudgeName('Ms K Salamon (Special Awards)')).toBe('ms k salamon');
  });

  it('only strips a TRAILING parenthetical — one mid-name is left alone', () => {
    // Documents current behaviour: the regex is anchored to the end of the
    // string ($), so a parenthetical that isn't the final token survives.
    expect(normaliseJudgeName('Hugh (Hank) De Zutter')).toBe('hugh (hank) de zutter');
  });

  it('a name with no parenthetical is unaffected beyond trim+lowercase', () => {
    expect(normaliseJudgeName('John Smith')).toBe('john smith');
  });
});

describe('judge de-dupe using normaliseJudgeName (List of Judges — Other Judges section)', () => {
  // Mirrors the real de-dupe check in JudgesListContent:
  //   breedKeyedJudgeNames.has(normaliseJudgeName(otherJudgeName))
  function isDuplicateOfBreedJudge(breedJudgeNames: string[], otherJudgeName: string): boolean {
    const breedKeyedJudgeNames = new Set(breedJudgeNames.map(normaliseJudgeName));
    return breedKeyedJudgeNames.has(normaliseJudgeName(otherJudgeName));
  }

  it('same judge with an approval suffix collapses into the breed table entry', () => {
    expect(
      isDuplicateOfBreedJudge(['Hugh De Zutter'], 'Hugh De Zutter (subject to RKC approval)'),
    ).toBe(true);
  });

  it('same judge differing only by case collapses', () => {
    expect(isDuplicateOfBreedJudge(['Amanda McAteer'], 'AMANDA MCATEER')).toBe(true);
  });

  it('same judge with stray whitespace collapses', () => {
    expect(isDuplicateOfBreedJudge(['Amanda McAteer'], '  Amanda McAteer ')).toBe(true);
  });

  it('genuinely different judges do NOT collapse', () => {
    expect(isDuplicateOfBreedJudge(['Amanda McAteer'], 'Mandy McAteer')).toBe(false);
    expect(isDuplicateOfBreedJudge(['Amanda McAteer'], 'John Smith')).toBe(false);
  });

  it('a different judge who merely shares a surname does NOT collapse', () => {
    expect(isDuplicateOfBreedJudge(['Hugh De Zutter'], 'Anna De Zutter')).toBe(false);
  });

  it('judge appears once across multiple breeds still de-dupes against every breed-table form', () => {
    // Two breed judges (e.g. GSD + Working Group) with the SAME underlying
    // judge listed slightly differently in each breed row.
    const breedJudges = ['Hugh De Zutter', 'hugh de zutter '];
    expect(isDuplicateOfBreedJudge(breedJudges, 'Hugh De Zutter (subject to RKC approval)')).toBe(
      true,
    );
  });

  it('KNOWN GAP: a leading title (Mr/Mrs/Ms) is NOT stripped, so it does not collapse', () => {
    // normaliseJudgeName only strips a trailing parenthetical + trims +
    // lowercases — it does not remove leading titles. "Mr John Smith" and
    // "John Smith" are therefore treated as different judges today.
    expect(isDuplicateOfBreedJudge(['John Smith'], 'Mr John Smith')).toBe(false);
  });
});
