/**
 * Per-class breakdown for the Financial page's "Entries by Class"
 * card. Buckets each entry-class row by sex (dogs / bitches), with
 * Junior Handling as its own group and a "Mixed Classes" bucket
 * for any non-JH class that accepts both sexes — Veteran (when
 * run as a single class), Brace, Team, Stakes etc., where
 * show_classes.sex is null.
 *
 * The fourth bucket exists because the original three-way split
 * was non-exhaustive: a Veteran class entry would land in the
 * combined grand total but vanish from the per-sex subtotals,
 * leaving secretaries with subtotals that didn't add up to the
 * displayed grand total.
 */

export type ClassBreakdownItem = {
  name: string;
  entries: number;
  revenue: number;
};

/** Internal bucket — carries the canonical class order (show_classes.sortOrder)
 *  so we can display the breakdown in class order (Amanda 2026-05-28). The
 *  sortOrder is stripped from the public ClassBreakdownItem on return. */
type OrderedItem = ClassBreakdownItem & { sortOrder: number };

export type ClassTotals = { entries: number; revenue: number };

export type ClassBreakdown = {
  dogs: ClassBreakdownItem[];
  bitches: ClassBreakdownItem[];
  juniorHandlers: ClassBreakdownItem[];
  mixedClasses: ClassBreakdownItem[];
  combined: ClassBreakdownItem[];
  dogTotals: ClassTotals;
  bitchTotals: ClassTotals;
  juniorHandlerTotals: ClassTotals;
  mixedClassesTotals: ClassTotals;
  combinedTotals: ClassTotals;
};

export type EntryForBreakdown = {
  status: 'pending' | 'confirmed' | 'withdrawn' | 'transferred' | 'cancelled';
  entryClasses?: Array<{
    fee: number;
    showClass?: {
      sex?: 'dog' | 'bitch' | null;
      svCoatType?: 'stock' | 'long_stock' | null;
      sortOrder?: number | null;
      classNumber?: number | null;
      classDefinition?: {
        name?: string | null;
        type?: string | null;
      } | null;
    } | null;
  }> | null;
};

import { formatSvClassName } from './class-labels';

const sumTotals = (items: ClassBreakdownItem[]): ClassTotals =>
  items.reduce(
    (s, c) => ({ entries: s.entries + c.entries, revenue: s.revenue + c.revenue }),
    { entries: 0, revenue: 0 }
  );

// Display in class order (Amanda 2026-05-28): lowest sortOrder first, which
// matches the show's class numbering for both RKC and SV regionals. Ties
// (e.g. a class with no sortOrder) fall back to most-entries-first then name.
const sortByClassOrder = (a: OrderedItem, b: OrderedItem) => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.entries !== b.entries) return b.entries - a.entries;
  return a.name.localeCompare(b.name);
};

/** Drop the internal sortOrder so the public items stay {name,entries,revenue}. */
const strip = (items: OrderedItem[]): ClassBreakdownItem[] =>
  items.map(({ name, entries, revenue }) => ({ name, entries, revenue }));

export function computeClassBreakdown(
  entryReport: EntryForBreakdown[] | null | undefined
): ClassBreakdown {
  const dogMap = new Map<string, OrderedItem>();
  const bitchMap = new Map<string, OrderedItem>();
  const jhMap = new Map<string, OrderedItem>();
  const mixedMap = new Map<string, OrderedItem>();
  const combinedMap = new Map<string, OrderedItem>();

  const bumpBucket = (
    map: Map<string, OrderedItem>,
    name: string,
    fee: number,
    sortOrder: number,
  ) => {
    const existing = map.get(name) ?? { name, entries: 0, revenue: 0, sortOrder };
    existing.entries += 1;
    existing.revenue += fee;
    // Keep the lowest sortOrder seen for this bucket (a name+coat maps to one
    // show_class per sex, so this is stable; min is just defensive).
    if (sortOrder < existing.sortOrder) existing.sortOrder = sortOrder;
    map.set(name, existing);
  };

  for (const entry of entryReport ?? []) {
    if (entry.status === 'cancelled' || entry.status === 'withdrawn') continue;
    for (const ec of entry.entryClasses ?? []) {
      const rawName = ec.showClass?.classDefinition?.name ?? 'Unknown';
      const sex = ec.showClass?.sex ?? null;
      const classType = ec.showClass?.classDefinition?.type ?? null;
      const className = formatSvClassName(rawName, ec.showClass?.svCoatType);
      const fee = ec.fee;
      // Default unknown sortOrder to a large number so it sinks to the end.
      const sortOrder = ec.showClass?.sortOrder ?? 9999;

      bumpBucket(combinedMap, className, fee, sortOrder);

      const targetMap =
        classType === 'junior_handler'
          ? jhMap
          : sex === 'dog'
            ? dogMap
            : sex === 'bitch'
              ? bitchMap
              : mixedMap;

      bumpBucket(targetMap, className, fee, sortOrder);
    }
  }

  const dogs = strip(Array.from(dogMap.values()).sort(sortByClassOrder));
  const bitches = strip(Array.from(bitchMap.values()).sort(sortByClassOrder));
  const juniorHandlers = strip(Array.from(jhMap.values()).sort(sortByClassOrder));
  const mixedClasses = strip(Array.from(mixedMap.values()).sort(sortByClassOrder));
  const combined = strip(Array.from(combinedMap.values()).sort(sortByClassOrder));

  return {
    dogs,
    bitches,
    juniorHandlers,
    mixedClasses,
    combined,
    dogTotals: sumTotals(dogs),
    bitchTotals: sumTotals(bitches),
    juniorHandlerTotals: sumTotals(juniorHandlers),
    mixedClassesTotals: sumTotals(mixedClasses),
    combinedTotals: sumTotals(combined),
  };
}
