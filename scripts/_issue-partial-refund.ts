/**
 * Entry-level partial refund, mirroring secretary.issueRefund exactly
 * (payment lookup by orderId, maxRefundable guard, executeStripeRefund which
 * records the refund payments row + running totals). Founder-authorised use.
 *   npx dotenv -e .env -- npx tsx scripts/_issue-partial-refund.ts <entryId> <pence> "<reason>"
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { entries, payments } from '@/server/db/schema';
import { executeStripeRefund } from '@/server/services/stripe-refunds';

async function main() {
  const [entryId, penceStr, reason] = process.argv.slice(2);
  const amount = parseInt(penceStr ?? '', 10);
  if (!entryId || !Number.isFinite(amount) || amount < 1 || !reason) throw new Error('usage: <entryId> <pence> "<reason>"');
  const entry = await db.query.entries.findFirst({ where: eq(entries.id, entryId), with: { show: true, dog: true } });
  if (!entry) throw new Error('entry not found');
  const originalPayment = entry.orderId
    ? await db.query.payments.findFirst({ where: and(eq(payments.orderId, entry.orderId), inArray(payments.status, ['succeeded', 'partially_refunded'])) })
    : null;
  if (!originalPayment?.stripePaymentId) throw new Error('no completed payment found');
  const alreadyRefunded = originalPayment.refundAmount ?? 0;
  const maxRefundable = originalPayment.amount - alreadyRefunded;
  if (amount > maxRefundable) throw new Error(`refund ${amount}p exceeds remaining ${maxRefundable}p`);
  const result = await executeStripeRefund(db, originalPayment, { amountPence: amount, reason, entryId });
  console.log(`refunded ${result.amount}p on ${entry.dog?.registeredName} @ ${entry.show?.name} (fullyRefunded=${result.fullyRefunded})`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
