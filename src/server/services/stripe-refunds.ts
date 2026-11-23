import { eq, sql } from 'drizzle-orm';
import { orders, payments } from '@/server/db/schema';
import type { Database } from '@/server/db';
import { getStripe } from './stripe';

/**
 * Executes a Stripe refund against an existing succeeded/partially_refunded
 * payment row, records the refund as a new payments row, and updates the
 * original payment's running refund total + status.
 *
 * Shared between `secretary.issueRefund` (entry-level partial refunds) and
 * `secretary.refundOrder` (full-order refunds). The Stripe call happens
 * BEFORE the DB writes — if the DB fails after Stripe succeeds, the
 * exhibitor gets their money but our books don't know. Known pre-existing
 * risk; we'd reconcile from the Stripe dashboard. Reversing the order
 * would instead risk recording a refund that never happened at Stripe.
 */
export async function executeStripeRefund(
  db: Database,
  originalPayment: {
    id: string;
    stripePaymentId: string | null;
    orderId: string | null;
    amount: number;
    refundAmount: number | null;
  },
  opts: {
    amountPence: number;
    reason?: string;
    /** Attach the refund row to a specific entry (for entry-fee partial refunds). */
    entryId?: string;
  }
): Promise<{ amount: number; fullyRefunded: boolean }> {
  if (!originalPayment.stripePaymentId) {
    throw new Error('Cannot refund a payment with no Stripe payment ID');
  }
  const alreadyRefunded = originalPayment.refundAmount ?? 0;
  const newRefundTotal = alreadyRefunded + opts.amountPence;

  const stripe = getStripe();
  await stripe.refunds.create(
    {
      payment_intent: originalPayment.stripePaymentId,
      amount: opts.amountPence,
      ...(opts.reason ? { reason: 'requested_by_customer' as const } : {}),
    },
    {
      // If the request times out but actually landed at Stripe, a retry with
      // the same key returns the original refund instead of refunding twice.
      // Keyed on payment + running total so a *deliberate* second partial
      // refund (different running total) still goes through.
      idempotencyKey: `refund:${originalPayment.id}:${newRefundTotal}`,
    }
  );

  await db.insert(payments).values({
    entryId: opts.entryId ?? null,
    orderId: originalPayment.orderId,
    stripePaymentId: originalPayment.stripePaymentId,
    amount: opts.amountPence,
    status: 'refunded',
    type: 'refund',
    // Stripe does NOT return the processing fee on refund — the fee stays
    // charged to us either way, so there is no fee to record here.
    feePence: 0,
    // Negative so SUM(netPence) across a show's payment rows reconciles to
    // Stripe's true net position. We deliberately do NOT touch the original
    // payment's netPence: on a partially-refunded payment, the original
    // row's netPence still shows the FULL charge net, which overstates kept
    // revenue once you also know money went back out — Stripe keeps the
    // full original fee regardless. Any margin/reconciliation report MUST
    // read the refund rows too, not just the original payment row.
    netPence: -opts.amountPence,
  });

  // One atomic statement for both the running total and the status —
  // SET expressions all read the pre-update row, so two concurrent partial
  // refunds each land in the total, and neither can clobber the other's
  // status (a split increment-then-set-status pair could interleave).
  const [updated] = await db
    .update(payments)
    .set({
      refundAmount: sql`COALESCE(${payments.refundAmount}, 0) + ${opts.amountPence}`,
      status: sql`(CASE WHEN COALESCE(${payments.refundAmount}, 0) + ${opts.amountPence} >= ${originalPayment.amount} THEN 'refunded' ELSE 'partially_refunded' END)::payment_status`,
    })
    .where(eq(payments.id, originalPayment.id))
    .returning({ refundAmount: payments.refundAmount });

  const fullyRefunded = (updated?.refundAmount ?? newRefundTotal) >= originalPayment.amount;

  // Flip the order itself to 'refunded' once the payment is fully refunded,
  // so every downstream count (catalogues to print, entries to include, club
  // receivable) naturally excludes it. Partial refunds leave the order in
  // 'paid' — only the refund amount is tracked at the payment row.
  if (fullyRefunded && originalPayment.orderId) {
    await db
      .update(orders)
      .set({ status: 'refunded' })
      .where(eq(orders.id, originalPayment.orderId));
  }

  return { amount: opts.amountPence, fullyRefunded };
}
