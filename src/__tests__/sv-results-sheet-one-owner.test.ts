import { describe, it, expect } from 'vitest';
import { scanFiles } from './helpers/static-scan';

/**
 * One owner per rule (CLAUDE.md) for the two rules the League's feedback on
 * the NE Regional results sheet added (25 Sept 2026):
 *
 *  - the two-letter coat code in the SV results sheet's Class column
 *    ("Adult LCB") is `svCoatCode` in lib/class-labels.ts, and the D/B sex
 *    letter is `sexLetter` beside it (it had been hand-written in four
 *    places — the Challenge Register, two catalogues and the ring board);
 *  - placing order (1st, 2nd…, unplaced last) is `comparePlacing` in
 *    lib/placements.ts — six places each wrote their own sort;
 *  - "this dog was placed but has no grade" is `isPlacedWithoutSvGrade` in
 *    lib/sv-grading.ts — the steward page, the secretary's warning and the
 *    results code all ask it, so they can never disagree about which dogs
 *    still need a grade.
 */
describe('SV results sheet rules have one owner', () => {
  it('only class-labels.ts spells out the LC / SC coat codes', () => {
    const hits = scanFiles(['src'], ['.ts', '.tsx'], /['"`](LC|SC)['"`]/).filter(
      (m) => m.file !== 'src/lib/class-labels.ts' && !m.file.includes('__tests__'),
    );
    expect(hits).toEqual([]);
  });

  it('only class-labels.ts turns a sex into D / B', () => {
    const hits = scanFiles(['src'], ['.ts', '.tsx'], /===\s*['"]dog['"]\s*\?\s*['"]D['"]|===\s*['"]bitch['"]\s*\?\s*['"]B['"]/).filter(
      (m) => m.file !== 'src/lib/class-labels.ts' && !m.file.includes('__tests__'),
    );
    expect(hits).toEqual([]);
  });

  it('only placements.ts decides placing order (comparePlacing)', () => {
    // e.g. `(a.placement ?? 99) - (b.placement ?? 99)` or `a.placement - b.placement`
    const handRolledSort = /placement\s*\?\?\s*\d+\)?\s*-|\.placement\s*-\s*\w+\.placement/;
    const hits = scanFiles(['src'], ['.ts', '.tsx'], handRolledSort).filter(
      (m) => m.file !== 'src/lib/placements.ts' && !m.file.includes('__tests__'),
    );
    expect(hits).toEqual([]);
  });

  it('nothing outside sv-grading.ts hand-rolls "placed but not graded"', () => {
    // e.g. `placement != null && !svGrade` or `!r.svGrade && r.placement != null`
    const placedThenNoGrade = /placement\s*!==?\s*null\s*&&\s*!\s*[\w.?]*svGrade\b/;
    const noGradeThenPlaced = /!\s*[\w.?]*svGrade\s*&&\s*[\w.?]*placement\s*!==?\s*null/;
    const hits = scanFiles(['src'], ['.ts', '.tsx'], placedThenNoGrade)
      .concat(scanFiles(['src'], ['.ts', '.tsx'], noGradeThenPlaced))
      .filter((m) => m.file !== 'src/lib/sv-grading.ts' && !m.file.includes('__tests__'));
    expect(hits).toEqual([]);
  });
});
