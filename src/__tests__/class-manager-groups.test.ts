/**
 * The secretary's class manager groups classes into sections, and dragging a
 * section rewrites every class's stored running order in the order shown — so
 * it must follow the one running-order owner (sectionClasses). It used its own
 * dog / bitch / "Any Sex" order, lumping a mixed Veteran in with the Special
 * Awards and Junior Handling (CI's section-order guard, 30 Sept 2026 — the
 * same mistake that printed North Eastern's Veteran last).
 */
import { describe, it, expect } from 'vitest';
import { buildClassManagerGroups, type ClassManagerClass } from '@/app/(secretary)/secretary/shows/[id]/_lib/class-manager-groups';

const cls = (
  id: string,
  sortOrder: number,
  sex: 'dog' | 'bitch' | null,
  type: string,
  breed?: string,
): ClassManagerClass => ({
  id,
  sortOrder,
  sex,
  classDefinition: { name: id, type },
  breed: breed ? { name: breed, group: { name: 'Pastoral', sortOrder: 5 } } : null,
});

describe('class manager sections — the show running order, never its own', () => {
  it('a single-breed show: Mixed, Dog, Bitch, Special Awards, Junior Handling — each its own section', () => {
    const { grouped } = buildClassManagerGroups([
      // Deliberately out of order in the input.
      cls('JHA', 40, null, 'junior_handler'),
      cls('Open Bitch', 21, 'bitch', 'achievement'),
      cls('Puppy Dog', 10, 'dog', 'age'),
      cls('Special Award Class A', 30, null, 'special'),
      cls('Veteran', 0, null, 'age'),
      cls('Puppy Bitch', 20, 'bitch', 'age'),
    ]);
    expect(grouped.map((g) => [g.key, g.label, g.classes.map((c) => c.id)])).toEqual([
      ['mixed', 'Mixed Classes', ['Veteran']],
      ['dog', 'Dog Classes', ['Puppy Dog']],
      ['bitch', 'Bitch Classes', ['Puppy Bitch', 'Open Bitch']],
      ['special', 'Special Award Classes', ['Special Award Class A']],
      ['jh', 'Junior Handling', ['JHA']],
    ]);
  });

  it('an all-breed show: within a breed, a mixed class comes first, not after every dog and bitch class', () => {
    const { grouped, isMultiBreed } = buildClassManagerGroups([
      cls('Open Bitch', 3, 'bitch', 'achievement', 'Collie'),
      cls('Open Dog', 2, 'dog', 'achievement', 'Collie'),
      cls('Veteran', 1, null, 'age', 'Collie'),
      cls('Beagle Open', 4, null, 'achievement', 'Beagle'),
      cls('Boxer Open', 5, null, 'achievement', 'Boxer'),
    ]);
    expect(isMultiBreed).toBe(true);
    const collie = grouped.find((g) => g.key === 'breed-Collie')!;
    expect(collie.classes.map((c) => c.id)).toEqual(['Veteran', 'Open Dog', 'Open Bitch']);
  });
});
