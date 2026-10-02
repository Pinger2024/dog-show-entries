/**
 * ONE owner for "what does buying extras (sundry items) on an already-paid
 * order cost" — the add-extras-to-entry feature (design doc, 2026-09-21).
 *
 * Mirrors `entry-change-pricing.ts` (the class-change top-up owner): this
 * function performs every read and every check `orders.addExtras` needs, and
 * NO writes at all. `orders.previewExtras` calls it for a read-only preview;
 * `orders.addExtras` calls it and then does the writes (apply free items
 * immediately, or stage a PaymentIntent and defer, exactly as the class-change
 * top-up defers an upgrade until payment succeeds).
 *
 * Sundry validation (existence / show-membership / enabled / maxPerOrder) has
 * its own ONE owner, `validateSundrySelection` — this function does not
 * re-implement any of those rules, it just supplies the order's already-
 * purchased quantities so the cap is judged on existing + requested.
 */
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import type { db as Database } from '@/server/db';
import { orders } from '@/server/db/schema';
import {
  validateSundrySelection,
  sundryViolationError,
  type SundrySelectionInput,
  type ValidatedSundryItem,
} from '@/server/services/sundry-selection';
import { calculatePlatformFee } from '@/lib/fee-calc';
import { entryWindowOpen } from '@/lib/show-status';

export type OrderExtrasPricing = {
  /** The order as loaded (show, existing orderSundryItems) — reuse, don't re-fetch. */
  order: NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
  lines: ValidatedSundryItem[];
  subtotalPence: number;
  platformFeePence: number;
  grossPence: number;
  requiresPayment: boolean;
};

async function loadOrder(database: typeof Database, orderId: string) {
  return database.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: {
      show: true,
      orderSundryItems: true,
    },
  });
}

/**
 * Price a set of extras against an existing, already-paid order.
 *
 * Throws the same authorisation / validation errors `addExtras` always
 * throws — `previewExtras` must surface identical errors, so those checks
 * live here rather than being re-typed at each call site.
 */
export async function priceOrderExtras(
  database: typeof Database,
  params: { orderId: string; userId: string; items: SundrySelectionInput[] },
): Promise<OrderExtrasPricing> {
  const { orderId, userId, items } = params;

  const order = await loadOrder(database, orderId);

  if (!order) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  if (order.exhibitorId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your order' });
  }

  // v1 deliberately requires the order to be fully paid (see the design
  // doc's "Explicitly NOT in v1" — a pending_payment order has no confirmed
  // money to attach extras to, and an offline/cash order can't be told apart
  // from a card order at the ORDER level, which would corrupt show-metrics'
  // offline attribution if extras were paid by card on top of it).
  if (order.status !== 'paid') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'This order has not been paid yet — extras can only be added to a confirmed entry.',
    });
  }

  // Offline orders (secretary-recorded postal/cash/BACS — `stripePaymentIntentId`
  // IS NULL, which is exactly how show-metrics tells "the club already holds
  // this money" from "Remi holds it") cannot take CARD extras: the order would
  // still read as offline, so the card money would be attributed to the club
  // as cash and never settled. Until offline-ness is keyed per PAYMENT, these
  // exhibitors pay the secretary directly (design doc, "NOT in v1").
  if (!order.stripePaymentIntentId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'This entry was paid directly to the club, so extras can\'t be added online — please contact the show secretary.',
    });
  }

  if (!entryWindowOpen(order.show)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Entries for this show have closed',
    });
  }

  if (items.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Select at least one extra' });
  }

  const alreadyOnOrder = new Map<string, number>();
  for (const osi of order.orderSundryItems) {
    alreadyOnOrder.set(
      osi.sundryItemId,
      (alreadyOnOrder.get(osi.sundryItemId) ?? 0) + osi.quantity,
    );
  }

  const selection = await validateSundrySelection(database, {
    showId: order.showId,
    items,
    alreadyOnOrder,
  });

  const firstViolation = selection.violations[0];
  if (firstViolation) {
    throw sundryViolationError(firstViolation);
  }

  const subtotalPence = selection.items.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity,
    0,
  );
  const platformFeePence = subtotalPence === 0 ? 0 : calculatePlatformFee(subtotalPence);
  const grossPence = subtotalPence + platformFeePence;

  return {
    order,
    lines: selection.items,
    subtotalPence,
    platformFeePence,
    grossPence,
    requiresPayment: grossPence > 0,
  };
}
