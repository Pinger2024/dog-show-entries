/**
 * Catalogue number assignment for a show's confirmed entries.
 *
 * Two phases, gated by `shows.catalogueNumbersLockedAt`:
 *
 *   PROVISIONAL (lockedAt = null) — numbers are kept in full class order. Every
 *   add/remove re-sorts the whole show (`resortCatalogueNumbers`) so late
 *   entries slot into their class instead of piling up at the end.
 *
 *   LOCKED (lockedAt set) — the secretary has locked the numbers for printing.
 *   Existing numbers never shift; new entries append at max+1.
 *
 * Every path that confirms an entry — the Stripe webhook, the £0 free-entry
 * shortcut, the secretary's manual add — and the close-entries transition go
 * through `syncCatalogueNumbers`, which picks the right phase. Render paths
 * pass `allowResort: false` so opening a catalogue can never shift a number
 * out from under a secretary who is mid-print; they only fill blanks.
 *
 * Ordering (single source of truth — `sortForCatalogue`): entries are grouped
 * into three tiers so Junior Handlers and Not-For-Competition dogs never
 * scatter into the breed classes —
 *   tier 0  breed-competing  → by min breed class number, then group/breed/sex/date
 *   tier 1  Junior Handlers  → by JH class sort order, then date
 *   tier 2  NFC / no class    → last, by date
 * JH classes carry no classNumber and NFC entries carry no classes, so a flat
 * `classNumber ?? sortOrder` sort used to interleave them (BAGSD 2026-06-19).
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { db as dbType } from '@/server/db';
import * as schema from '@/server/db/schema';

type Db = NonNullable<typeof dbType>;

type NumberingClass = {
  classNumber: number | null;
  sortOrder: number | null;
  classDefinition: { type: string | null } | null;
} | null;

export type NumberingEntry = {
  id: string;
  /** Null for Junior Handler entries, which have no dog. */
  dogId: string | null;
  isNfc: boolean | null;
  entryDate: Date | string;
  dog: {
    sex: string | null;
    breed: { name: string | null; group: { sortOrder: number | null } | null } | null;
  } | null;
  entryClasses: { showClass: NumberingClass }[];
};

const BIG = 1_000_000_000;
const SEX_ORDER: Record<string, number> = { dog: 0, bitch: 1 };

/** Tier (breed→JH→NFC) + the in-tier class key used to order an entry. */
function catalogueTier(e: NumberingEntry): { tier: number; classKey: number } {
  const classes = e.entryClasses
    .map((ec) => ec.showClass)
    .filter((c): c is NonNullable<NumberingClass> => c != null);
  const jh = classes.filter((c) => c.classDefinition?.type === 'junior_handler');
  const breed = classes.filter((c) => c.classDefinition?.type !== 'junior_handler');

  // NFC dogs (and any entry with no classes) sit at the very end.
  if (e.isNfc || classes.length === 0) return { tier: 2, classKey: 0 };
  // Breed classes win the tier even if an entry somehow also holds a JH class.
  if (breed.length > 0) {
    return { tier: 0, classKey: Math.min(...breed.map((c) => c.classNumber ?? c.sortOrder ?? BIG)) };
  }
  // Pure Junior Handler entries (no dog) — ordered by their class sort order.
  return { tier: 1, classKey: Math.min(...jh.map((c) => c.sortOrder ?? BIG)) };
}

/** The canonical catalogue order. Stable, pure — reused by every numbering path. */
export function sortForCatalogue<T extends NumberingEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const ka = catalogueTier(a);
    const kb = catalogueTier(b);
    if (ka.tier !== kb.tier) return ka.tier - kb.tier;
    if (ka.classKey !== kb.classKey) return ka.classKey - kb.classKey;

    const ag = a.dog?.breed?.group?.sortOrder ?? 99;
    const bg = b.dog?.breed?.group?.sortOrder ?? 99;
    if (ag !== bg) return ag - bg;

    const ab = a.dog?.breed?.name ?? '';
    const bb = b.dog?.breed?.name ?? '';
    if (ab !== bb) return ab.localeCompare(bb);

    const as = a.dog?.sex ? SEX_ORDER[a.dog.sex] ?? 2 : 2;
    const bs = b.dog?.sex ? SEX_ORDER[b.dog.sex] ?? 2 : 2;
    if (as !== bs) return as - bs;

    return new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
  });
}

const NUMBERING_WITH = {
  dog: { with: { breed: { with: { group: true } } } },
  entryClasses: { with: { showClass: { with: { classDefinition: true } } } },
} as const;

async function fetchConfirmed(db: Db, showId: string) {
  return db.query.entries.findMany({
    where: and(
      eq(schema.entries.showId, showId),
      eq(schema.entries.status, 'confirmed'),
      isNull(schema.entries.deletedAt),
    ),
    with: NUMBERING_WITH,
    orderBy: [asc(schema.entries.entryDate)],
  });
}

