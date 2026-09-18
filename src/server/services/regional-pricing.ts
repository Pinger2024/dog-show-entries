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
 * exclusions below (cancelled, deleted, junior handlers, unsettled orders, the
 * order being re-priced) are the rule, and a second copy of them is a second rule.
 *
 * Already-paid entries are never re-priced — this only affects the dogs being
 * priced now.
 */
import { and, eq, isNull, ne, or, notInArray, inArray, count, type SQL } from 'drizzle-orm';
import type { db as Database } from '@/server/db';
import { entries, orders } from '@/server/db/schema';

/**
 * Paying dogs this exhibitor already has at this show.
 *
 * Counted: confirmed/pending entries in competitive classes whose order has
 * SETTLED (`paid` or `refunded`), plus entries with no order at all.
 * Not counted:
 *  - soft-deleted entries (`deletedAt`),
 *  - cancelled or withdrawn entries — the dog is no longer at the show, so it
 *    must not push the next dog down the scale ('transferred' still counts:
 *    the dog moved class, it did not leave),
 *  - junior-handler entries — they never consume a scale position (see the
 *    engine's `kind: 'junior_handler'` branch),
 *  - entries whose order has NOT settled (`draft`, `pending_payment`,
 *    `failed`, `cancelled`) — `orders.checkout`
 *    (src/server/trpc/routers/orders.ts) sweeps an exhibitor's stale
 *    `pending_payment`/`failed` orders for the show before pricing a new
 *    basket: it soft-deletes their entries and cancels the orders. A dog only
 *    holds a place on the scale if checkout would NOT sweep it away first, so
 *    an unsettled order must not count here either — otherwise the fee
 *    preview and the charge disagree (found on demo: a member's 3rd dog was
 *    quoted £0.00 as a "4th dog" because an abandoned unpaid basket held its
 *    place, then checkout swept that basket and correctly charged £11).
 *    `refunded` still counts: the order went through and the dog WAS at the
 *    show — whether it later left is `entries.status` ('cancelled' /
 *    'withdrawn'), already excluded above, not the order's payment state.
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
    // Only a SETTLED order holds the dog's place — see the doc comment above.
    // No order at all (secretary-created entries, order_id NULL) still counts.
    or(isNull(entries.orderId), inArray(orders.status, ['paid', 'refunded']))!,
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
    .leftJoin(orders, eq(entries.orderId, orders.id))
    .where(and(...conditions));

  return row?.n ?? 0;
}
