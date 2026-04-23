import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { orders, payments, entries, orderSundryItems, sundryItems } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeUser,
  makeOrder,
  makePayment,
} from '../helpers/factories';

// After Amanda's live test on 2026-04-22 we discovered that a full refund
// cleared Total Income but left dashboard counts for catalogues + entries
// at their pre-refund values. This end-to-end test pins the invariant:
// once a paid order is refunded in full, every secretary-facing surface
// on the show page drops it — counts, lists, reports, everything.

describe('refund a full order → every secretary surface zeroes', () => {
  async function paidShowWithOneOrder() {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const order = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
      totalAmount: 2500,
    });
    const entry = await makeEntry({
      showId: show.id,
      dogId: dog.id,
      exhibitorId: exhibitor.id,
      orderId: order.id,
      status: 'confirmed',
      totalFee: 2500,
    });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });

    const payment = await makePayment({
      orderId: order.id,
      stripePaymentId: 'pi_test_full_refund',
      amount: 2500,
      status: 'succeeded',
    });

    // One printed catalogue + one sundry donation on the order
    const [catalogueItem] = await testDb
      .insert(sundryItems)
      .values({ showId: show.id, name: 'Printed Catalogue', priceInPence: 400 })
      .returning();
    const [donationItem] = await testDb
      .insert(sundryItems)
      .values({ showId: show.id, name: 'Donation', priceInPence: 500 })
      .returning();
    await testDb.insert(orderSundryItems).values([
      { orderId: order.id, sundryItemId: catalogueItem.id, quantity: 1, unitPrice: 400 },
      { orderId: order.id, sundryItemId: donationItem.id, quantity: 1, unitPrice: 500 },
    ]);

    return { secretary, show, order, entry, payment };
  }

  let ctx: Awaited<ReturnType<typeof paidShowWithOneOrder>>;

  beforeEach(async () => {
    ctx = await paidShowWithOneOrder();
  });

  it('flips order to refunded and sets payment refund fields', async () => {
    await createTestCaller(ctx.secretary).secretary.refundOrder({
      orderId: ctx.order.id,
    });

    const refreshedOrder = await testDb.query.orders.findFirst({
      where: eq(orders.id, ctx.order.id),
    });
    expect(refreshedOrder?.status).toBe('refunded');

    const refreshedPayment = await testDb.query.payments.findFirst({
      where: eq(payments.id, ctx.payment.id),
    });
    expect(refreshedPayment?.status).toBe('refunded');
    expect(refreshedPayment?.refundAmount).toBe(2500);

    const refreshedEntry = await testDb.query.entries.findFirst({
      where: eq(entries.id, ctx.entry.id),
    });
    expect(refreshedEntry?.status).toBe('cancelled');
  });

  it('zeroes the Overview + Financial stat cards (getShowStats)', async () => {
    await createTestCaller(ctx.secretary).secretary.refundOrder({
      orderId: ctx.order.id,
    });

    const stats = await createTestCaller(ctx.secretary).secretary.getShowStats({
      showId: ctx.show.id,
    });

    expect(stats.confirmedEntries).toBe(0);
    expect(stats.totalEntries).toBe(0);
    expect(stats.paidEntryFeesPence).toBe(0);
    expect(stats.paidSundryRevenuePence).toBe(0);
    expect(stats.paidPlatformFeePence).toBe(0);
    expect(stats.clubReceivablePence).toBe(0);
    expect(stats.paidPrintedCatalogueCount).toBe(0);
    expect(stats.paidOnlineCatalogueCount).toBe(0);
    // …but the refunded-amount line is still surfaced for display.
    expect(stats.refundedPence).toBe(2500);
  });

  it('zeroes the sidebar Entry Stats (getShowEntryStats)', async () => {
    await createTestCaller(ctx.secretary).secretary.refundOrder({
      orderId: ctx.order.id,
    });

    const stats = await createTestCaller(ctx.secretary).secretary.getShowEntryStats({
      showId: ctx.show.id,
    });
    expect(stats.totalEntries).toBe(0);
  });

  it('drops the refunded exhibitor from the Catalogue Orders list', async () => {
    await createTestCaller(ctx.secretary).secretary.refundOrder({
      orderId: ctx.order.id,
    });

    const cats = await createTestCaller(ctx.secretary).secretary.getCatalogueOrders({
      showId: ctx.show.id,
    });
    expect(cats.printed).toEqual([]);
    expect(cats.online).toEqual([]);
  });

  it('drops the refunded sundries from the Sundry Item Report', async () => {
    await createTestCaller(ctx.secretary).secretary.refundOrder({
      orderId: ctx.order.id,
    });

    const report = await createTestCaller(ctx.secretary).secretary.getSundryItemReport({
      showId: ctx.show.id,
    });
    // Both "Printed Catalogue" and "Donation" should either vanish or
    // have zero quantity — since the query's paid-only filter excludes
    // refunded orders, no rows should come back at all.
    expect(report.every((r) => r.quantitySold === 0)).toBe(true);
  });

  it('drops the refunded entry from the Entries tab (entries.getForShow)', async () => {
    await createTestCaller(ctx.secretary).secretary.refundOrder({
      orderId: ctx.order.id,
    });

    const res = await createTestCaller(ctx.secretary).entries.getForShow({
      showId: ctx.show.id,
    });
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });

  it('drops refunded rows from the Payment Report', async () => {
    await createTestCaller(ctx.secretary).secretary.refundOrder({
      orderId: ctx.order.id,
    });

    const report = await createTestCaller(ctx.secretary).secretary.getPaymentReport({
      showId: ctx.show.id,
    });
    expect(report.rows).toEqual([]);
    expect(report.summary.totalRevenue).toBe(0);
    expect(report.summary.paidCount).toBe(0);
    expect(report.summary.totalEntries).toBe(0);
  });

  it('drops refunded entries from the Entry Report (getEntryReport)', async () => {
    await createTestCaller(ctx.secretary).secretary.refundOrder({
      orderId: ctx.order.id,
    });

    const report = await createTestCaller(ctx.secretary).secretary.getEntryReport({
      showId: ctx.show.id,
    });
    expect(report).toEqual([]);
  });
});

