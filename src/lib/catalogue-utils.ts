import { and, eq, ilike } from 'drizzle-orm';
import { orders, orderSundryItems, sundryItems } from '@/server/db/schema';
import type { Database } from '@/server/db';

/** SQL ILIKE pattern for matching catalogue sundry items by name */
export const CATALOGUE_NAME_PATTERN = '%catalogue%';

/** Check if a sundry item name refers to a catalogue (client-side equivalent of CATALOGUE_NAME_PATTERN) */
export function isCatalogueItem(name: string): boolean {
  return name.toLowerCase().includes('catalogue');
}

/** Show statuses where the catalogue PDF is available to exhibitors */
export const CATALOGUE_AVAILABLE_STATUSES: ReadonlySet<string> = new Set([
  'entries_closed',
  'in_progress',
  'completed',
]);

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
        ilike(sundryItems.name, CATALOGUE_NAME_PATTERN)
      )
    )
    .limit(1);
  return rows.length > 0;
}
