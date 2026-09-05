import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import * as stripeService from '@/server/services/stripe';
import * as emailService from '@/server/services/email';
import { entries, entryClasses, entryAuditLog, orders, payments, printOrders } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeOrder,
  makePayment,
} from '../helpers/factories';
import { createTestCaller } from '../helpers/context';
import { injectStripeEvent, buildStripeWebhookRequest } from '../helpers/stripe-event';
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route';

async function entryReadyForPayment() {
  const [exhibitor, org, breed] = await Promise.all([
    makeUser({ role: 'exhibitor' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });
  const [showClass, dog] = await Promise.all([
    makeShowClass({ showId: show.id, breedId: breed.id }),
    makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
  ]);
  const entry = await makeEntry({
    showId: show.id,
    dogId: dog.id,
    exhibitorId: exhibitor.id,
    status: 'pending',
  });
  return { exhibitor, org, breed, show, showClass, dog, entry };
}

beforeEach(() => {
  vi.mocked(emailService.sendEntryConfirmationEmail).mockClear();
  vi.mocked(emailService.sendSecretaryNotificationEmail).mockClear();
});

describe('POST /api/webhooks/stripe — payment_intent.succeeded', () => {
  it('confirms a legacy single-entry payment (entryId only, no orderId)', async () => {
    const { entry } = await entryReadyForPayment();
    const intentId = 'pi_test_legacy_succeeded';
    await makePayment({ entryId: entry.id, stripePaymentId: intentId });

    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: intentId,
          metadata: { entryId: entry.id },
        },
      },
    });

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);

    expect(res.status).toBe(200);
    const updated = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(updated?.status).toBe('confirmed');
    const payment = await testDb.query.payments.findFirst({
      where: eq(payments.stripePaymentId, intentId),
    });
    expect(payment?.status).toBe('succeeded');
  });

  it('confirms every entry in an order and marks the order paid + fires emails', async () => {
    const { exhibitor, show, entry: e1 } = await entryReadyForPayment();
    const e2 = await makeEntry({
      showId: show.id,
      dogId: e1.dogId!,
      exhibitorId: exhibitor.id,
      status: 'pending',
    });
    const order = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'pending_payment',
    });
    await testDb
      .update(entries)
      .set({ orderId: order.id })
      .where(inArray(entries.id, [e1.id, e2.id]));
    const intentId = 'pi_test_order_succeeded';
    await makePayment({ orderId: order.id, stripePaymentId: intentId });

    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: intentId, metadata: { orderId: order.id } } },
    });

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);

    expect(res.status).toBe(200);
    const updatedEntries = await testDb.query.entries.findMany({
      where: eq(entries.orderId, order.id),
    });
    expect(updatedEntries.every((e) => e.status === 'confirmed')).toBe(true);
    const updatedOrder = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(updatedOrder?.status).toBe('paid');

    expect(vi.mocked(emailService.sendEntryConfirmationEmail)).toHaveBeenCalledWith(order.id);
    expect(vi.mocked(emailService.sendSecretaryNotificationEmail)).toHaveBeenCalledWith(order.id);
  });

  // South Western GSD, 2026-07-26: 38 of 93 paid entries reached close night
  // with no catalogue number, because nothing on the payment path assigned one.
  it('gives a paid entry its catalogue number', async () => {
    const { exhibitor, show, showClass, entry } = await entryReadyForPayment();
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'pending_payment' });
    await testDb.update(entries).set({ orderId: order.id }).where(eq(entries.id, entry.id));
    const intentId = 'pi_test_catalogue_number';
    await makePayment({ orderId: order.id, stripePaymentId: intentId });

    expect((await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) }))?.catalogueNumber).toBeNull();

    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: intentId, metadata: { orderId: order.id } } },
    });
    const res = await stripeWebhook(buildStripeWebhookRequest() as never);

    expect(res.status).toBe(200);
    const paid = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(paid?.status).toBe('confirmed');
    expect(paid?.catalogueNumber).toBe('1');
  });

  it('is idempotent across re-delivery (Stripe may send the same event twice)', async () => {
    const { exhibitor, show, entry } = await entryReadyForPayment();
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id });
    await testDb.update(entries).set({ orderId: order.id }).where(eq(entries.id, entry.id));
    const intentId = 'pi_test_idempotent';
    await makePayment({ orderId: order.id, stripePaymentId: intentId });
    const event = {
      type: 'payment_intent.succeeded',
      data: { object: { id: intentId, metadata: { orderId: order.id } } },
    };

    injectStripeEvent(event);
    await stripeWebhook(buildStripeWebhookRequest() as never);
    injectStripeEvent(event);
    const res2 = await stripeWebhook(buildStripeWebhookRequest() as never);

    expect(res2.status).toBe(200);
    const final = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(final?.status).toBe('confirmed');
    const finalOrder = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(finalOrder?.status).toBe('paid');
  });

  it('no-ops when the metadata points at no known entry/order', async () => {
    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_unknown', metadata: {} } },
    });

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);

    expect(res.status).toBe(200);
  });
});

