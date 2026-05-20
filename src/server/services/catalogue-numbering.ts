/**
 * Auto-assign catalogue numbers to a show's confirmed entries in
 * class-first order, if (and only if) no numbers have been assigned
 * yet.
 *
 * Amanda's UX spec 2026-04-17: she shouldn't have to click an "Assign
 * numbers" button before downloading a catalogue — the numbers should
 * just be there, in class order, automatically, across every
 * catalogue format (standard, by-class, judging, marked, absentees,
 * judges' book, prize cards, ring numbers).
 *
 * Invariant this helper maintains:
 *   If ANY confirmed entry has a catalogueNumber already, DO NOTHING —
 *   later entries are handled by the append-mode logic in the
 *   secretary.addEntry mutation (so existing numbers never shift out
 *   from under a printed catalogue).
 *
 *   If NO confirmed entry has a catalogueNumber, run the full
 *   class-first sort (lowest class number → group → breed → sex →
 *   entry date) and assign 1..N.
 *
 * Safe to call on every catalogue render — it's a single indexed query
 * in the common case where numbers already exist.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { db as dbType } from '@/server/db';
import * as schema from '@/server/db/schema';

type Db = NonNullable<typeof dbType>;

export async function ensureCatalogueNumbers(db: Db, showId: string): Promise<{ assigned: number }> {
  // Early exit if ANY entry already has a number — append-mode on new
  // entries keeps things in sync from there, and a secretary-triggered
  // re-sort is still available via the assignCatalogueNumbers mutation.
  const alreadyNumbered = await db.query.entries.findFirst({
    where: and(
      eq(schema.entries.showId, showId),
      eq(schema.entries.status, 'confirmed'),
      isNull(schema.entries.deletedAt),
    ),
    columns: { id: true, catalogueNumber: true },
  });
  if (alreadyNumbered?.catalogueNumber != null) {
    return { assigned: 0 };
  }

  const confirmed = await db.query.entries.findMany({
    where: and(
      eq(schema.entries.showId, showId),
      eq(schema.entries.status, 'confirmed'),
      isNull(schema.entries.deletedAt),
    ),
    with: {
      dog: { with: { breed: { with: { group: true } } } },
      entryClasses: { with: { showClass: true } },
    },
    orderBy: [asc(schema.entries.entryDate)],
  });

  if (confirmed.length === 0) return { assigned: 0 };

  const sorted = [...confirmed].sort((a, b) => {
    const aMin = Math.min(
      ...a.entryClasses.map((ec) => ec.showClass?.classNumber ?? ec.showClass?.sortOrder ?? 999),
    );
    const bMin = Math.min(
      ...b.entryClasses.map((ec) => ec.showClass?.classNumber ?? ec.showClass?.sortOrder ?? 999),
    );
    if (aMin !== bMin) return aMin - bMin;

    const aGroup = a.dog?.breed?.group?.sortOrder ?? 99;
    const bGroup = b.dog?.breed?.group?.sortOrder ?? 99;
    if (aGroup !== bGroup) return aGroup - bGroup;

    const aBreed = a.dog?.breed?.name ?? '';
    const bBreed = b.dog?.breed?.name ?? '';
    if (aBreed !== bBreed) return aBreed.localeCompare(bBreed);

    const sexOrder: Record<string, number> = { dog: 0, bitch: 1 };
    const aSex = a.dog?.sex ? sexOrder[a.dog.sex] ?? 2 : 2;
    const bSex = b.dog?.sex ? sexOrder[b.dog.sex] ?? 2 : 2;
    if (aSex !== bSex) return aSex - bSex;

    return new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
  });

  await db.transaction(async (tx) => {
    for (let i = 0; i < sorted.length; i++) {
      await tx
        .update(schema.entries)
        .set({ catalogueNumber: String(i + 1), updatedAt: new Date() })
        .where(eq(schema.entries.id, sorted[i].id));
    }
  });

  return { assigned: sorted.length };
}
