import { and, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { orders, payments } from '@/server/db/schema';
import { getStripe } from '@/server/services/stripe';
import type Stripe from 'stripe';

/**
 * Self-healing Stripe fee capture. The webhook (`captureStripeFeeDetails` in
 * src/app/api/webhooks/stripe/route.ts) captures feePence/netPence/
 * balanceTransactionId/cardBrand/cardCountry live, per payment, the moment a
 * PaymentIntent succeeds — but it's best-effort and can miss (e.g. prod logged
 * "no balance_transaction for PI … yet; skipping fee capture" on EVERY capture
 * since 2026-07-28, leaving ~141 payment rows with NULL fees and understating
 * card fees on every club settlement). `scripts/backfill-stripe-fees.ts` is
 * the one-off manual fix; this module is the durable one — it re-derives the
 * SAME gap and heals it server-side whenever settlement figures are computed
 * (see admin-invoices.ts), so a secretary never has to wait on a human to run
 * a script.
 *
 * `captureFeeForPaymentIntent` below is the SAME retrieval+write core the
 * webhook uses (extracted here so there is exactly one implementation of
 * "fetch the balance transaction and write the fee fields") — prod's key
 * lives in Render env — healing runs server-side so the key never leaves the
 * platform (Michael 2026-08-18).
 */

/** Sequential, gentle pacing between Stripe API calls — stay well under rate limits. */
export const DEFAULT_HEAL_SPACING_MS = 150;
/** An admin viewing an invoice must not trigger an unbounded sweep. */
export const DEFAULT_HEAL_ROW_CAP = 100;
/** Bail out cleanly rather than hang a request open indefinitely. */
export const DEFAULT_HEAL_TIME_BUDGET_MS = 20_000;

export type StripeFeeHealResult = {
  /** Total rows successfully healed this invocation (charge rows + refund rows). */
  healed: number;
  /** Of `healed`, how many were refund-type rows (healed with no API call). */
  refundRowsHealed: number;
  /** Gap rows still missing fee data after this invocation — beyond the cap, hit the time budget, or Stripe has no balance transaction yet. */
  remaining: number;
  /** Per-row failures (Stripe API errors, DB write errors) — never thrown, only counted. */
  errors: number;
};

type FeeCaptureOutcome =
  | { status: 'healed' }
  | { status: 'missing_charge' }
  | { status: 'missing_balance_transaction' };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retrieve a PaymentIntent expanded with its charge + balance transaction and
 * write the 5 captured fee/net/card columns onto its payment row. This is the
 * ONLY place that does the retrieve-then-write — the webhook and the heal
 * loop below both call it.
 *
 * Mirrors the webhook's `captureStripeFeeDetails` exactly, including the
 * `ne(payments.type, 'refund')` guard: a refund row shares the SAME
 * stripe_payment_id as the original charge (one PaymentIntent per Stripe
 * refund), so retrieving that PI returns the ORIGINAL CHARGE's positive
 * fee/net — writing it onto a refund row (money going OUT) would corrupt the
 * reconciliation this feature exists for.
 *
 * NEVER writes a fee of 0 when the balance transaction is missing/unexpanded
 * — that would silently understate Stripe's cut. Callers get a discriminated
 * outcome instead so they can log/count the miss and leave the row for a
 * later attempt. Throws on API/DB errors — callers decide how to count those.
 */
export async function captureFeeForPaymentIntent(paymentIntentId: string): Promise<FeeCaptureOutcome> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge.balance_transaction'],
  });
  const charge = pi.latest_charge as Stripe.Charge | string | null | undefined;
  if (!charge || typeof charge === 'string') {
    return { status: 'missing_charge' };
  }
  const balanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction | string | null | undefined;
  if (!balanceTransaction || typeof balanceTransaction === 'string') {
    return { status: 'missing_balance_transaction' };
  }
  const cardDetails = charge.payment_method_details?.card;

  await db
    .update(payments)
    .set({
      feePence: balanceTransaction.fee,
      netPence: balanceTransaction.net,
      balanceTransactionId: balanceTransaction.id,
      cardBrand: cardDetails?.brand ?? null,
      cardCountry: cardDetails?.country ?? null,
    })
    .where(and(eq(payments.stripePaymentId, paymentIntentId), ne(payments.type, 'refund')));

  return { status: 'healed' };
}

type GapRow = {
  id: string;
  stripePaymentId: string | null;
  type: 'initial' | 'adjustment' | 'refund';
  amount: number;
};

