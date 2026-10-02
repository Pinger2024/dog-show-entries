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

  // Task #16: Stripe never returns the processing fee on refund — it keeps
  // the full original fee regardless of a later refund. The refund row
  // records feePence: 0 and netPence as MINUS the refunded amount so
  // SUM(netPence) across a show's payment rows reconciles to Stripe's true
  // net position, while the original payment's own netPence is left
  // untouched (it's null here, since this fixture payment predates fee
  // capture — proving the refund path doesn't invent a value for it).
  it('writes feePence 0 and netPence = -refundAmount on the refund row, leaving the original row untouched', async () => {
    await createTestCaller(ctx.secretary).secretary.refundOrder({
      orderId: ctx.order.id,
    });

    const refundRow = await testDb.query.payments.findFirst({
      where: eq(payments.type, 'refund'),
    });
    expect(refundRow?.amount).toBe(2500);
    expect(refundRow?.feePence).toBe(0);
    expect(refundRow?.netPence).toBe(-2500);

    const originalPayment = await testDb.query.payments.findFirst({
      where: eq(payments.id, ctx.payment.id),
    });
    expect(originalPayment?.status).toBe('refunded');
    expect(originalPayment?.netPence).toBeNull();
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

describe('withdrawn entries stay out of the printed catalogue', () => {
  it('getCatalogueData excludes entries with status=withdrawn even when the order is paid', async () => {
    // Amanda's 2026-04-23 question: "worth running a test to ensure
    // withdrawn don't populate into the catalogue roguely?". Pinning
    // the invariant.
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogConfirmed = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dogWithdrawn = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const order = await makeOrder({
      showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 5000,
    });
    const entryConfirmed = await makeEntry({
      showId: show.id, dogId: dogConfirmed.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 2500,
    });
    const entryWithdrawn = await makeEntry({
      showId: show.id, dogId: dogWithdrawn.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'withdrawn', totalFee: 2500,
    });
    await makeEntryClass({ entryId: entryConfirmed.id, showClassId: showClass.id });
    await makeEntryClass({ entryId: entryWithdrawn.id, showClassId: showClass.id });

    const data = await createTestCaller(secretary).secretary.getCatalogueData({
      showId: show.id,
    });

    const ids = data.entries.map((e) => e.id);
    expect(ids).toContain(entryConfirmed.id);
    expect(ids).not.toContain(entryWithdrawn.id);
  });
});

// Mandy 2026-07-13: a withdrawn entry keeps its fee with the club by default
// (income). The secretary can choose to refund it; once they do, it must leave
// the withdrawn count AND the income total, and the £1+1% platform fee must NOT
// be handed back (Stripe keeps its cut on refunds).
describe('refund a withdrawn entry → cancelled, drops from income, keeps platform fee', () => {
  async function paidShowWithWithdrawnEntry() {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    // Charged £20 entry + £1.20 platform fee = £21.20 at Stripe.
    const order = await makeOrder({
      showId: show.id, exhibitorId: exhibitor.id, status: 'paid',
      totalAmount: 2000, platformFeePence: 120,
    });
    const entry = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'withdrawn', totalFee: 2000,
    });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const payment = await makePayment({
      orderId: order.id, stripePaymentId: 'pi_test_withdrawn_refund',
      amount: 2120, status: 'succeeded',
    });
    return { secretary, show, order, entry, payment };
  }

  it('before refund: the withdrawn fee counts as club income', async () => {
    const { secretary, show } = await paidShowWithWithdrawnEntry();
    const stats = await createTestCaller(secretary).secretary.getShowStats({ showId: show.id });
    expect(stats.paidEntryFeesPence).toBe(2000);
    expect(stats.clubReceivablePence).toBe(2000);
    const entryStats = await createTestCaller(secretary).secretary.getShowEntryStats({ showId: show.id });
    expect(entryStats.withdrawn).toBe(1);
  });

  it('refunding it flips the entry to cancelled and zeroes club income', async () => {
    const { secretary, show, entry } = await paidShowWithWithdrawnEntry();
    await createTestCaller(secretary).secretary.issueRefund({ entryId: entry.id });

    const refreshed = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(refreshed?.status).toBe('cancelled');

    const stats = await createTestCaller(secretary).secretary.getShowStats({ showId: show.id });
    expect(stats.clubReceivablePence).toBe(0); // fee counted then netted by the refund
    expect(stats.refundedPence).toBe(2000);

    const entryStats = await createTestCaller(secretary).secretary.getShowEntryStats({ showId: show.id });
    expect(entryStats.withdrawn).toBe(0); // no longer inflates the withdrawn count
  });

  it('keeps the £1.20 platform fee — order stays paid (not fully refunded)', async () => {
    const { secretary, order, entry, payment } = await paidShowWithWithdrawnEntry();
    await createTestCaller(secretary).secretary.issueRefund({ entryId: entry.id });

    // Only the £20 entry fee came back; the £1.20 platform fee is retained, so
    // the payment is partially — not fully — refunded and the order stays 'paid'.
    const refreshedPayment = await testDb.query.payments.findFirst({ where: eq(payments.id, payment.id) });
    expect(refreshedPayment?.refundAmount).toBe(2000);
    expect(refreshedPayment?.status).toBe('partially_refunded');
    const refreshedOrder = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(refreshedOrder?.status).toBe('paid');
  });
});
