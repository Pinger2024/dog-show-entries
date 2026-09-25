import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { orders, payments } from '@/server/db/schema';
import type { Database } from '@/server/db';
import { computeShowMetrics } from './show-metrics';
import { computeSettlementItemisation, type SettlementItemisation } from './settlement-itemisation';

/**
 * Cross-checks the two money computations behind a club settlement statement
 * so a divergence between them is caught BEFORE a statement issues, not
 * discovered by a club three weeks later (GSD Club of Scotland,
 * INV-GSD-CLUB-OF-SCOTLAND-0001, 19 Aug 2026 — the itemisation's "Refunds to
 * exhibitors" line double-counted a refund that `computeShowMetrics` had
 * already excluded upstream, under-settling the club by £52.51 with nothing
 * to catch it).
 *
 * Three independent checks, all must agree:
 *  1. `computeShowMetrics().clubReceivablePence` (entry/sundry/donation
 *     component sums, net of refunds) vs the itemisation's
 *     `viaRemi.totalPence` (the same money, itemised — this is the figure
 *     that becomes `via_remi_total_pence` on the invoice, see
 *     admin-invoices.ts `issueInvoiceRow`).
 *  2. The itemisation's `cardFeeTotalPence` vs an independently-scoped sum of
 *     `payments.fee_pence` on the paid orders' *initial* payments only (the
 *     existing query has no `type` filter at all).
 *  3. What Stripe actually captured — `payments.amount` on the paid orders'
 *     initial payments, less Remi's platform fee and the itemisation's own
 *     refund line — vs `viaRemi.totalPence` again, this time validated
 *     against the RAW charge amounts rather than our entry/sundry bookkeeping.
 *
 * One known, EXPLAINED difference between (1)'s two sides is carved out
 * rather than flagged as a bug: `computeShowMetrics` has no concept of an
 * order-level discount (a manually-adjusted order whose components sum to
 * more than `orders.total_amount`) — the itemisation does, and shows it as
 * its own "Multi-dog package discount" credit line. That gap is real,
 * understood, and already visible on the statement, so it is subtracted out
 * before comparing rather than tripping the guard — see `discountGapPence`.
 */

export type SettlementReconciliationLine = {
  label: string;
  amountPence: number;
};

export type SettlementReconciliation = {
  /** computeShowMetrics(showId).clubReceivablePence */
  metricsPence: number;
  /** settlement.viaRemi.totalPence — becomes via_remi_total_pence on the invoice */
  itemisedPence: number;
  /**
   * Known, itemised order-level discount gap (see module doc) — subtracted
   * from metricsPence before comparing, never hidden: always surfaced in
   * `lines` when non-zero.
   */
  discountGapPence: number;
  /** itemisedPence - (metricsPence - discountGapPence) — zero means checks reconcile. */
  deltaPence: number;
  /** settlement.cardFeeTotalPence */
  cardFeeItemisedPence: number;
  /** Independent sum(payments.fee_pence) on the paid orders' initial payments. */
  cardFeeIndependentPence: number;
  cardFeeDeltaPence: number;
  /** sum(payments.amount) on paid orders' initial payments, orders with a Stripe intent. */
  stripeGrossPence: number;
  /** sum(orders.platform_fee_pence) over the same paid, online-order population. */
  stripePlatformFeePence: number;
  /** Magnitude of the itemisation's own "Refunds to exhibitors" viaRemi line. */
  refundedItemisedPence: number;
  /** stripeGrossPence - stripePlatformFeePence - refundedItemisedPence. */
  stripeCollectedPence: number;
  stripeDeltaPence: number;
  /** Paid, online, initial payments still missing captured fee_pence after the heal — must be zero to issue. */
  missingFeeCount: number;
  ok: boolean;
  lines: SettlementReconciliationLine[];
};