// Task #16: we previously only ever estimated Stripe's fee at 1.5% and never
// stored the actuals. The webhook now makes a second call to retrieve the
// PaymentIntent expanded with latest_charge.balance_transaction (fee/net
// live on the Charge, never on the PI itself) and stores it on the payment
// row — but that call must NEVER be able to block the payment/entry/order
// confirmation that already happened.
describe('POST /api/webhooks/stripe — Stripe fee/net capture', () => {
  it('captures fee, net, balance transaction id, and card brand/country onto the payment row', async () => {
    const { entry } = await entryReadyForPayment();
    const intentId = 'pi_test_fee_capture';
    await makePayment({ entryId: entry.id, stripePaymentId: intentId });

    injectStripeEvent(
      {
        type: 'payment_intent.succeeded',
        data: { object: { id: intentId, metadata: { entryId: entry.id } } },
      },
      {
        retrievePaymentIntent: {
          balance_transaction: { id: 'txn_abc123', fee: 42, net: 958 },
          payment_method_details: { card: { brand: 'mastercard', country: 'GB' } },
        },
      }
    );

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);

    const payment = await testDb.query.payments.findFirst({
      where: eq(payments.stripePaymentId, intentId),
    });
    expect(payment?.status).toBe('succeeded');
    expect(payment?.feePence).toBe(42);
    expect(payment?.netPence).toBe(958);
    expect(payment?.balanceTransactionId).toBe('txn_abc123');
    expect(payment?.cardBrand).toBe('mastercard');
    expect(payment?.cardCountry).toBe('GB');
  });

  it('still marks the payment succeeded when the fee-capture retrieve call fails (never-block guarantee)', async () => {
    const { entry } = await entryReadyForPayment();
    const intentId = 'pi_test_fee_capture_fails';
    await makePayment({ entryId: entry.id, stripePaymentId: intentId });

    injectStripeEvent(
      {
        type: 'payment_intent.succeeded',
        data: { object: { id: intentId, metadata: { entryId: entry.id } } },
      },
      {
        retrievePaymentIntent: () => {
          throw new Error('Stripe API is down');
        },
      }
    );

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    // The webhook must still return 200 — a fee-capture failure must never
    // fail the webhook and cause Stripe to retry the whole event (which
    // would re-fire the exhibitor's confirmation email).
    expect(res.status).toBe(200);

    const updatedEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(updatedEntry?.status).toBe('confirmed');

    const payment = await testDb.query.payments.findFirst({
      where: eq(payments.stripePaymentId, intentId),
    });
    expect(payment?.status).toBe('succeeded');
    expect(payment?.feePence).toBeNull();
    expect(payment?.netPence).toBeNull();
  });

  // Bug found in review: a refund row shares the SAME stripe_payment_id as
  // the original payment (one PaymentIntent per Stripe refund). Stripe can
  // redeliver a payment_intent.succeeded event well after a refund exists
  // (recovery redelivery, sometimes days later) — without excluding
  // type='refund' from the fee-capture UPDATE's WHERE clause, that replay
  // would overwrite the refund row's feePence:0/netPence:-amount with the
  // ORIGINAL CHARGE's positive fee/net, corrupting the reconciliation this
  // feature exists for.
  it('does not overwrite an existing refund row when the succeeded event is replayed (fee-capture must exclude type=refund)', async () => {
    const { entry } = await entryReadyForPayment();
    const intentId = 'pi_test_fee_capture_refund_replay';
    const originalPayment = await makePayment({
      entryId: entry.id,
      stripePaymentId: intentId,
      amount: 2500,
      status: 'refunded',
    });

    // A refund row already exists for this PaymentIntent — same stripe_payment_id,
    // written by executeStripeRefund with the never-returned-fee convention.
    const [refundRow] = await testDb
      .insert(payments)
      .values({
        entryId: entry.id,
        stripePaymentId: intentId,
        amount: 2500,
        status: 'refunded',
        type: 'refund',
        feePence: 0,
        netPence: -2500,
      })
      .returning();

    // Stripe redelivers the original succeeded event (retrying delivery, or a
    // dashboard replay) well after the refund has already happened.
    injectStripeEvent(
      {
        type: 'payment_intent.succeeded',
        data: { object: { id: intentId, metadata: { entryId: entry.id } } },
      },
      {
        retrievePaymentIntent: {
          balance_transaction: { id: 'txn_replay', fee: 75, net: 2425 },
          payment_method_details: { card: { brand: 'visa', country: 'GB' } },
        },
      }
    );
    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);

    // The refund row must be untouched — still feePence 0 / netPence -2500.
    const refreshedRefund = await testDb.query.payments.findFirst({
      where: eq(payments.id, refundRow!.id),
    });
    expect(refreshedRefund?.feePence).toBe(0);
    expect(refreshedRefund?.netPence).toBe(-2500);
    expect(refreshedRefund?.balanceTransactionId).toBeNull();

    // The original (non-refund) payment row DOES get the captured values —
    // proving the WHERE clause targets it, not that capture silently no-oped.
    const refreshedOriginal = await testDb.query.payments.findFirst({
      where: eq(payments.id, originalPayment!.id),
    });
    expect(refreshedOriginal?.feePence).toBe(75);
    expect(refreshedOriginal?.netPence).toBe(2425);
    expect(refreshedOriginal?.balanceTransactionId).toBe('txn_replay');
  });
});

