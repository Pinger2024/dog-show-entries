import { describe, it, expect } from 'vitest';
import { groupEntriesKC } from '../catalogue-marked';
import type { CatalogueEntry } from '../catalogue-types';

// Mandy 2026-08-12 (South Western RKC marked catalogue): Junior Handling
// entries have no dog, so group/breed are null and the marked catalogue
// printed their section as "UNCLASSIFIED / Unknown Breed". It must read
// Junior Handling.
function jhEntry(): CatalogueEntry {
  return {
    catalogueNumber: '84',
    entryType: 'junior_handler',
    group: null,
    breed: null,
    handler: 'Sarah Hill',
    exhibitor: 'Sarah Hill',
    dogName: null,
    owners: [],
    withholdFromPublication: false,
    classes: [{ name: 'JHA Handling (6-11)', classLabel: 'JHA', classNumber: null, sex: null, sortOrder: 90 }],
  } as unknown as CatalogueEntry;
}

describe('groupEntriesKC — junior handling', () => {
  it('groups JH entries under "Junior Handling", never "Unclassified"', () => {
    const groups = groupEntriesKC([jhEntry()]);
    expect(Array.from(groups.keys())).toEqual(['Junior Handling']);
    const breeds = Array.from(groups.get('Junior Handling')!.breeds.keys());
    expect(breeds).toEqual(['Junior Handling']);
  });
});

describe('transferDisplayLabel', () => {
  it('strips the Special Award Class prefix, keeps everything else', async () => {
    const { transferDisplayLabel } = await import('../catalogue-marked');
    expect(transferDisplayLabel('Special Award Class - Post Graduate')).toBe('Post Graduate');
    expect(transferDisplayLabel('Post Graduate')).toBe('Post Graduate');
    expect(transferDisplayLabel('Special Award Class-Junior')).toBe('Junior');
  });
});
