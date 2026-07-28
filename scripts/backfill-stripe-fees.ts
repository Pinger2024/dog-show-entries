/**
 * Backfill Stripe's ACTUAL fee/net/card details onto existing payment rows
 * that predate fee capture (see the payment_intent.succeeded webhook, which
 * now retrieves latest_charge.balance_transaction on every new payment).
 * We previously only ever estimated Stripe's cut at a flat 1.5% and never
 * stored the real per-charge numbers — task #16.
 *
 * DRY RUN by default — prints what it WOULD set. Pass --apply to write.
 *   DATABASE_URL=... npx tsx scripts/backfill-stripe-fees.ts          # dry run
 *   DATABASE_URL=... npx tsx scripts/backfill-stripe-fees.ts --apply  # write
 *
 * Rows whose PaymentIntent (or its latest Charge/balance_transaction) no
 * longer exists at Stripe are skipped and logged — never treated as a fee
 * of 0, which would silently understate Stripe's cut in every report that
 * reads these columns.
 */
import 'dotenv/config';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../src/server/db';
import { payments } from '../src/server/db/schema';
import { getStripe } from '../src/server/services/stripe';

const BATCH_DELAY_MS = 250; // sequential, gentle pacing to stay well under Stripe's rate limits
const MAX_RETRIES = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retrieve a PaymentIntent expanded with its charge + balance transaction, backing off on 429s. */
async function retrieveWithBackoff(stripe: ReturnType<typeof getStripe>, paymentIntentId: string) {
  let attempt = 0;
  for (;;) {
    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge.balance_transaction'],
      });
    } catch (err) {
      const isRateLimit =
        typeof err === 'object' && err !== null && (err as { statusCode?: number }).statusCode === 429;
      if (!isRateLimit || attempt >= MAX_RETRIES) throw err;
      attempt += 1;
      const backoffMs = BATCH_DELAY_MS * 2 ** attempt;
      console.warn(`  … rate limited on ${paymentIntentId}, retry ${attempt}/${MAX_RETRIES} after ${backoffMs}ms`);
      await sleep(backoffMs);
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const stripe = getStripe();

  const rows = await db.query.payments.findMany({
    where: and(isNotNull(payments.stripePaymentId), isNull(payments.feePence)),
    with: {
      order: { columns: { id: true, showId: true } },
      entry: { columns: { id: true, showId: true } },
    },
  });

  console.log(`${rows.length} payment row(s) missing fee capture.\n`);

  type Update = {
    id: string;
    showId: string | null;
    amount: number;
    feePence: number;
    netPence: number;
    balanceTransactionId: string;
    cardBrand: string | null;
    cardCountry: string | null;
  };
  const updates: Update[] = [];
  const skipped: { id: string; stripePaymentId: string; reason: string }[] = [];

  for (const row of rows) {
    const paymentIntentId = row.stripePaymentId!;
    const showId = row.order?.showId ?? row.entry?.showId ?? null;
    try {
      const pi = await retrieveWithBackoff(stripe, paymentIntentId);
      const charge = pi.latest_charge;
      if (!charge || typeof charge === 'string') {
        skipped.push({ id: row.id, stripePaymentId: paymentIntentId, reason: 'no expanded charge on PI' });
        continue;
      }
      const balanceTransaction = charge.balance_transaction;
      if (!balanceTransaction || typeof balanceTransaction === 'string') {
        skipped.push({ id: row.id, stripePaymentId: paymentIntentId, reason: 'no balance_transaction on charge' });
        continue;
      }
      const card = charge.payment_method_details?.card;
      updates.push({
        id: row.id,
        showId,
        amount: row.amount,
        feePence: balanceTransaction.fee,
        netPence: balanceTransaction.net,
        balanceTransactionId: balanceTransaction.id,
        cardBrand: card?.brand ?? null,
        cardCountry: card?.country ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const notFound = message.includes('No such payment_intent') || message.includes('No such charge');
      skipped.push({
        id: row.id,
        stripePaymentId: paymentIntentId,
        reason: notFound ? 'PaymentIntent no longer exists at Stripe' : `error: ${message}`,
      });
    }
    await sleep(BATCH_DELAY_MS);
  }

  console.log(`── Would set fee/net (${updates.length}) ──`);
  for (const u of updates) {
    console.log(
      `  ✓ ${u.id}  amount=${u.amount}  fee=${u.feePence}  net=${u.netPence}  (fee+net=${u.feePence + u.netPence}${u.feePence + u.netPence !== u.amount ? '  ⚠ MISMATCH vs amount' : ''})`
    );
  }
  console.log(`\n── Skipped (${skipped.length}) ──`);
  for (const s of skipped) console.log(`  · ${s.id} (${s.stripePaymentId}) — ${s.reason}`);

  // Reconciliation summary — per show: SUM(amount), SUM(feePence),
  // SUM(netPence), and skip count, so a human can eyeball fee+net=amount
  // per row and spot anomalies before/after applying.
  const byShow = new Map<
    string,
    { amount: number; fee: number; net: number; skipped: number; count: number }
  >();
  const showKey = (id: string | null) => id ?? '(no show — unlinked payment)';
  for (const u of updates) {
    const key = showKey(u.showId);
    const bucket = byShow.get(key) ?? { amount: 0, fee: 0, net: 0, skipped: 0, count: 0 };
    bucket.amount += u.amount;
    bucket.fee += u.feePence;
    bucket.net += u.netPence;
    bucket.count += 1;
    byShow.set(key, bucket);
  }
  for (const s of skipped) {
    const row = rows.find((r) => r.id === s.id);
    const key = showKey(row?.order?.showId ?? row?.entry?.showId ?? null);
    const bucket = byShow.get(key) ?? { amount: 0, fee: 0, net: 0, skipped: 0, count: 0 };
    bucket.skipped += 1;
    byShow.set(key, bucket);
  }

  console.log(`\n── Reconciliation summary (per show) ──`);
  for (const [showId, bucket] of byShow) {
    console.log(
      `  ${showId}: rows=${bucket.count} skipped=${bucket.skipped} SUM(amount)=${bucket.amount} SUM(fee)=${bucket.fee} SUM(net)=${bucket.net} (fee+net=${bucket.fee + bucket.net}${bucket.fee + bucket.net !== bucket.amount ? '  ⚠ MISMATCH vs SUM(amount)' : ''})`
    );
  }

  if (!apply) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to update ${updates.length} row(s).`);
    return;
  }

  for (const u of updates) {
    await db
      .update(payments)
      .set({
        feePence: u.feePence,
        netPence: u.netPence,
        balanceTransactionId: u.balanceTransactionId,
        cardBrand: u.cardBrand,
        cardCountry: u.cardCountry,
      })
      .where(eq(payments.id, u.id));
  }
  console.log(`\nAPPLIED — set fee/net on ${updates.length} payment row(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
