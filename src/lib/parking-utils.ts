import { eq } from 'drizzle-orm';
import { orderSundryItems, sundryItems } from '@/server/db/schema';
import type { Database } from '@/server/db';

/**
 * SQL ILIKE-style substring patterns used as a coarse DB-level pre-filter
 * when scanning for parking sundry items across many orders (see the
 * week-before cron branch in `src/app/api/cron/route.ts`). ILIKE has no
 * word-boundary support, so a name like "Sparking Wine" would still pass
 * this filter — callers MUST re-check every candidate with
 * `isParkingSundry()` (the authoritative, word-boundary-safe matcher) before
 * ever treating an order as a genuine parking-pass purchase. Never trust
 * this pattern alone to decide whether to send/render a pass.
 */
export const PARKING_NAME_PATTERNS = ['%parking%', '%car%pass%'] as const;

/**
 * Word-boundary, case-insensitive check for whether a sundry item name
 * refers to a parking pass — the ONE authoritative matcher (client-side
 * equivalent of `PARKING_NAME_PATTERNS`, but correct where ILIKE isn't).
 * "Sparking Wine" contains the substring "parking" but must NOT match —
 * clubs are free to sell an actual sparkling wine sundry alongside a
 * parking pass without the two being confused.
 */
export function isParkingSundry(name: string): boolean {
  return /\bparking\b/i.test(name) || /\bcar\s*pass\b/i.test(name);
}

/**
 * Total quantity of parking-pass sundry items purchased on an order, or 0 if
 * none. Fetches the order's own sundry lines (always a small per-order set)
 * and filters with the authoritative `isParkingSundry()` rather than relying
 * on the coarse SQL pattern above — the single source of truth shared by the
 * download route, the email sender, and the cron branch.
 */
export async function getOrderParkingPassQuantity(
  db: Database,
  orderId: string
): Promise<number> {
  const rows = await db
    .select({ quantity: orderSundryItems.quantity, name: sundryItems.name })
    .from(orderSundryItems)
    .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
    .where(eq(orderSundryItems.orderId, orderId));

  return rows
    .filter((r) => isParkingSundry(r.name))
    .reduce((sum, r) => sum + r.quantity, 0);
}
