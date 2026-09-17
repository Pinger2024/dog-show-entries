/**
 * ONE owner for "how many dogs does this exhibitor already have at this
 * regional show" — the count the tiered scale in `computeRegionalOrderFees`
 * starts from.
 *
 * Why this exists (Mandy 2026-09-16): the regional scale is per EXHIBITOR PER
 * SHOW, not per basket. Before this, every path built the engine's input from
 * the dogs in front of it — the current cart (`orders.checkout`), the siblings
 * of one order (`entries.update`), or a single dog (`secretary.
 * createManualEntry`) — so an exhibitor who entered 2 dogs and came back a
 * week later for a 3rd had that 3rd dog priced as their first: £20 instead of
 * £16, and a 4th charged £20 instead of free.
 *
 * Every path that prices a regional entry MUST call `countPriorRegionalPayingDogs`
 * and pass the result as `priorPayingDogCount`. Do not hand-roll the query: the
 * exclusions below (cancelled, deleted, junior handlers, the order being
 * re-priced) are the rule, and a second copy of them is a second rule.
 *
 * Already-paid entries are never re-priced — this only affects the dogs being
 * priced now.
 */
import { and, eq, isNull, ne, or, notInArray, count, type SQL } from 'drizzle-orm';
import type { db as Database } from '@/server/db';
import { entries } from '@/server/db/schema';

/**
 * Paying dogs this exhibitor already has at this show.
 *
 * Counted: confirmed/pending entries in competitive classes.
 * Not counted:
 *  - soft-deleted entries (`deletedAt`),
 *  - cancelled or withdrawn entries — the dog is no longer at the show, so it
 *    must not push the next dog down the scale ('transferred' still counts:
 *    the dog moved class, it did not leave),
 *  - junior-handler entries — they never consume a scale position (see the
 *    engine's `kind: 'junior_handler'` branch),
 *  - entries belonging to `excludeOrderId`, used when re-pricing that order so
 *    its own dogs are not counted twice.
 */
export async function countPriorRegionalPayingDogs(
  database: typeof Database,
  params: {
    showId: string;
    exhibitorId: string;
    /** Order being re-priced — its own entries must not count as prior. */
    excludeOrderId?: string | null;
  },
): Promise<number> {
  const conditions: SQL[] = [
    eq(entries.showId, params.showId),
    eq(entries.exhibitorId, params.exhibitorId),
    isNull(entries.deletedAt),
    // 'cancelled' and 'withdrawn' dogs are not at the show, so they must not
    // push the next dog down the scale. 'transferred' (moved class) still is.
    notInArray(entries.status, ['cancelled', 'withdrawn']),
    ne(entries.entryType, 'junior_handler'),
  ];

  if (params.excludeOrderId) {
    // A confirmed entry can carry NO order at all (project_club_settlement_statement
    // — secretary-created entries with order_id NULL), and `orderId != x` is NULL,
    // not true, for those rows — so they would silently vanish from the count and
    // under-price the next dog. Keep them explicitly.
    conditions.push(
      or(isNull(entries.orderId), ne(entries.orderId, params.excludeOrderId))!,
    );
  }

  const [row] = await database
    .select({ n: count() })
    .from(entries)
    .where(and(...conditions));

  return row?.n ?? 0;
}
