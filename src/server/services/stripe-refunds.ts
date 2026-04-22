import { eq } from 'drizzle-orm';
import { payments } from '@/server/db/schema';
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
  const fullyRefunded = newRefundTotal >= originalPayment.amount;

  const stripe = getStripe();
  await stripe.refunds.create({
    payment_intent: originalPayment.stripePaymentId,
    amount: opts.amountPence,
    ...(opts.reason ? { reason: 'requested_by_customer' as const } : {}),
  });

  await db.insert(payments).values({
    entryId: opts.entryId ?? null,
    orderId: originalPayment.orderId,
    stripePaymentId: originalPayment.stripePaymentId,
    amount: opts.amountPence,
    status: 'refunded',
    type: 'refund',
  });

  await db
    .update(payments)
    .set({
      refundAmount: newRefundTotal,
      status: fullyRefunded ? 'refunded' : 'partially_refunded',
    })
    .where(eq(payments.id, originalPayment.id));

  return { amount: opts.amountPence, fullyRefunded };
}
