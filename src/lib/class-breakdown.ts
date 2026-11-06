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
 *
 * A fifth bucket — "Not For Competition" — counts NFC entries.
 * These have no judged class (no entry_classes rows at all), so
 * without a dedicated bucket they vanished from the breakdown
 * entirely: a show with 73 catalogue entries (2 of them NFC) read
 * "70" here, which never tied up to the catalogue. NFC entries are
 * counted once each from the entry itself, with the entry's own fee
 * as revenue. (Mandy, BAGSD 2026-06-17.)
 *
 * The breakdown is fed the full catalogue entry set — every
 * confirmed, non-deleted entry regardless of how it was paid — so
 * the class counts are the true ring numbers, including entries a
 * secretary added that were paid directly to the club rather than
 * through Remi.
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
  notForCompetition: ClassBreakdownItem[];
  combined: ClassBreakdownItem[];
  dogTotals: ClassTotals;
  bitchTotals: ClassTotals;
  juniorHandlerTotals: ClassTotals;
  mixedClassesTotals: ClassTotals;
  notForCompetitionTotals: ClassTotals;
  combinedTotals: ClassTotals;
};

export type EntryForBreakdown = {
  status: 'pending' | 'confirmed' | 'withdrawn' | 'transferred' | 'cancelled';
  /** NFC ("Not For Competition") entries have no judged class, so they carry no
   *  entryClasses. They're counted in their own bucket from the entry itself. */
  isNfc?: boolean;
  /** Entry-level fee — used as the NFC bucket's revenue (NFC entries have no
   *  per-class fee rows). Competing entries take revenue from entryClasses. */
  totalFee?: number;
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

/** A show's scheduled class (show_classes row), used to seed a zero-entry
 *  bucket for classes nobody has entered yet — otherwise a scheduled class
 *  with no entries never appears on screen at all (Mandy 2026-07-27: Baby
 *  Puppy Dog/Bitch missing from the Financial page when unentered, even
 *  though the PDF report — which is built from the show's class list, not
 *  the entry set — already showed them as "0"). */
export type ScheduledClassForBreakdown = {
  sex?: 'dog' | 'bitch' | null;
  svCoatType?: 'stock' | 'long_stock' | null;
  sortOrder?: number | null;
  classDefinition?: { name?: string | null; type?: string | null } | null;
};

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

// NFC entries have no class to key on, so they share one synthetic bucket.
// A large sortOrder sinks the bucket below every real class in the combined map.
const NFC_BUCKET_NAME = 'Not For Competition';
const NFC_SORT_ORDER = 100_000;

export function computeClassBreakdown(
  entryReport: EntryForBreakdown[] | null | undefined,
  scheduledClasses?: ScheduledClassForBreakdown[] | null,
): ClassBreakdown {
  const dogMap = new Map<string, OrderedItem>();
  const bitchMap = new Map<string, OrderedItem>();
  const jhMap = new Map<string, OrderedItem>();
  const mixedMap = new Map<string, OrderedItem>();
  const nfcMap = new Map<string, OrderedItem>();
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

  // Seed a ZERO-entry bucket for every scheduled class before the entry loop
  // runs, so a class nobody has entered still shows up (with entries: 0)
  // instead of vanishing from the card entirely. bumpBucket then increments
  // the seeded bucket in place rather than creating a fresh one, so seeding
  // never changes any total. Mirrors the entry-bucketing rules exactly so a
  // scheduled class and its own entries land in the same bucket.
  const seedBucket = (map: Map<string, OrderedItem>, name: string, sortOrder: number) => {
    const existing = map.get(name);
    if (existing) {
      if (sortOrder < existing.sortOrder) existing.sortOrder = sortOrder;
      return;
    }
    map.set(name, { name, entries: 0, revenue: 0, sortOrder });
  };

  for (const sc of scheduledClasses ?? []) {
    const className = formatSvClassName(sc.classDefinition?.name ?? 'Unknown', sc.svCoatType);
    const sortOrder = sc.sortOrder ?? 9999;

    seedBucket(combinedMap, className, sortOrder);

    const targetMap =
      sc.classDefinition?.type === 'junior_handler'
        ? jhMap
        : sc.sex === 'dog'
          ? dogMap
          : sc.sex === 'bitch'
            ? bitchMap
            : mixedMap;

    seedBucket(targetMap, className, sortOrder);
  }

  for (const entry of entryReport ?? []) {
    if (entry.status === 'cancelled' || entry.status === 'withdrawn') continue;

    // NFC ("Not For Competition") entries are in the catalogue but not entered
    // in any judged class, so they carry no entryClasses and would otherwise
    // vanish from the breakdown — leaving the on-screen total short of the
    // catalogue count (Mandy, BAGSD 2026-06-17). Count each once in its own
    // bucket and in the grand total; revenue is the entry-level fee (NFC is
    // typically £0).
    if (entry.isNfc) {
      const nfcFee = entry.totalFee ?? 0;
      bumpBucket(combinedMap, NFC_BUCKET_NAME, nfcFee, NFC_SORT_ORDER);
      bumpBucket(nfcMap, NFC_BUCKET_NAME, nfcFee, NFC_SORT_ORDER);
      continue;
    }

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
  const notForCompetition = strip(Array.from(nfcMap.values()).sort(sortByClassOrder));
  const combined = strip(Array.from(combinedMap.values()).sort(sortByClassOrder));

  return {
    dogs,
    bitches,
    juniorHandlers,
    mixedClasses,
    notForCompetition,
    combined,
    dogTotals: sumTotals(dogs),
    bitchTotals: sumTotals(bitches),
    juniorHandlerTotals: sumTotals(juniorHandlers),
    mixedClassesTotals: sumTotals(mixedClasses),
    notForCompetitionTotals: sumTotals(notForCompetition),
    combinedTotals: sumTotals(combined),
  };
}
