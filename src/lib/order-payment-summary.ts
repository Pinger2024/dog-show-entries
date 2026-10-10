/**
 * One rule for reading an order's money state off its payments rows.
 *
 * An order's `payments` relation holds CHARGE rows (type 'initial', running
 * `refundAmount` + status succeeded → partially_refunded → refunded) AND
 * REFUND rows (type 'refund', one per refund issued, amount = that refund).
 * The relation loads UNORDERED — after the first partial refund on a real
 * order (31 Aug 2026), the Financial page's find() matched the refund row
 * first and showed "Refund entire order (£2.00)" for an order with £21.73
 * still refundable, while the server would have refunded the true remaining.
 * A money label must never depend on heap order: always read the CHARGE row.
 */

export interface PaymentRowLike {
  type: string;
  status: string;
  amount: number;
  refundAmount: number | null;
  stripePaymentId: string | null;
}

/** The order's settled charge row — never a refund row. Includes status
 *  'refunded' deliberately, so a fully-refunded order still reports what
 *  was originally paid. */
export function chargePayment<T extends PaymentRowLike>(payments: T[]): T | undefined {
  return payments.find(
    (p) =>
      p.type !== 'refund' &&
      (p.status === 'succeeded' || p.status === 'partially_refunded' || p.status === 'refunded'),
  );
}

export interface OrderPaymentSummary {
  /** What the exhibitor actually paid (charge amount, incl. platform fee). */
  paid: number;
  /** Running total already refunded. */
  refunded: number;
  /** What a "refund entire order" would return now. */
  remaining: number;
  /** True only when something was paid AND nothing remains. */
  fullyRefunded: boolean;
  /** Only orders with a real Stripe charge can be refunded via Stripe. */
  hasRefundablePayment: boolean;
}

export function orderPaymentSummary(
  payments: PaymentRowLike[],
  /** Fallback "paid" when no charge row exists (e.g. legacy data): typically
   *  order.totalAmount + order.platformFeePence, or 0. */
  fallbackPaid: number,
): OrderPaymentSummary {
  const charge = chargePayment(payments);
  const paid = charge?.amount ?? fallbackPaid;
  const refunded = charge?.refundAmount ?? 0;
  const remaining = paid - refunded;
  return {
    paid,
    refunded,
    remaining,
    // A £0 order (e.g. a free Junior Handler entry) has paid === 0, which
    // would make remaining <= 0 trivially true and wrongly show "Fully
    // refunded" (guard carried over from the Financial page).
    fullyRefunded: paid > 0 && remaining <= 0,
    hasRefundablePayment: !!charge?.stripePaymentId,
  };
}
