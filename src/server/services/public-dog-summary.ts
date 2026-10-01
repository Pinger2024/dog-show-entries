import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { dogs, entries } from '@/server/db/schema';
import { hasPublicHistory, publicHistoryCounts } from '@/lib/public-dog-history';

/**
 * The public, crawler-facing view of a dog's show record — what its link
 * preview text, its share image and the sitemap may say. Nobody is signed in
 * for these, so the rule is always the public one in lib/public-dog-history.ts.
 *
 * Mandy, 1 Oct 2026: Rosebud Edie of Hundark's link preview said "6 shows
 * entered" and her share image "6 Shows" — the page metadata and the image
 * each counted every confirmed entry, so her Midlands and North Eastern
 * entries (both still to come) were in the number. Both now call this.
 */

const ENTRY_HISTORY_INCLUDE = {
  show: { columns: { startDate: true, endDate: true } },
  entryClasses: {
    columns: { id: true },
    with: { result: { columns: { publishedAt: true, placement: true, specialAward: true } } },
  },
} as const;

/** "N shows · N × 1st · N awards" for one dog, counting only what the public may see. */
export async function getPublicDogSummary(
  db: Database,
  dogId: string,
): Promise<{ shows: number; firsts: number; specialAwards: number }> {
  const dogEntries = await db.query.entries.findMany({
    where: and(eq(entries.dogId, dogId), eq(entries.status, 'confirmed'), isNull(entries.deletedAt)),
    columns: { id: true },
    with: ENTRY_HISTORY_INCLUDE,
  });
  return publicHistoryCounts(dogEntries);
}

/** Every dog the public has something to see for — the sitemap's dog pages. */
export async function listDogsWithPublicHistory(
  db: Database,
): Promise<Array<{ id: string; updatedAt: Date | null }>> {
  const dogEntries = await db.query.entries.findMany({
    where: and(eq(entries.status, 'confirmed'), isNull(entries.deletedAt)),
    columns: { dogId: true },
    with: ENTRY_HISTORY_INCLUDE,
  });

  const byDog = new Map<string, typeof dogEntries>();
  for (const entry of dogEntries) {
    if (!entry.dogId) continue;
    const list = byDog.get(entry.dogId) ?? [];
    list.push(entry);
    byDog.set(entry.dogId, list);
  }
  const publicDogIds = [...byDog].filter(([, list]) => hasPublicHistory(list)).map(([id]) => id);
  if (publicDogIds.length === 0) return [];

  return db
    .select({ id: dogs.id, updatedAt: dogs.updatedAt })
    .from(dogs)
    .where(and(inArray(dogs.id, publicDogIds), isNull(dogs.deletedAt)));
}