/**
 * Find payment rows on `showId`'s PAID orders that are still missing
 * captured Stripe fee data, and heal as many as fit in one bounded pass.
 *
 * Refund-type rows heal with NO API call — `feePence: 0, netPence: -amount`
 * — mirroring the webhook's executeStripeRefund convention exactly: Stripe
 * never returns a processing fee on a refund.
 *
 * Charge-type rows retrieve the PaymentIntent's balance transaction via
 * `captureFeeForPaymentIntent`. A missing balance transaction is left alone
 * (counted in `remaining`, never written as 0) so a later pass can pick it
 * up once Stripe has settled it.
 *
 * Best-effort throughout: any per-row failure is caught, logged with a
 * `[fee-heal]` prefix, and counted in `errors` — this function must never
 * throw, since it runs inline on an admin's invoice-viewing request.
 */
export async function healMissingStripeFees(
  showId: string,
  opts: { capRows?: number; spacingMs?: number; timeBudgetMs?: number } = {},
): Promise<StripeFeeHealResult> {
  const capRows = opts.capRows ?? DEFAULT_HEAL_ROW_CAP;
  const spacingMs = opts.spacingMs ?? DEFAULT_HEAL_SPACING_MS;
  const timeBudgetMs = opts.timeBudgetMs ?? DEFAULT_HEAL_TIME_BUDGET_MS;
  const startedAt = Date.now();

  const result: StripeFeeHealResult = { healed: 0, refundRowsHealed: 0, remaining: 0, errors: 0 };

  try {
    // Mirrors settlement-itemisation's paidOrderIds derivation exactly:
    // orders for this show with status='paid'.
    const paidOrderRows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.showId, showId), eq(orders.status, 'paid')));
    const paidOrderIds = paidOrderRows.map((o) => o.id);
    if (paidOrderIds.length === 0) return result;

    const gapWhere = and(
      inArray(payments.orderId, paidOrderIds),
      isNotNull(payments.stripePaymentId),
      isNull(payments.feePence),
    );

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(payments)
      .where(gapWhere);
    const totalGapCount = countRow?.count ?? 0;
    if (totalGapCount === 0) return result;

    const gapRows = (await db
      .select({ id: payments.id, stripePaymentId: payments.stripePaymentId, type: payments.type, amount: payments.amount })
      .from(payments)
      .where(gapWhere)
      .orderBy(payments.createdAt)
      .limit(capRows)) as GapRow[];

    // Rows beyond the cap were never even looked at this invocation.
    result.remaining += totalGapCount - gapRows.length;

    const refundRows = gapRows.filter((r) => r.type === 'refund');
    const chargeRows = gapRows.filter((r) => r.type !== 'refund');

    // Refund rows first — no API call, no rate-limit concern, no spacing needed.
    for (const row of refundRows) {
      try {
        await db
          .update(payments)
          .set({ feePence: 0, netPence: -row.amount, balanceTransactionId: null, cardBrand: null, cardCountry: null })
          .where(eq(payments.id, row.id));
        result.healed += 1;
        result.refundRowsHealed += 1;
      } catch (err) {
        result.errors += 1;
        console.warn(`[fee-heal] failed to heal refund row ${row.id}:`, err);
      }
    }

    // Charge rows — sequential Stripe calls, gently paced, bailing cleanly
    // if the time budget runs out so an admin's request never hangs.
    for (let i = 0; i < chargeRows.length; i++) {
      if (Date.now() - startedAt > timeBudgetMs) {
        result.remaining += chargeRows.length - i;
        console.warn(`[fee-heal] time budget exceeded for show ${showId}; ${chargeRows.length - i} row(s) left for next pass`);
        break;
      }
      const row = chargeRows[i]!;
      try {
        const outcome = await captureFeeForPaymentIntent(row.stripePaymentId!);
        if (outcome.status === 'healed') {
          result.healed += 1;
        } else {
          result.remaining += 1;
          console.warn(
            `[fee-heal] ${outcome.status === 'missing_charge' ? 'no expanded charge' : 'no balance_transaction'} for PI ${row.stripePaymentId} yet; leaving for a later pass`,
          );
        }
      } catch (err) {
        result.errors += 1;
        console.warn(`[fee-heal] fee capture failed for PI ${row.stripePaymentId}:`, err);
      }
      if (i < chargeRows.length - 1) await sleep(spacingMs);
    }

    return result;
  } catch (err) {
    // Anything unexpected outside the per-row loops (e.g. the initial
    // order/gap queries) — never throw out of a heal call.
    console.warn(`[fee-heal] heal pass failed for show ${showId}:`, err);
    result.errors += 1;
    return result;
  }
}
