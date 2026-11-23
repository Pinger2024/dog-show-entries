/**
 * How the secretary's class manager groups a show's classes into collapsible,
 * draggable sections. Dragging a section rewrites every class's stored running
 * order in the order shown here, so the grouping must follow the show's ONE
 * running-order owner (`sectionClasses`, lib/class-labels.ts) — a local
 * dog-bitch-then-the-rest order put a mixed Veteran last (CI guard, 30 Sept
 * 2026; the same mistake as the printed catalogues' Veteran bug).
 */
import { CLASS_SECTION_SCREEN_TITLES, sectionClasses } from '@/lib/class-labels';

export type ClassManagerClass = {
  id: string;
  sex: 'dog' | 'bitch' | null;
  sortOrder: number;
  classDefinition?: { name: string; type: string } | null;
  breed?: { name: string; group?: { name: string; sortOrder: number } | null } | null;
};

export type ClassManagerGroup<T> = { key: string; label: string; classes: T[] };

export function buildClassManagerGroups<T extends ClassManagerClass>(classes: T[]): {
  isMultiBreed: boolean;
  grouped: ClassManagerGroup<T>[];
  breedGroupHeaders: Map<number, { name: string; breedCount: number }>;
} {
  const distinctBreeds = new Set(classes.filter((c) => c.breed).map((c) => c.breed!.name));
  const multiBreed = distinctBreeds.size >= 3;

  type GroupEntry = ClassManagerGroup<T>;
  const groups: GroupEntry[] = [];

  // Maps group index → breed group header to insert before that section
  const breedGroupHeaders = new Map<number, { name: string; breedCount: number }>();

  if (multiBreed) {
    const breedMap = new Map<string, { groupSort: number; groupName: string; classes: T[] }>();
    const varietyClasses: T[] = [];
    for (const sc of classes) {
      if (!sc.breed) {
        varietyClasses.push(sc);
        continue;
      }
      const breedName = sc.breed.name;
      const entry = breedMap.get(breedName) ?? {
        groupSort: sc.breed.group?.sortOrder ?? 999,
        groupName: sc.breed.group?.name ?? 'Other',
        classes: [],
      };
      entry.classes.push(sc);
      breedMap.set(breedName, entry);
    }

    const sortedBreeds = [...breedMap.entries()].sort((a, b) => {
      if (a[1].groupSort !== b[1].groupSort) return a[1].groupSort - b[1].groupSort;
      return a[0].localeCompare(b[0]);
    });

    let lastGroupName = '';
    for (const [breedName, { groupName, classes: breedClasses }] of sortedBreeds) {
      // Track group header positions
      if (groupName !== lastGroupName) {
        const breedsInGroup = sortedBreeds.filter(([, b]) => b.groupName === groupName).length;
        breedGroupHeaders.set(groups.length, { name: groupName, breedCount: breedsInGroup });
        lastGroupName = groupName;
      }
      // Within a breed: the show's running order (sectionClasses — Mixed →
      // Dog → Bitch → Special Awards → Junior Handling), each section in its
      // stored order. A local dog-bitch-then-the-rest rank put a mixed
      // Veteran after every dog and bitch class.
      const sorted = sectionClasses(
        [...breedClasses].sort((a, b) => a.sortOrder - b.sortOrder),
        (c) => c,
      ).flatMap((section) => section.classes);
      groups.push({ key: `breed-${breedName}`, label: breedName, classes: sorted });
    }

    // Variety & special classes (no breed) at the end, in their own section
    if (varietyClasses.length > 0) {
      const sorted = [...varietyClasses].sort((a, b) => a.sortOrder - b.sortOrder);
      groups.push({ key: 'variety', label: 'Variety & Special Classes', classes: sorted });
    }
  } else {
    // One section per running-order section (sectionClasses): Mixed,
    // Dog, Bitch, Special Award and Junior Handling each get their own —
    // never one "Any Sex" bucket for everything without a sex, which hid a
    // mixed Veteran among the Special Awards and Junior Handling (the
    // null-sex trap). Classes keep their stored order within a section.
    const ordered = [...classes].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const section of sectionClasses(ordered, (c) => c)) {
      groups.push({
        key: section.key,
        label: CLASS_SECTION_SCREEN_TITLES[section.key],
        classes: section.classes,
      });
    }
  }

  // Sort groups by the minimum sortOrder of their classes so that
  // section-level reordering (which updates sortOrder) is respected.
  groups.sort((a, b) => {
    const minA = Math.min(...a.classes.map((c) => c.sortOrder));
    const minB = Math.min(...b.classes.map((c) => c.sortOrder));
    return minA - minB;
  });

  return { isMultiBreed: multiBreed, grouped: groups, breedGroupHeaders };
}
