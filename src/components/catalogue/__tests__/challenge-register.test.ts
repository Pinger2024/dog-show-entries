import { describe, it, expect } from 'vitest';
import { buildChallengeRegister, fitsOneRegisterPage } from '../catalogue-judging';
import type { ClassGroup } from '../catalogue-utils';
import type { ChallengeRegisterSection } from '../catalogue-judging';

// Mandy: the stewards' catalogue should end with a Challenge Register —
// every breed class in judging order with its abbreviation, and a write-in
// box for the 1st-place winner's catalogue number, so the steward can line
// the unbeaten class winners up in class order for the challenge. Dogs then
// Bitches; Special Award Classes and Junior Handling don't compete in the
// breed challenge and must never appear here.

const cls = (over: Partial<ClassGroup> & Pick<ClassGroup, 'className'>): ClassGroup => ({
  classNumber: null,
  classLabel: undefined,
  sex: null,
  sortOrder: 0,
  entries: [],
  ...over,
});

const dog = { catalogueNumber: '1' } as unknown as ClassGroup['entries'][number];

// Mirrors the real South Western show shape used in special-award-classes.test.ts
// (mcp__render__query_render_postgres against prod, show
// dbefb92e-48a5-4800-9fe8-d34da550de7a): 11 numbered Dog breed classes,
// 11 numbered Bitch breed classes, 2 numbered Junior Handling classes
// (sex=null), then 3 unnumbered Special Award Classes (sex=null).
const AGE_NAMES = [
  'Baby Puppy', 'Minor Puppy', 'Puppy', 'Junior', 'Yearling',
  'Special Long Coat Yearling', 'Post Graduate', 'Limit', 'Open',
  'Special Long Coat Open', 'Veteran',
];

function southWesternShape(): ClassGroup[] {
  const classes: ClassGroup[] = [];
  let n = 1;
  for (const sex of ['dog', 'bitch'] as const) {
    for (const name of AGE_NAMES) {
      classes.push(cls({ className: name, sex, classNumber: n, sortOrder: n - 1, entries: [dog] }));
      n++;
    }
  }
  classes.push(cls({ className: 'JHA Handling (6-11)', classLabel: 'JHA', sex: null, classNumber: n, sortOrder: n - 1, classDefinitionType: 'junior_handler', entries: [dog] }));
  n++;
  classes.push(cls({ className: 'JHA Handling (12-16)', classLabel: 'JHB', sex: null, classNumber: n, sortOrder: n - 1, classDefinitionType: 'junior_handler', entries: [dog] }));
  n++;
  const sacNames = ['Special Award Class - Junior', 'Special Award Class - Post Graduate', 'Special Award Class - Open'];
  const sacLabels = ['A', 'B', 'C'];
  sacNames.forEach((name, i) => {
    classes.push(cls({ className: name, classLabel: sacLabels[i], sex: null, classNumber: null, sortOrder: n - 1 + i, classDefinitionType: 'special', entries: [dog] }));
  });
  return classes;
}