describe('POST /api/webhooks/stripe — print_order payment_intent.succeeded', () => {
  async function seedPrintOrder(status: typeof printOrders.$inferInsert['status']) {
    const [exhibitor, org, breed] = await Promise.all([
      makeUser({ role: 'exhibitor' }),
      makeOrg(),
      makeBreed(),
    ]);
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const [row] = await testDb
      .insert(printOrders)
      .values({
        showId: show.id,
        organisationId: org.id,
        orderedByUserId: exhibitor.id,
        status,
        subtotalAmount: 10000,
        totalAmount: 10000,
        stripePaymentIntentId: 'pi_test_print',
      })
      .returning();
    return row;
  }

  it('moves a draft print order to paid on first delivery', async () => {
    const po = await seedPrintOrder('draft');
    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_print', metadata: { type: 'print_order', printOrderId: po.id } } },
    });
    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);
    const updated = await testDb.query.printOrders.findFirst({ where: eq(printOrders.id, po.id) });
    expect(updated?.status).toBe('paid');
    expect(updated?.stripePaymentStatus).toBe('succeeded');
  });

  it('does NOT regress a submitted/in_production/dispatched/delivered print order back to paid on webhook replay', async () => {
    // Stripe retries payment_intent.succeeded on 5xx / timeouts, and
    // dashboard replays can also refire the event. Without this
    // guard, a retry after Mixam submission would silently unwind
    // the order status.
    for (const terminal of ['submitted', 'in_production', 'dispatched', 'delivered'] as const) {
      const po = await seedPrintOrder(terminal);
      injectStripeEvent({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test_print', metadata: { type: 'print_order', printOrderId: po.id } } },
      });
      const res = await stripeWebhook(buildStripeWebhookRequest() as never);
      expect(res.status).toBe(200);
      const updated = await testDb.query.printOrders.findFirst({ where: eq(printOrders.id, po.id) });
      expect(updated?.status).toBe(terminal);
      // stripePaymentStatus is idempotent and may still be written:
      expect(updated?.stripePaymentStatus).toBe('succeeded');
    }
  });

  it('does not regress an already-paid print order to draft/anything else', async () => {
    const po = await seedPrintOrder('paid');
    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_print', metadata: { type: 'print_order', printOrderId: po.id } } },
    });
    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);
    const updated = await testDb.query.printOrders.findFirst({ where: eq(printOrders.id, po.id) });
    expect(updated?.status).toBe('paid');
  });

  it('sends admin notification + secretary confirmation but does NOT auto-submit to Mixam when PRINT_AUTO_SUBMIT is unset', async () => {
    // Ensure PRINT_AUTO_SUBMIT is not set (default — manual fulfilment mode)
    delete process.env.PRINT_AUTO_SUBMIT;

    const po = await seedPrintOrder('draft');
    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_print', metadata: { type: 'print_order', printOrderId: po.id } } },
    });

    vi.mocked(emailService.sendPrintOrderAdminNotificationEmail).mockClear();
    vi.mocked(emailService.sendPrintOrderConfirmationEmail).mockClear();

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);

    const updated = await testDb.query.printOrders.findFirst({ where: eq(printOrders.id, po.id) });
    // Order must be paid, NOT submitted (Mixam not called)
    expect(updated?.status).toBe('paid');
    expect(updated?.tradeprintOrderRef).toBeNull();

    // Both email functions must have been called once
    expect(emailService.sendPrintOrderAdminNotificationEmail).toHaveBeenCalledOnce();
    expect(emailService.sendPrintOrderAdminNotificationEmail).toHaveBeenCalledWith(po.id);
    expect(emailService.sendPrintOrderConfirmationEmail).toHaveBeenCalledOnce();
    expect(emailService.sendPrintOrderConfirmationEmail).toHaveBeenCalledWith(po.id);
  });
});

