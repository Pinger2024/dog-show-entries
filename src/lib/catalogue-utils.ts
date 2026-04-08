import { and, eq, ilike } from 'drizzle-orm';
import { orders, orderSundryItems, sundryItems } from '@/server/db/schema';
import type { Database } from '@/server/db';

/** Show statuses where the catalogue PDF is available to exhibitors */
export const CATALOGUE_AVAILABLE_STATUSES = new Set([
  'entries_closed',
  'in_progress',
  'completed',
] as const);

/** Catalogue formats restricted to secretaries/admins — not available to exhibitors */
export const SECRETARY_ONLY_FORMATS = new Set([
  'judging',
  'marked',
  'ringside',
  'absentees',
  'by-breed',
]);

/** Check if a user has a paid order with a catalogue sundry item for a given show */
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
        ilike(sundryItems.name, '%catalogue%')
      )
    )
    .limit(1);
  return rows.length > 0;
}
