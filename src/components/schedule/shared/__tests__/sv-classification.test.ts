import { describe, it, expect } from 'vitest';
import { groupSvClasses } from '../sv-classification';
import type { ScheduleClass } from '../types';

/**
 * Lock the SV breed classification grouping helper. Amanda's GSDL BRG
 * schedule reference (2026-05-19) defines the exact display structure —
 * regressions here would break the whole SV schedule layout.
 */

type Row = {
  className: string;
  sex: 'dog' | 'bitch' | null;
  classType: 'sv_age' | 'junior_handler';
  svCoatType?: 'stock' | 'long_stock' | null;
};

function svClass(r: Row, i: number): ScheduleClass {
  return {
    classNumber: i + 1,
    classLabel: String(i + 1),
    className: r.className,
    classDescription: null,
    sex: r.sex,
    breedName: 'German Shepherd Dog',
    classType: r.classType,
    breedGroupName: null,
    breedGroupSortOrder: null,
    entryFee: null,
    ...({ svCoatType: r.svCoatType ?? null } as { svCoatType?: 'stock' | 'long_stock' | null }),
  } as ScheduleClass;
}

function buildFullSvShow(): ScheduleClass[] {
  // Mirrors the DB layout the new-show wizard produces: 4 rows per age
  // (bitch×2 coats + dog×2 coats). Order doesn't matter to the helper —
  // the test checks that grouping + sorting works regardless.
  const ages = ['SV Minor Puppy', 'SV Puppy', 'SV Junior', 'SV Yearling', 'Adult', 'Working'];
  const rows: Row[] = [];
  for (const age of ages) {
    for (const sex of ['bitch', 'dog'] as const) {
      for (const coat of ['long_stock', 'stock'] as const) {
        rows.push({ className: age, sex, classType: 'sv_age', svCoatType: coat });
      }
    }
  }
  return rows.map(svClass);
}

describe('groupSvClasses', () => {
  it('builds 12 numbered breed classes from a full SV class set', () => {
    const groups = groupSvClasses(buildFullSvShow());
    expect(groups.breedClasses).toHaveLength(12);
    expect(groups.totalCount).toBe(12);
  });

  it('strips the "SV " prefix from the displayed name', () => {
    const groups = groupSvClasses(buildFullSvShow());
    expect(groups.breedClasses[0]?.name).toBe('Minor Puppy');
    expect(groups.breedClasses.map((b) => b.name)).not.toContain('SV Minor Puppy');
  });

  it('orders bitch before dog within each age', () => {
    const groups = groupSvClasses(buildFullSvShow());
    expect(groups.breedClasses[0]?.sex).toBe('bitch');
    expect(groups.breedClasses[1]?.sex).toBe('dog');
    expect(groups.breedClasses[2]?.sex).toBe('bitch');
    expect(groups.breedClasses[3]?.sex).toBe('dog');
  });

  it('orders ages by SV canonical sequence (Minor Puppy → Working)', () => {
    const groups = groupSvClasses(buildFullSvShow());
    expect(groups.breedClasses.map((b) => b.name)).toEqual([
      'Minor Puppy', 'Minor Puppy',
      'Puppy', 'Puppy',
      'Junior', 'Junior',
      'Yearling', 'Yearling',
      'Adult', 'Adult',
      'Working', 'Working',
    ]);
  });

  it('produces a/b coat sub-letters with Standard Coat as a and Long Coat as b', () => {
    const groups = groupSvClasses(buildFullSvShow());
    for (const cls of groups.breedClasses) {
      expect(cls.coatRows).toHaveLength(2);
      expect(cls.coatRows[0]?.letter).toBe('a');
      expect(cls.coatRows[0]?.label).toBe('Standard Coat');
      expect(cls.coatRows[1]?.letter).toBe('b');
      expect(cls.coatRows[1]?.label).toBe('Long Coat');
    }
  });

  it('excludes Baby Puppy from the numbered classification (GSDL spec)', () => {
    const classes = [
      ...buildFullSvShow(),
      svClass({ className: 'Baby Puppy', sex: 'bitch', classType: 'sv_age', svCoatType: 'stock' }, 50),
      svClass({ className: 'Baby Puppy', sex: 'dog', classType: 'sv_age', svCoatType: 'long_stock' }, 51),
    ];
    const groups = groupSvClasses(classes);
    expect(groups.breedClasses).toHaveLength(12);
    expect(groups.breedClasses.map((b) => b.name)).not.toContain('Baby Puppy');
  });

  it('appends Junior Handling classes numbered after the breed block', () => {
    const classes: ScheduleClass[] = [
      ...buildFullSvShow(),
      svClass({ className: 'JHA Handling (6-11)', sex: null, classType: 'junior_handler' }, 50),
      svClass({ className: 'JHA Handling (12-16)', sex: null, classType: 'junior_handler' }, 51),
    ];
    const groups = groupSvClasses(classes);
    expect(groups.juniorHandling).toHaveLength(2);
    expect(groups.juniorHandling[0]?.number).toBe(13);
    expect(groups.juniorHandling[1]?.number).toBe(14);
    expect(groups.totalCount).toBe(14);
  });

  it('handles a partial SV show (e.g. Working not run)', () => {
    // Drop Working classes
    const partial = buildFullSvShow().filter((c) => c.className !== 'Working');
    const groups = groupSvClasses(partial);
    expect(groups.breedClasses).toHaveLength(10); // 5 ages × 2 sexes
    expect(groups.breedClasses.map((b) => b.name)).not.toContain('Working');
  });

  it('keeps a class with no coat type — defaults to Standard Coat (a)', () => {
    // Defensive — a row missing svCoatType shouldn't get dropped silently
    const classes = [
      svClass({ className: 'SV Junior', sex: 'bitch', classType: 'sv_age', svCoatType: null }, 0),
    ];
    const groups = groupSvClasses(classes);
    expect(groups.breedClasses).toHaveLength(1);
    expect(groups.breedClasses[0]?.coatRows).toHaveLength(1);
    expect(groups.breedClasses[0]?.coatRows[0]?.letter).toBe('a');
  });

  it('dedupes Junior Handler rows by className', () => {
    // Old data sometimes has both sex=null and a sex-split JH row
    const classes: ScheduleClass[] = [
      svClass({ className: 'JHA Handling (6-11)', sex: null, classType: 'junior_handler' }, 0),
      svClass({ className: 'JHA Handling (6-11)', sex: null, classType: 'junior_handler' }, 1),
    ];
    const groups = groupSvClasses(classes);
    expect(groups.juniorHandling).toHaveLength(1);
  });
});
