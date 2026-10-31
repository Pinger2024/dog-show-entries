import { describe, it, expect } from 'vitest';
import { buildExhibitorIndex } from '../catalogue-ringside';
import type { CatalogueEntry } from '../catalogue-types';

// A dog buys into a class, then later buys into a Special Award Class
// separately — "one catalogue number per dog" (catalogue-numbering.ts)
// means these are TWO `entries` rows sharing one catalogue number. The
// exhibitor index used to dedup by catalogue number by keeping only
// whichever row's classes happened to come first in iteration order,
// silently dropping the other — surfaced by the catalogueNumberAsc fix
// (coordinator's review, 2026-09-02) flipping which row that was on
// GSD Club of Scotland's real catalogue (dog #2: "1. Minor Puppy" became
// "A. Special Award Class - Puppy" — should always have been both).
function multiClassRows(): CatalogueEntry[] {
  const base = {
    group: 'Pastoral',
    breed: 'German Shepherd Dog',
    handler: null,
    exhibitor: 'Mr W Hdqxlfyt',
    dogName: 'Syoulma Czdyc',
    sex: 'dog',
    dateOfBirth: '2026-01-14',
    sire: 'A Sire',
    dam: 'A Dam',
    breeder: null,
    kcRegNumber: null,
    colour: null,
    owners: [{ name: 'Mr W Hdqxlfyt', address: null }],
    withholdFromPublication: false,
    entryType: 'standard',
  };
  return [
    {
      ...base,
      catalogueNumber: '2',
      classes: [{ name: 'Minor Puppy', classLabel: '1', classNumber: 1, sex: 'dog', sortOrder: 1 }],
    },
    {
      ...base,
      catalogueNumber: '2',
      classes: [{ name: 'Special Award Class - Puppy', classLabel: 'A', classNumber: null, sex: 'dog', sortOrder: 50 }],
    },
  ] as unknown as CatalogueEntry[];
}

describe('buildExhibitorIndex — multi-class entries sharing one catalogue number', () => {
  it('merges classes from every row instead of keeping only the first-seen row', () => {
    const index = buildExhibitorIndex(multiClassRows());
    expect(index).toHaveLength(1);
    expect(index[0]!.dogs).toHaveLength(1); // still one dog row, not two
    expect(index[0]!.dogs[0]!.classes).toBe('1. Minor Puppy, A. Special Award Class - Puppy');
  });

  it('is order-independent — the second row arriving first gives the same merged result', () => {
    const [first, second] = multiClassRows();
    const index = buildExhibitorIndex([second!, first!]);
    expect(index[0]!.dogs[0]!.classes).toBe('1. Minor Puppy, A. Special Award Class - Puppy');
  });
});