describe('POST /api/webhooks/stripe — payment_intent.payment_failed', () => {
  it('marks the order failed and the payment row failed', async () => {
    const { exhibitor, show, entry } = await entryReadyForPayment();
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id });
    await testDb.update(entries).set({ orderId: order.id }).where(eq(entries.id, entry.id));
    const intentId = 'pi_test_failed';
    await makePayment({ orderId: order.id, stripePaymentId: intentId });

    injectStripeEvent({
      type: 'payment_intent.payment_failed',
      data: { object: { id: intentId, metadata: { orderId: order.id } } },
    });

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);

    expect(res.status).toBe(200);
    const updatedOrder = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(updatedOrder?.status).toBe('failed');
    const payment = await testDb.query.payments.findFirst({
      where: eq(payments.stripePaymentId, intentId),
    });
    expect(payment?.status).toBe('failed');
    // Entries stay pending — the user can retry payment.
    const updatedEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(updatedEntry?.status).toBe('pending');
  });
});

describe('POST /api/webhooks/stripe — entry-edit UPGRADE (deferred adjustment)', () => {
  // The full deferred-upgrade journey: entries.update with a fee INCREASE no
  // longer mutates the entry — it stages the new class list + fee in the
  // PaymentIntent metadata and returns a clientSecret. ONLY when the adjustment
  // payment succeeds does this webhook apply the staged change. This guards
  // against an abandoned top-up granting a free class + overstating club revenue.
  async function entryReadyToUpgrade() {
    const [exhibitor, org, breed] = await Promise.all([
      makeUser({ role: 'exhibitor' }),
      makeOrg(),
      makeBreed(),
    ]);
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: 800,
      subsequentEntryFee: 400,
    });
    const [c1, c2, dog] = await Promise.all([
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 800 }),
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 800 }),
      makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
    ]);
    const order = await makeOrder({
      showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 800,
    });
    const entry = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed', totalFee: 800, orderId: order.id,
    });
    await makeEntryClass({ entryId: entry.id, showClassId: c1.id, fee: 800 });
    return { exhibitor, show, c1, c2, entry, order };
  }

  it('applies the staged classes + fee only when the adjustment payment succeeds', async () => {
    const { exhibitor, c1, c2, entry, order } = await entryReadyToUpgrade();
    vi.mocked(stripeService.createPaymentIntent).mockClear();

    // 1. Exhibitor adds a class — fee goes up, change is DEFERRED.
    const res = await createTestCaller(exhibitor).entries.update({
      id: entry.id, classIds: [c1.id, c2.id],
    });
    expect(res.feeDiff).toBe(400);
    expect(res.requiresPayment).toBe(true);

    // Entry untouched until payment lands.
    const before = await testDb.query.entryClasses.findMany({ where: eq(entryClasses.entryId, entry.id) });
    expect(before.map((r) => r.showClassId)).toEqual([c1.id]);

    // The adjustment payment row was inserted 'pending' with the real PI id,
    // and the staged change travels in the metadata the router passed to Stripe.
    const adjPayment = await testDb.query.payments.findFirst({
      where: eq(payments.entryId, entry.id),
    });
    expect(adjPayment?.status).toBe('pending');
    const intentId = adjPayment!.stripePaymentId!;
    const metadata = vi.mocked(stripeService.createPaymentIntent).mock.calls.at(-1)![1];
    expect(metadata.type).toBe('adjustment');
    expect(metadata.pendingClassIds).toBe([c1.id, c2.id].join(','));
    expect(metadata.pendingFee).toBe('1200');

    // 2. Stripe confirms the top-up — webhook applies the staged change.
    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: intentId, metadata } },
    });
    const webhookRes = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(webhookRes.status).toBe(200);

    // 3. Entry now carries both classes and the upgraded fee.
    const after = await testDb.query.entryClasses.findMany({ where: eq(entryClasses.entryId, entry.id) });
    expect(after.map((r) => r.showClassId).sort()).toEqual([c1.id, c2.id].sort());
    const updatedEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(updatedEntry?.totalFee).toBe(1200);
    // The order total is bumped by the £4 top-up so the payout ledger
    // (SUM(orders.totalAmount) on paid orders) pays the club the full amount
    // the exhibitor was charged — bug hunt #4.
    const updatedOrder = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(updatedOrder?.totalAmount).toBe(1200);
    const paidPayment = await testDb.query.payments.findFirst({
      where: eq(payments.stripePaymentId, intentId),
    });
    expect(paidPayment?.status).toBe('succeeded');

    // 4. The change is audited at the point it actually landed, attributed to
    //    the exhibitor, flagged as applied via the adjustment payment.
    const audit = await testDb.query.entryAuditLog.findMany({
      where: eq(entryAuditLog.entryId, entry.id),
    });
    const applied = audit.filter((a) => (a.changes as { via?: string })?.via === 'adjustment_payment');
    expect(applied).toHaveLength(1);
    expect(applied[0]?.userId).toBe(exhibitor.id);
  });

  it('applies the upgrade when a declined card is retried on the same PaymentIntent (bug #9)', async () => {
    const { exhibitor, c1, c2, entry, order } = await entryReadyToUpgrade();
    vi.mocked(stripeService.createPaymentIntent).mockClear();

    await createTestCaller(exhibitor).entries.update({ id: entry.id, classIds: [c1.id, c2.id] });
    const adjPayment = await testDb.query.payments.findFirst({ where: eq(payments.entryId, entry.id) });
    const intentId = adjPayment!.stripePaymentId!;
    const metadata = vi.mocked(stripeService.createPaymentIntent).mock.calls.at(-1)![1];

    // 1. Card declined first — payment row flips to 'failed', upgrade NOT applied.
    injectStripeEvent({
      type: 'payment_intent.payment_failed',
      data: { object: { id: intentId, metadata } },
    });
    await stripeWebhook(buildStripeWebhookRequest() as never);

    const failedPay = await testDb.query.payments.findFirst({ where: eq(payments.stripePaymentId, intentId) });
    expect(failedPay?.status).toBe('failed');
    const stillOld = await testDb.query.entryClasses.findMany({ where: eq(entryClasses.entryId, entry.id) });
    expect(stillOld.map((r) => r.showClassId)).toEqual([c1.id]); // not applied yet

    // 2. Customer retries the SAME PaymentIntent and it succeeds — the upgrade
    //    must now apply, even though the payment row was 'failed'.
    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: intentId, metadata } },
    });
    await stripeWebhook(buildStripeWebhookRequest() as never);

    const after = await testDb.query.entryClasses.findMany({ where: eq(entryClasses.entryId, entry.id) });
    expect(after.map((r) => r.showClassId).sort()).toEqual([c1.id, c2.id].sort());
    const updatedEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(updatedEntry?.totalFee).toBe(1200);
    const updatedOrder = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(updatedOrder?.totalAmount).toBe(1200);
  });

  it('does not resurrect dropped classes when the original adjustment event is replayed after a later downgrade', async () => {
    const { exhibitor, c1, c2, entry } = await entryReadyToUpgrade();
    vi.mocked(stripeService.createPaymentIntent).mockClear();

    // Upgrade to [c1, c2] and let it settle via the webhook.
    await createTestCaller(exhibitor).entries.update({ id: entry.id, classIds: [c1.id, c2.id] });
    const adjPayment = await testDb.query.payments.findFirst({ where: eq(payments.entryId, entry.id) });
    const intentId = adjPayment!.stripePaymentId!;
    const metadata = vi.mocked(stripeService.createPaymentIntent).mock.calls.at(-1)![1];
    const event = { type: 'payment_intent.succeeded', data: { object: { id: intentId, metadata } } };
    injectStripeEvent(event);
    await stripeWebhook(buildStripeWebhookRequest() as never);

    // Exhibitor later drops back to a single class. We simulate the resulting
    // state directly (the real downgrade's Stripe refund is exercised
    // elsewhere; injectStripeEvent has stubbed getStripe to a webhooks-only
    // shim, so calling the refund path here would be testing the mock, not the
    // guard). What matters for the guard is that the classes have since changed.
    await testDb.delete(entryClasses).where(eq(entryClasses.showClassId, c2.id));
    await testDb.update(entries).set({ totalFee: 800 }).where(eq(entries.id, entry.id));
    const downgraded = await testDb.query.entryClasses.findMany({ where: eq(entryClasses.entryId, entry.id) });
    expect(downgraded.map((r) => r.showClassId)).toEqual([c1.id]);

    // Stripe redelivers the ORIGINAL upgrade's succeeded event. The pending-guard
    // must stop it re-adding c2 (the adjustment payment is no longer 'pending').
    injectStripeEvent(event);
    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);

    const final = await testDb.query.entryClasses.findMany({ where: eq(entryClasses.entryId, entry.id) });
    expect(final.map((r) => r.showClassId)).toEqual([c1.id]);
  });
});

