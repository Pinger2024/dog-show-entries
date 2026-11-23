/**
 * Extras with no dog (Mandy, 15 Oct 2026): the secretary-side numbers and
 * lists must see an order that has ZERO entries. Money was already keyed off
 * the order; the entry-keyed views (payment report, "awaiting payment") are
 * what this pins.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { orders, payments, sundryItems as sundryItemsTable } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeSecretaryWithOrg,
  settleOrderLikeWebhook,
} from '../helpers/factories';
import { computeShowMetrics } from '@/server/services/show-metrics';
import { reconcileSettlement } from '@/server/services/settlement-reconciliation';

async function showWithExtrasOrder(opts: { settle: boolean }) {
  const { user: secretary, org } = await makeSecretaryWithOrg();
  const breed = await makeBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open', firstEntryFee: 1000 });
  const [cat] = await testDb
    .insert(sundryItemsTable)
    .values({ showId: show.id, name: 'Printed Catalogue', priceInPence: 500, enabled: true })
    .returning();
  const buyer = await makeUser({ role: 'exhibitor', name: 'Shirley Buyer', email: 'shirley.buyer@example.test' });
  const res = await createTestCaller(buyer as never).orders.checkout({
    showId: show.id,
    entries: [],
    sundryItems: [{ sundryItemId: cat!.id, quantity: 2 }],
  });
  if (opts.settle) {
    await settleOrderLikeWebhook(res.orderId);
    // Captured Stripe fee, as the webhook's fee capture would leave it.
    await testDb.update(payments).set({ feePence: 60 }).where(eq(payments.orderId, res.orderId));
  }
  return { secretary, show, buyer, orderId: res.orderId };
}

describe('extras-only order — secretary views', () => {
  it('the payment report has a row for it, with the buyer and the ORDER status', async () => {
    const { secretary, show, buyer, orderId } = await showWithExtrasOrder({ settle: true });
    const report = await createTestCaller(secretary as never).secretary.getPaymentReport({ showId: show.id });
    const row = report.rows.find((r) => r.orderId === orderId);
    expect(row).toBeDefined();
    expect(row!.kind).toBe('sundry');
    expect(row!.exhibitor?.name).toBe('Shirley Buyer');
    expect(row!.exhibitor?.email).toBe(buyer.email);
    expect(row!.total).toBe(1000);
    expect(row!.status).toBe('confirmed'); // paid order — NOT 'withdrawn'
    expect(row!.payments.length).toBeGreaterThan(0);
    expect(report.summary.totalRevenue).toBe(1000);
  });

  it('a pending extras-only order shows as pending, not withdrawn', async () => {
    const { secretary, show, orderId } = await showWithExtrasOrder({ settle: false });
    const report = await createTestCaller(secretary as never).secretary.getPaymentReport({ showId: show.id });
    expect(report.rows.find((r) => r.orderId === orderId)?.status).toBe('pending');
  });

  it('a cancelled or refunded extras-only order leaves no ghost row', async () => {
    const { secretary, show, orderId } = await showWithExtrasOrder({ settle: false });
    await testDb.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, orderId));
    const report = await createTestCaller(secretary as never).secretary.getPaymentReport({ showId: show.id });
    expect(report.rows.find((r) => r.orderId === orderId)).toBeUndefined();
  });

  it('show-metrics: a paid one counts in clubReceivablePence and the platform fee', async () => {
    const { show, orderId } = await showWithExtrasOrder({ settle: true });
    const m = await computeShowMetrics(testDb, show.id);
    expect(m.clubReceivablePence).toBe(1000);
    expect(m.paidSundryRevenuePence).toBe(1000);
    expect(m.paidOrderCount).toBe(1);
    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, orderId) });
    expect(m.paidPlatformFeePence).toBe(order!.platformFeePence);
    expect(m.paidPlatformFeePence).toBeGreaterThan(0);
  });

  it('show-metrics: a pending one is in the awaiting-payment figures', async () => {
    const { show, orderId } = await showWithExtrasOrder({ settle: false });
    const m = await computeShowMetrics(testDb, show.id);
    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, orderId) });
    expect(m.pendingOrderCount).toBe(1);
    expect(m.pendingClubReceivablePence).toBe(1000);
    expect(m.pendingPlatformFeePence).toBe(order!.platformFeePence);
    expect(m.clubReceivablePence).toBe(0);
  });

  it('settlement reconciles on a show holding a paid extras-only order', async () => {
    const { show } = await showWithExtrasOrder({ settle: true });
    const result = await reconcileSettlement(testDb, show.id);
    expect(result.metricsPence).toBe(1000);
    expect(result.deltaPence).toBe(0);
    expect(result.ok).toBe(true);
  });

  it('a secretary can refund an extras-only order in full', async () => {
    const { secretary, show, orderId } = await showWithExtrasOrder({ settle: true });
    const res = await createTestCaller(secretary as never).secretary.refundOrder({ orderId });
    expect(res.refunded).toBe(true);
    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, orderId) });
    expect(order?.status).toBe('refunded');
    const m = await computeShowMetrics(testDb, show.id);
    expect(m.clubReceivablePence).toBe(0);
  });
});