describe('buildChallengeRegister', () => {
  it('produces exactly Dogs then Bitches, in that order', () => {
    const register = buildChallengeRegister(southWesternShape());
    expect(register.map((s) => s.key)).toEqual(['dog', 'bitch']);
    expect(register.map((s) => s.label)).toEqual(['Dogs', 'Bitches']);
  });

  it('never includes Special Award Classes or Junior Handling classes', () => {
    const register = buildChallengeRegister(southWesternShape());
    const allNames = register.flatMap((s) => s.rows.map((r) => r.className));
    expect(allNames).not.toContain('JHA Handling (6-11)');
    expect(allNames).not.toContain('JHA Handling (12-16)');
    expect(allNames.some((n) => n.startsWith('Special Award Class'))).toBe(false);
    // exactly the 11+11 breed classes, nothing more
    expect(allNames).toHaveLength(22);
  });

  it('keeps the Dog classes in judging order, matching the schedule', () => {
    const register = buildChallengeRegister(southWesternShape());
    const dogs = register.find((s) => s.key === 'dog')!;
    expect(dogs.rows.map((r) => r.className)).toEqual(AGE_NAMES);
    expect(dogs.rows.map((r) => r.classNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('keeps the Bitch classes in judging order, after all Dog classes', () => {
    const register = buildChallengeRegister(southWesternShape());
    const bitches = register.find((s) => s.key === 'bitch')!;
    expect(bitches.rows.map((r) => r.className)).toEqual(AGE_NAMES);
    expect(bitches.rows.map((r) => r.classNumber)).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  });

  it('includes classes with zero entries — the steward leaves the box blank', () => {
    const register = buildChallengeRegister([
      cls({ className: 'Baby Puppy', sex: 'dog', classNumber: 1, entries: [] }),
      cls({ className: 'Minor Puppy', sex: 'dog', classNumber: 2, entries: [dog] }),
    ]);
    const dogs = register.find((s) => s.key === 'dog')!;
    expect(dogs.rows.map((r) => r.className)).toEqual(['Baby Puppy', 'Minor Puppy']);
  });

  it('omits a whole section that has no classes — a dogs-only show prints only Dogs', () => {
    const register = buildChallengeRegister([
      cls({ className: 'Minor Puppy', sex: 'dog', classNumber: 2, entries: [dog] }),
    ]);
    expect(register.map((s) => s.key)).toEqual(['dog']);
  });

  it('a bitches-only show prints only Bitches', () => {
    const register = buildChallengeRegister([
      cls({ className: 'Minor Puppy', sex: 'bitch', classNumber: 2, entries: [dog] }),
    ]);
    expect(register.map((s) => s.key)).toEqual(['bitch']);
  });

  it('attaches the right abbreviation to each row', () => {
    const register = buildChallengeRegister([
      cls({ className: 'Minor Puppy', sex: 'dog', classNumber: 1, entries: [] }),
      cls({ className: 'Post Graduate', sex: 'bitch', classNumber: 2, entries: [] }),
    ]);
    const dogs = register.find((s) => s.key === 'dog')!;
    const bitches = register.find((s) => s.key === 'bitch')!;
    expect(dogs.rows[0]!.abbreviation).toBe('MPD');
    expect(bitches.rows[0]!.abbreviation).toBe('PGB');
  });

  it('returns an empty array when there are no dog/bitch classes at all', () => {
    const register = buildChallengeRegister([
      cls({ className: 'JHA Handling (6-11)', sex: null, classDefinitionType: 'junior_handler', entries: [] }),
    ]);
    expect(register).toEqual([]);
  });
});

// The register page (catalogue-judging.tsx render) lays out Dogs | Bitches
// as two side-by-side columns on one A5 page when it all fits; a show with
// a long section (13+ classes of one sex, Mandy's render-review revision
// 2026-08-31) falls back to the sequential one-sheet-per-sex layout instead
// of cramming a half-width column. fitsOneRegisterPage is the pure decision
// behind that branch.
function registerSection(key: 'dog' | 'bitch', rowCount: number): ChallengeRegisterSection {
  return {
    key,
    label: key === 'dog' ? 'Dogs' : 'Bitches',
    rows: Array.from({ length: rowCount }, (_, i) => ({
      classNumber: i + 1,
      classLabel: null,
      abbreviation: 'XD',
      className: 'Class',
    })),
  };
}

describe('fitsOneRegisterPage', () => {
  it('fits when every section has 13 rows or fewer', () => {
    expect(fitsOneRegisterPage([registerSection('dog', 13), registerSection('bitch', 13)])).toBe(true);
  });

  it('does not fit once any section exceeds 13 rows', () => {
    expect(fitsOneRegisterPage([registerSection('dog', 14), registerSection('bitch', 5)])).toBe(false);
  });

  it('is driven by the longer section — a short Bitches section does not rescue an oversized Dogs section', () => {
    expect(fitsOneRegisterPage([registerSection('dog', 20), registerSection('bitch', 1)])).toBe(false);
  });

  it('fits trivially with a single short section (single-sex show)', () => {
    expect(fitsOneRegisterPage([registerSection('dog', 5)])).toBe(true);
  });

  it('fits an empty register (nothing to lay out)', () => {
    expect(fitsOneRegisterPage([])).toBe(true);
  });
});
