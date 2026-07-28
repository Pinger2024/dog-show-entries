import { describe, it, expect } from 'vitest';
import { buildJudgingSections } from '../catalogue-judging';
import type { ClassGroup } from '../catalogue-utils';

// Mandy, South Western, 2026-07-27: "steward book, can we include classes with
// no entries ie baby puppy". The steward book dropped any class nobody had
// entered, so a steward calling classes down the schedule would find Baby
// Puppy simply absent — no way to tell "scheduled, no entries" from "we've
// missed a page". The by-class catalogue has always printed them at 0, so the
// two documents disagreed.

const cls = (over: Partial<ClassGroup> & Pick<ClassGroup, 'className'>): ClassGroup => ({
  classNumber: null,
  classLabel: undefined,
  sex: null,
  sortOrder: 0,
  entries: [],
  ...over,
});

const dog = { catalogueNumber: '1' } as unknown as ClassGroup['entries'][number];

describe('steward book — classes with no entries', () => {
  it('keeps a scheduled class that nobody entered', () => {
    const sections = buildJudgingSections([
      cls({ className: 'Baby Puppy', sex: 'dog', classNumber: 1, entries: [] }),
      cls({ className: 'Minor Puppy', sex: 'dog', classNumber: 2, entries: [dog] }),
    ]);

    const dogs = sections.find((s) => s.key === 'dog')!;
    expect(dogs.classes.map((c) => c.className)).toEqual(['Baby Puppy', 'Minor Puppy']);
    expect(dogs.classes[0]!.entries).toHaveLength(0);
  });

  it('keeps an empty class in each sex, in schedule order', () => {
    const sections = buildJudgingSections([
      cls({ className: 'Baby Puppy', sex: 'dog', classNumber: 1, entries: [] }),
      cls({ className: 'Baby Puppy', sex: 'bitch', classNumber: 12, entries: [] }),
      cls({ className: 'Minor Puppy', sex: 'bitch', classNumber: 13, entries: [dog] }),
    ]);

    expect(sections.find((s) => s.key === 'dog')!.classes).toHaveLength(1);
    expect(sections.find((s) => s.key === 'bitch')!.classes.map((c) => c.className)).toEqual([
      'Baby Puppy',
      'Minor Puppy',
    ]);
  });

  it('still drops a whole SECTION that has no classes at all', () => {
    // An RKC show with no Junior Handling shouldn't print an empty JH band.
    const sections = buildJudgingSections([
      cls({ className: 'Minor Puppy', sex: 'dog', classNumber: 2, entries: [dog] }),
    ]);
    expect(sections.map((s) => s.key)).toEqual(['dog']);
  });

  it('routes Junior Handling classes to their own section even with no entries', () => {
    const sections = buildJudgingSections([
      cls({ className: 'Minor Puppy', sex: 'dog', classNumber: 2, entries: [dog] }),
      cls({ className: 'JHA Handling (6-11)', sex: null, classLabel: 'JHA', classDefinitionType: 'junior_handler', entries: [] }),
    ]);
    expect(sections.map((s) => s.key)).toEqual(['dog', 'jh']);
    expect(sections.find((s) => s.key === 'jh')!.classes[0]!.className).toBe('JHA Handling (6-11)');
  });

  it('puts a Special Award Class in its own section, not Dogs', () => {
    // Was: fell through to the Dogs bucket (no section, no judge line) —
    // fixed 2026-07-28, see special-award-classes.test.ts for the full
    // regression covering Mandy's "mirror the catalogue order" report.
    const sections = buildJudgingSections([
      cls({ className: 'Special Award Class - Open', sex: null, classLabel: 'C', classDefinitionType: 'special', entries: [dog] }),
    ]);
    expect(sections.map((s) => s.key)).toEqual(['special']);
  });

  it('routes a genuinely unrecognised sexless class to its own catch-all, never Dogs', () => {
    // Was: fell through to the Dogs bucket by elimination (the "true
    // catch-all" was Dogs itself) — sectionClasses (lib/class-labels.ts)
    // now gives the catch-all its own section, key='other', so an
    // unrecognised class can never be mistaken for a real Dog class
    // (Michael 2026-07-28).
    const sections = buildJudgingSections([
      cls({ className: 'Mystery Class', sex: null, classLabel: undefined, entries: [dog] }),
    ]);
    expect(sections.map((s) => s.key)).toEqual(['other']);
    expect(sections.find((s) => s.key === 'other')!.classes[0]!.className).toBe('Mystery Class');
  });
});