function money(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return `${sign}£${(abs / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function reconcileSettlement(
  db: Database,
  showId: string,
  settlement?: SettlementItemisation,
): Promise<SettlementReconciliation> {
  const itemisation =
    settlement ??
    (await computeSettlementItemisation(db, showId, {
      packageFeePence: 0,
      packageFeeDescription: 'Reconciliation check',
      discount: { mode: 'fixed', value: 0, label: 'none' },
    }));
  const metrics = await computeShowMetrics(db, showId);

  const metricsPence = metrics.clubReceivablePence;
  const itemisedPence = itemisation.viaRemi.totalPence;

  const discountGapPence = itemisation.viaRemi.lines
    .filter((l) => l.label === 'Multi-dog package discount')
    .reduce((sum, l) => sum + Math.abs(l.amountPence), 0);
  const deltaPence = itemisedPence - (metricsPence - discountGapPence);

  // Paid orders with a Stripe intent — the "online" population both the
  // card-fee and gross-charged cross-checks scope to.
  const paidOnlineOrders = and(eq(orders.showId, showId), eq(orders.status, 'paid'), isNotNull(orders.stripePaymentIntentId));

  const [cardFeeRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${payments.feePence}), 0)::int` })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(and(eq(orders.showId, showId), eq(orders.status, 'paid'), eq(payments.type, 'initial')));
  const cardFeeIndependentPence = cardFeeRow?.total ?? 0;
  const cardFeeItemisedPence = itemisation.cardFeeTotalPence;
  const cardFeeDeltaPence = cardFeeItemisedPence - cardFeeIndependentPence;

  const [stripeRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)::int` })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(and(paidOnlineOrders, eq(payments.type, 'initial')));
  const stripeGrossPence = stripeRow?.total ?? 0;

  const [platformFeeRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${orders.platformFeePence}), 0)::int` })
    .from(orders)
    .where(paidOnlineOrders);
  const stripePlatformFeePence = platformFeeRow?.total ?? 0;

  const refundedItemisedPence = itemisation.viaRemi.lines
    .filter((l) => l.label === 'Refunds to exhibitors')
    .reduce((sum, l) => sum + Math.abs(l.amountPence), 0);

  const stripeCollectedPence = stripeGrossPence - stripePlatformFeePence - refundedItemisedPence;
  const stripeDeltaPence = itemisedPence - stripeCollectedPence;

  const [missingRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(and(paidOnlineOrders, eq(payments.type, 'initial'), isNull(payments.feePence)));
  const missingFeeCount = missingRow?.count ?? 0;

  const ok = deltaPence === 0 && cardFeeDeltaPence === 0 && stripeDeltaPence === 0 && missingFeeCount === 0;

  const lines: SettlementReconciliationLine[] = [
    { label: 'Money collected by Remi (itemisation)', amountPence: itemisedPence },
    { label: 'Club receivable (show metrics)', amountPence: metricsPence },
    ...(discountGapPence > 0
      ? [{ label: 'Less: order-level discount (not modelled by show metrics)', amountPence: -discountGapPence }]
      : []),
    { label: 'Card processing fee (itemisation)', amountPence: cardFeeItemisedPence },
    { label: 'Card processing fee (Stripe fee_pence, independent)', amountPence: cardFeeIndependentPence },
    { label: 'Stripe gross charged, less platform fee and refunds (independent)', amountPence: stripeCollectedPence },
  ];

  return {
    metricsPence,
    itemisedPence,
    discountGapPence,
    deltaPence,
    cardFeeItemisedPence,
    cardFeeIndependentPence,
    cardFeeDeltaPence,
    stripeGrossPence,
    stripePlatformFeePence,
    refundedItemisedPence,
    stripeCollectedPence,
    stripeDeltaPence,
    missingFeeCount,
    ok,
    lines,
  };
}

/** Plain-words explanation of why a settlement won't reconcile — used both in the refusal error and (trimmed) on the admin preview page. */
export function describeReconciliationMismatch(r: SettlementReconciliation): string {
  const parts: string[] = [];
  if (r.deltaPence !== 0) {
    parts.push(
      `Money collected by Remi (${money(r.itemisedPence)}) does not match the club receivable figure ` +
        `(${money(r.metricsPence)}${r.discountGapPence > 0 ? `, less ${money(r.discountGapPence)} order discount` : ''}) — ` +
        `difference ${money(r.deltaPence)}.`,
    );
  }
  if (r.cardFeeDeltaPence !== 0) {
    parts.push(
      `Card processing fee on the statement (${money(r.cardFeeItemisedPence)}) does not match Stripe's captured fees ` +
        `(${money(r.cardFeeIndependentPence)}) — difference ${money(r.cardFeeDeltaPence)}.`,
    );
  }
  if (r.stripeDeltaPence !== 0) {
    parts.push(
      `Stripe's captured gross, less platform fee and refunds (${money(r.stripeCollectedPence)}), does not match ` +
        `Money collected by Remi (${money(r.itemisedPence)}) — difference ${money(r.stripeDeltaPence)}.`,
    );
  }
  if (r.missingFeeCount > 0) {
    parts.push(
      `${r.missingFeeCount} card payment${r.missingFeeCount === 1 ? '' : 's'} on this show still have no captured Stripe fee.`,
    );
  }
  return parts.join(' ');
}
