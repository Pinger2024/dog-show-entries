import { and, eq, inArray } from 'drizzle-orm';
import { ONLINE_CATALOGUE_ACCESS_KINDS } from '@/lib/sundry-kind';
import { orders, orderSundryItems, sundryItems } from '@/server/db/schema';
import type { Database } from '@/server/db';

/** Show statuses where the catalogue PDF is available to exhibitors */
export const CATALOGUE_AVAILABLE_STATUSES: ReadonlySet<string> = new Set([
  'entries_closed',
  'in_progress',
  'completed',
]);

/** Catalogue formats restricted to secretaries/admins — not available to exhibitors.
 *  Note: `by-breed` is not a valid route format — the CatalogueByBreed component is
 *  rendered via the `by-class` format for all-breed shows. Exhibitor-accessible formats:
 *  standard, by-class, alphabetical. */
export const SECRETARY_ONLY_FORMATS = new Set([
  'judging',
  'marked',
  'ringside',
  'absentees',
  // The judge's post-results keepsake copy — carries real placements/grades
  // per dog, so it must never be exhibitor-reachable (Mandy 2026-09-05,
  // regionals only).
  'judge-copy',
]);

/** Check if a user has a paid order with a catalogue-access sundry item for a given show
 *  (kind decided by the secretary - see lib/sundry-kind.ts). */
export async function hasUserPurchasedCatalogue(
  db: Database,
  showId: string,
  userId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: orderSundryItems.id })
    .from(orderSundryItems)
    .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
    .innerJoin(orders, eq(orderSundryItems.orderId, orders.id))
    .where(
      and(
        eq(orders.showId, showId),
        eq(orders.exhibitorId, userId),
        eq(orders.status, 'paid'),
        inArray(sundryItems.kind, [...ONLINE_CATALOGUE_ACCESS_KINDS])
      )
    )
    .limit(1);
  return rows.length > 0;
}