/**
 * Number the ordered entries 1..N, but ONE NUMBER PER DOG.
 *
 * Mandy, 2026-07-27: "they should always keep the same catalogue number
 * throughout the show." A dog can hold two entry rows — buy a class, come back
 * later and buy a Special Award Class, and the second purchase creates its own
 * entry. Numbering per row gave that dog two numbers, so it printed twice as if
 * it were two dogs and the handler wouldn't know which number to wear.
 *
 * The dog takes the number of its FIRST appearance in catalogue order (its
 * earliest class), and later rows reuse it. The counter only advances when a
 * number is actually issued, so the sequence stays 1..N with no gaps. Junior
 * Handler entries carry no dog and are always numbered individually.
 */
function assignNumbers(ordered: NumberingEntry[]): { id: string; number: string }[] {
  const numberByDog = new Map<string, string>();
  const assignments: { id: string; number: string }[] = [];
  let next = 1;

  for (const e of ordered) {
    const existing = e.dogId ? numberByDog.get(e.dogId) : undefined;
    if (existing) {
      assignments.push({ id: e.id, number: existing });
      continue;
    }
    const number = String(next++);
    if (e.dogId) numberByDog.set(e.dogId, number);
    assignments.push({ id: e.id, number });
  }
  return assignments;
}

async function writeSequential(db: Db, ordered: NumberingEntry[]) {
  const assignments = assignNumbers(ordered);
  await db.transaction(async (tx) => {
    for (const a of assignments) {
      await tx
        .update(schema.entries)
        .set({ catalogueNumber: a.number, updatedAt: new Date() })
        .where(eq(schema.entries.id, a.id));
    }
  });
}

/**
 * Full re-sort: renumber every confirmed entry 1..N in catalogue order. Safe to
 * call while numbers are PROVISIONAL (show not locked). Callers that must not
 * shift a locked catalogue should check `shows.catalogueNumbersLockedAt` first.
 */
export async function resortCatalogueNumbers(db: Db, showId: string): Promise<{ assigned: number }> {
  const confirmed = await fetchConfirmed(db, showId);
  if (confirmed.length === 0) return { assigned: 0 };
  const ordered = sortForCatalogue(confirmed as unknown as NumberingEntry[]);
  await writeSequential(db, ordered);
  return { assigned: ordered.length };
}

/**
 * Number the confirmed entries that don't have a number yet, appending them at
 * max+1 in catalogue order. Existing numbers never move.
 *
 * Dog-aware, same rule as the full re-sort: if the dog already holds a number
 * on another entry, this row joins it rather than taking a new one. Otherwise
 * buying a Special Award Class on a locked show would hand the dog a second
 * number — the very thing the numbering is meant to prevent.
 */
async function appendMissingNumbers(db: Db, showId: string): Promise<{ assigned: number }> {
  const confirmed = await fetchConfirmed(db, showId);
  const unnumbered = confirmed.filter((e) => e.catalogueNumber == null);
  if (unnumbered.length === 0) return { assigned: 0 };

  const highest = confirmed.reduce((max, e) => {
    const n = Number(e.catalogueNumber);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  // Numbers already held, by dog — a late row for one of these joins it.
  const numberByDog = new Map<string, string>();
  for (const e of confirmed) {
    if (e.dogId && e.catalogueNumber != null && !numberByDog.has(e.dogId)) {
      numberByDog.set(e.dogId, e.catalogueNumber);
    }
  }

  const ordered = sortForCatalogue(unnumbered as unknown as NumberingEntry[]);
  let next = highest + 1;
  const assignments = ordered.map((e) => {
    const existing = e.dogId ? numberByDog.get(e.dogId) : undefined;
    if (existing) return { id: e.id, number: existing };
    const number = String(next++);
    if (e.dogId) numberByDog.set(e.dogId, number);
    return { id: e.id, number };
  });

  await db.transaction(async (tx) => {
    for (const a of assignments) {
      await tx
        .update(schema.entries)
        .set({ catalogueNumber: a.number, updatedAt: new Date() })
        .where(eq(schema.entries.id, a.id));
    }
  });
  return { assigned: assignments.length };
}

/**
 * Bring a show's catalogue numbers in line with its confirmed entries. The one
 * entry point every caller should use — it picks the right phase so no
 * confirmed entry is ever left without a number.
 *
 *   provisional + allowResort → full class-order re-sort
 *   locked, or allowResort=false → append the blanks at max+1, shift nothing
 *
 * `allowResort` is false on render paths (catalogue, judges book, ring numbers,
 * reports): opening a document must never renumber a show mid-print, but it
 * must not print a blank number either. The authoritative re-sort happens when
 * an entry is confirmed and when entries close.
 */
export async function syncCatalogueNumbers(
  db: Db,
  showId: string,
  { allowResort = true }: { allowResort?: boolean } = {},
): Promise<{ assigned: number }> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    columns: { catalogueNumbersLockedAt: true },
  });
  const locked = show?.catalogueNumbersLockedAt != null;

  if (!locked && allowResort) return resortCatalogueNumbers(db, showId);
  return appendMissingNumbers(db, showId);
}
