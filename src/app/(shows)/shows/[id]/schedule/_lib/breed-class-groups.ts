/**
 * The public schedule page's classes, by breed, each breed split into the
 * show's running-order sections (Mixed → Dog → Bitch → Junior Handling) by
 * THE owner of that split, `sectionClasses` (lib/class-labels.ts).
 *
 * The page used to split them itself by reading `sex` off the class definition — a
 * column class_definitions does not have (sex lives on show_classes) — so
 * every class fell into one unheaded list and Dog/Bitch never rendered
 * (found by tsc 1 Nov 2026, fixed 3 Nov; schedule-page-breed-groups.test.ts).
 *
 * Special Award classes are left out: the page gives them their own section.
 */
import { sectionClasses, type ClassSection, type SectionableClass } from '@/lib/class-labels';

export type BreedGroupClass = SectionableClass & {
  id: string;
  breed?: { name: string; group?: { sortOrder: number } | null } | null;
};

export interface BreedClassGroup<T> {
  breedName: string;
  groupSortOrder: number;
  sections: ClassSection<T>[];
}

export function breedClassGroups<T extends BreedGroupClass>(
  classes: T[],
  specialAwardClassIds: Set<string>,
): BreedClassGroup<T>[] {
  const byBreed = new Map<string, { groupSortOrder: number; classes: T[] }>();
  for (const sc of classes) {
    if (specialAwardClassIds.has(sc.id)) continue;
    const breedName = sc.breed?.name ?? 'Any Breed';
    const entry = byBreed.get(breedName) ?? { groupSortOrder: sc.breed?.group?.sortOrder ?? 999, classes: [] };
    entry.classes.push(sc);
    byBreed.set(breedName, entry);
  }
  return [...byBreed.entries()]
    .map(([breedName, { groupSortOrder, classes: breedClasses }]) => ({
      breedName,
      groupSortOrder,
      sections: sectionClasses(breedClasses, (c) => c),
    }))
    .sort((a, b) => a.groupSortOrder - b.groupSortOrder || a.breedName.localeCompare(b.breedName));
}