describe('partial refund → order stays paid, counts remain', () => {
  it('per-entry partial refund leaves the order in paid state and counts hold', async () => {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog1 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dog2 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const order = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
      totalAmount: 5000,
    });
    const entry1 = await makeEntry({
      showId: show.id, dogId: dog1.id, exhibitorId: exhibitor.id, orderId: order.id,
      status: 'confirmed', totalFee: 2500,
    });
    const entry2 = await makeEntry({
      showId: show.id, dogId: dog2.id, exhibitorId: exhibitor.id, orderId: order.id,
      status: 'confirmed', totalFee: 2500,
    });
    await makeEntryClass({ entryId: entry1.id, showClassId: showClass.id });
    await makeEntryClass({ entryId: entry2.id, showClassId: showClass.id });
    await makePayment({
      orderId: order.id,
      stripePaymentId: 'pi_test_partial_refund',
      amount: 5000,
      status: 'succeeded',
    });

    // Refund just entry1 (£25)
    await createTestCaller(secretary).secretary.issueRefund({
      entryId: entry1.id,
    });

    const refreshedOrder = await testDb.query.orders.findFirst({
      where: eq(orders.id, order.id),
    });
    expect(refreshedOrder?.status).toBe('paid'); // not flipped

    const stats = await createTestCaller(secretary).secretary.getShowStats({
      showId: show.id,
    });
    // Both entries still counted (partial refund doesn't auto-cancel; the
    // existing issueRefund flow only cancels when the refund drains the
    // whole payment). Club receivable, however, drops by the refunded
    // amount.
    expect(stats.confirmedEntries).toBe(2);
    expect(stats.paidEntryFeesPence).toBe(5000);
    expect(stats.refundedPence).toBe(2500);
    expect(stats.clubReceivablePence).toBe(2500); // 5000 − 2500 partial refund
  });
});
