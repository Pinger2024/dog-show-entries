import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import * as stripeService from '@/server/services/stripe';
import * as emailService from '@/server/services/email';
import { entries, orders, payments } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeOrder,
  makePayment,
} from '../helpers/factories';
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route';

/**
 * The webhook calls `getStripe().webhooks.constructEvent()` to verify the
 * signature. We bypass verification by handing the mocked Stripe client a
 * `constructEvent` that returns whatever event the test wants.
 */
function injectEvent(event: unknown) {
  vi.mocked(stripeService.getStripe).mockReturnValue({
    webhooks: { constructEvent: vi.fn(() => event) },
    // The subscription handler also calls stripe.subscriptions.retrieve;
    // stub it loosely so that path doesn't crash if exercised.
    subscriptions: { retrieve: vi.fn(async () => ({ items: { data: [] } })) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function buildRequest(body = '{}', headers: Record<string, string> = { 'stripe-signature': 't=1,v1=stub' }) {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body,
  });
}

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

    injectEvent({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: intentId,
          metadata: { entryId: entry.id },
        },
      },
    });

    const res = await stripeWebhook(buildRequest() as never);

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
    // Link entries to the order
    await testDb.update(entries).set({ orderId: order.id }).where(eq(entries.id, e1.id));
    await testDb.update(entries).set({ orderId: order.id }).where(eq(entries.id, e2.id));
    const intentId = 'pi_test_order_succeeded';
    await makePayment({ orderId: order.id, stripePaymentId: intentId });

    injectEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: intentId, metadata: { orderId: order.id } } },
    });

    const res = await stripeWebhook(buildRequest() as never);

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

    injectEvent(event);
    await stripeWebhook(buildRequest() as never);
    injectEvent(event);
    const res2 = await stripeWebhook(buildRequest() as never);

    expect(res2.status).toBe(200);
    const final = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(final?.status).toBe('confirmed');
    const finalOrder = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(finalOrder?.status).toBe('paid');
  });

  it('no-ops when the metadata points at no known entry/order', async () => {
    injectEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_unknown', metadata: {} } },
    });

    const res = await stripeWebhook(buildRequest() as never);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/webhooks/stripe — payment_intent.payment_failed', () => {
  it('marks the order failed and the payment row failed', async () => {
    const { exhibitor, show, entry } = await entryReadyForPayment();
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id });
    await testDb.update(entries).set({ orderId: order.id }).where(eq(entries.id, entry.id));
    const intentId = 'pi_test_failed';
    await makePayment({ orderId: order.id, stripePaymentId: intentId });

    injectEvent({
      type: 'payment_intent.payment_failed',
      data: { object: { id: intentId, metadata: { orderId: order.id } } },
    });

    const res = await stripeWebhook(buildRequest() as never);

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

describe('POST /api/webhooks/stripe — signature handling', () => {
  it('returns 400 when the stripe-signature header is missing', async () => {
    const res = await stripeWebhook(
      buildRequest('{}', {} /* no signature header */) as never,
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

    const res = await stripeWebhook(buildRequest() as never);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/signature verification/);
  });
});
