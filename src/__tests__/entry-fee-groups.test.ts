import { describe, it, expect } from 'vitest';
import { buildEntryFeeGroups, type EntryFeeGroupClass } from '@/components/schedule/shared/entry-fee-groups';

const FIRST_FEE = 2000; // £20

function cls(className: string, entryFee: number | null, classType: string | null = null): EntryFeeGroupClass {
  return { className, classType, entryFee };
}

describe('buildEntryFeeGroups', () => {
  it('collapses every "Special Award Class - …" variant into one "Special Award classes" group', () => {
    const groups = buildEntryFeeGroups(
      [
        cls('Special Award Class - Puppy', 300),
        cls('Special Award Class - Junior', 300),
        cls('Special Award Class - Open', 300),
        cls('Special Award Class - Veteran', 300),
      ],
      FIRST_FEE,
    );
    expect(groups).toEqual([{ label: 'Special Award classes', fee: 300 }]);
  });

  it('a Baby Puppy class priced below the first fee gets its own group', () => {
    const groups = buildEntryFeeGroups([cls('Baby Puppy', 400)], FIRST_FEE);
    expect(groups).toEqual([{ label: 'Baby Puppy classes', fee: 400 }]);
  });

  it('a class priced equal to the first fee is skipped entirely', () => {
    const groups = buildEntryFeeGroups([cls('Open Dog', FIRST_FEE)], FIRST_FEE);
    expect(groups).toEqual([]);
  });

  it('a Junior Handler class is excluded regardless of its fee', () => {
    const groups = buildEntryFeeGroups(
      [cls('Junior Handling', 300, 'junior_handler')],
      FIRST_FEE,
    );
    expect(groups).toEqual([]);
  });

  it('two groups sharing the same fee sort by label', () => {
    const groups = buildEntryFeeGroups(
      [cls('Veteran', 500), cls('Baby Puppy', 500)],
      FIRST_FEE,
    );
    expect(groups).toEqual([
      { label: 'Baby Puppy classes', fee: 500 },
      { label: 'Veteran classes', fee: 500 },
    ]);
  });

  it('sorts primarily by fee, cheapest first', () => {
    const groups = buildEntryFeeGroups(
      [cls('Veteran', 500), cls('Baby Puppy', 300)],
      FIRST_FEE,
    );
    expect(groups).toEqual([
      { label: 'Baby Puppy classes', fee: 300 },
      { label: 'Veteran classes', fee: 500 },
    ]);
  });

  it('returns nothing when the show has no first entry fee set', () => {
    expect(buildEntryFeeGroups([cls('Baby Puppy', 400)], null)).toEqual([]);
  });

  it('ignores a class with no entryFee override', () => {
    expect(buildEntryFeeGroups([cls('Open Dog', null)], FIRST_FEE)).toEqual([]);
  });
});
