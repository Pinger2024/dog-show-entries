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
      classDefinition?: {
        name?: string | null;
        type?: string | null;
      } | null;
    } | null;
  }> | null;
};

const sumTotals = (items: ClassBreakdownItem[]): ClassTotals =>
  items.reduce(
    (s, c) => ({ entries: s.entries + c.entries, revenue: s.revenue + c.revenue }),
    { entries: 0, revenue: 0 }
  );

const sortByEntries = (a: ClassBreakdownItem, b: ClassBreakdownItem) =>
  b.entries - a.entries;

export function computeClassBreakdown(
  entryReport: EntryForBreakdown[] | null | undefined
): ClassBreakdown {
  const dogMap = new Map<string, ClassBreakdownItem>();
  const bitchMap = new Map<string, ClassBreakdownItem>();
  const jhMap = new Map<string, ClassBreakdownItem>();
  const mixedMap = new Map<string, ClassBreakdownItem>();
  const combinedMap = new Map<string, ClassBreakdownItem>();

  const bumpBucket = (map: Map<string, ClassBreakdownItem>, name: string, fee: number) => {
    const existing = map.get(name) ?? { name, entries: 0, revenue: 0 };
    existing.entries += 1;
    existing.revenue += fee;
    map.set(name, existing);
  };

  for (const entry of entryReport ?? []) {
    if (entry.status === 'cancelled' || entry.status === 'withdrawn') continue;
    for (const ec of entry.entryClasses ?? []) {
      const className = ec.showClass?.classDefinition?.name ?? 'Unknown';
      const sex = ec.showClass?.sex ?? null;
      const classType = ec.showClass?.classDefinition?.type ?? null;
      const fee = ec.fee;

      bumpBucket(combinedMap, className, fee);

      const targetMap =
        classType === 'junior_handler'
          ? jhMap
          : sex === 'dog'
            ? dogMap
            : sex === 'bitch'
              ? bitchMap
              : mixedMap;

      bumpBucket(targetMap, className, fee);
    }
  }

  const dogs = Array.from(dogMap.values()).sort(sortByEntries);
  const bitches = Array.from(bitchMap.values()).sort(sortByEntries);
  const juniorHandlers = Array.from(jhMap.values()).sort(sortByEntries);
  const mixedClasses = Array.from(mixedMap.values()).sort(sortByEntries);
  const combined = Array.from(combinedMap.values()).sort(sortByEntries);

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
