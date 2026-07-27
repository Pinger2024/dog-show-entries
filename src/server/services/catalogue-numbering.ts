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

async function writeSequential(db: Db, ordered: { id: string }[]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < ordered.length; i++) {
      await tx
        .update(schema.entries)
        .set({ catalogueNumber: String(i + 1), updatedAt: new Date() })
        .where(eq(schema.entries.id, ordered[i].id));
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
 */
async function appendMissingNumbers(db: Db, showId: string): Promise<{ assigned: number }> {
  const confirmed = await fetchConfirmed(db, showId);
  const unnumbered = confirmed.filter((e) => e.catalogueNumber == null);
  if (unnumbered.length === 0) return { assigned: 0 };

  const highest = confirmed.reduce((max, e) => {
    const n = Number(e.catalogueNumber);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const ordered = sortForCatalogue(unnumbered as unknown as NumberingEntry[]);
  await db.transaction(async (tx) => {
    for (let i = 0; i < ordered.length; i++) {
      await tx
        .update(schema.entries)
        .set({ catalogueNumber: String(highest + 1 + i), updatedAt: new Date() })
        .where(eq(schema.entries.id, ordered[i].id));
    }
  });
  return { assigned: ordered.length };
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