// Maxine's £52.51, 2026-08-19 — Stripe accepted the refund, Remi marked it
// 'refunded' forever, but the refund then FAILED at Stripe (expired card)
// and the money sat back in Remi's own Stripe balance for a month before the
// exhibitor said anything. The webhook previously handled no refund events
// at all, so a failure after the fact was invisible.
describe('POST /api/webhooks/stripe — refund.failed / refund.updated', () => {
  async function orderReadyForRefund() {
    const [exhibitor, org, breed] = await Promise.all([
      makeUser({ role: 'exhibitor' }),
      makeOrg(),
      makeBreed(),
    ]);
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    return { exhibitor, show, order };
  }

  beforeEach(() => {
    vi.mocked(emailService.sendRefundFailedAlertEmail).mockClear();
  });

  it('flips the refund row to failed, restores the original payment to succeeded, and alerts the founders (full refund)', async () => {
    const { order } = await orderReadyForRefund();
    const intentId = 'pi_test_refund_failed_full';
    const original = await makePayment({
      orderId: order.id,
      stripePaymentId: intentId,
      amount: 5251,
      status: 'refunded',
      refundAmount: 5251,
    });
    const refundRow = await makePayment({
      orderId: order.id,
      stripePaymentId: intentId,
      amount: 5251,
      status: 'refunded',
      type: 'refund',
    });

    injectStripeEvent({
      type: 'refund.failed',
      data: {
        object: { id: 're_test_full', amount: 5251, payment_intent: intentId, status: 'failed' },
      },
    });

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);

    const updatedRefundRow = await testDb.query.payments.findFirst({ where: eq(payments.id, refundRow!.id) });
    expect(updatedRefundRow?.status).toBe('failed');

    const updatedOriginal = await testDb.query.payments.findFirst({ where: eq(payments.id, original!.id) });
    expect(updatedOriginal?.status).toBe('succeeded');
    expect(updatedOriginal?.refundAmount).toBe(0);

    expect(emailService.sendRefundFailedAlertEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendRefundFailedAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: order.id, amountPence: 5251, paymentIntentId: intentId })
    );
  });

  it('restores the original payment to partially_refunded when another refund is still outstanding', async () => {
    const { order } = await orderReadyForRefund();
    const intentId = 'pi_test_refund_failed_partial';
    const original = await makePayment({
      orderId: order.id,
      stripePaymentId: intentId,
      amount: 10000,
      status: 'partially_refunded',
      refundAmount: 5251,
    });
    // Two refunds happened against this payment: 3000 succeeded, 2251 is
    // about to fail. Only the failing one's amount should come back off.
    await makePayment({
      orderId: order.id,
      stripePaymentId: intentId,
      amount: 3000,
      status: 'refunded',
      type: 'refund',
    });
    const failingRefundRow = await makePayment({
      orderId: order.id,
      stripePaymentId: intentId,
      amount: 2251,
      status: 'refunded',
      type: 'refund',
    });

    injectStripeEvent({
      type: 'refund.failed',
      data: {
        object: { id: 're_test_partial', amount: 2251, payment_intent: intentId, status: 'failed' },
      },
    });

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);

    const updatedFailingRow = await testDb.query.payments.findFirst({ where: eq(payments.id, failingRefundRow!.id) });
    expect(updatedFailingRow?.status).toBe('failed');

    const updatedOriginal = await testDb.query.payments.findFirst({ where: eq(payments.id, original!.id) });
    expect(updatedOriginal?.status).toBe('partially_refunded');
    expect(updatedOriginal?.refundAmount).toBe(3000);
  });

  it('is idempotent — a replayed refund.failed event does not double-subtract or re-alert', async () => {
    const { order } = await orderReadyForRefund();
    const intentId = 'pi_test_refund_failed_replay';
    const original = await makePayment({
      orderId: order.id,
      stripePaymentId: intentId,
      amount: 5251,
      status: 'refunded',
      refundAmount: 5251,
    });
    await makePayment({
      orderId: order.id,
      stripePaymentId: intentId,
      amount: 5251,
      status: 'refunded',
      type: 'refund',
    });
    const event = {
      type: 'refund.failed',
      data: { object: { id: 're_test_replay', amount: 5251, payment_intent: intentId, status: 'failed' } },
    };

    injectStripeEvent(event);
    await stripeWebhook(buildStripeWebhookRequest() as never);
    injectStripeEvent(event);
    const res2 = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res2.status).toBe(200);

    const updatedOriginal = await testDb.query.payments.findFirst({ where: eq(payments.id, original!.id) });
    expect(updatedOriginal?.status).toBe('succeeded');
    expect(updatedOriginal?.refundAmount).toBe(0); // never goes negative on replay

    expect(emailService.sendRefundFailedAlertEmail).toHaveBeenCalledTimes(1);
  });

  it('refund.updated with status succeeded does nothing', async () => {
    const { order } = await orderReadyForRefund();
    const intentId = 'pi_test_refund_updated_succeeded';
    const original = await makePayment({
      orderId: order.id,
      stripePaymentId: intentId,
      amount: 5251,
      status: 'refunded',
      refundAmount: 5251,
    });
    const refundRow = await makePayment({
      orderId: order.id,
      stripePaymentId: intentId,
      amount: 5251,
      status: 'refunded',
      type: 'refund',
    });

    injectStripeEvent({
      type: 'refund.updated',
      data: {
        object: { id: 're_test_updated', amount: 5251, payment_intent: intentId, status: 'succeeded' },
      },
    });

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);

    const unchangedRefundRow = await testDb.query.payments.findFirst({ where: eq(payments.id, refundRow!.id) });
    expect(unchangedRefundRow?.status).toBe('refunded');
    const unchangedOriginal = await testDb.query.payments.findFirst({ where: eq(payments.id, original!.id) });
    expect(unchangedOriginal?.status).toBe('refunded');
    expect(unchangedOriginal?.refundAmount).toBe(5251);

    expect(emailService.sendRefundFailedAlertEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/stripe — signature handling', () => {
  it('returns 400 when the stripe-signature header is missing', async () => {
    const res = await stripeWebhook(
      buildStripeWebhookRequest('{}', {} /* no signature header */) as never,
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/stripe-signature/);
  });

  it('returns 400 when signature verification throws', async () => {
    vi.mocked(stripeService.getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error('No matching signature');
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/signature verification/);
  });
});
