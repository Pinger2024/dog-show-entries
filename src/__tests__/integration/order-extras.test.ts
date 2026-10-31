/**
 * Add extras to an existing entry — design doc, research/DESIGN-add-extras-
 * to-entry-2026-09-21.md. Mandy, 21 Sept: an exhibitor entered weeks ago and
 * phoned to pay Class Sponsorship after the fact; today sundries are only
 * buyable at checkout.
 *
 * Extras live on the entry's EXISTING order (same pattern as the class-change
 * top-up): `orders.previewExtras` prices read-only via `priceOrderExtras`
 * (ONE owner, src/server/services/order-extras-pricing.ts); `orders.addExtras`
 * applies free items immediately or defers anything with a cost into a
 * PaymentIntent's metadata, applied by the Stripe webhook's `type: 'extras'`
 * branch on success — exactly as `entries.update`'s upgrade branch defers a
 * class-change top-up.
 */
import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as stripeService from '@/server/services/stripe';
import * as emailService from '@/server/services/email';
import { orders, orderSundryItems, payments, entryAuditLog, sundryItems as sundryItemsTable, shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeOrder,
} from '../helpers/factories';
import { injectStripeEvent, buildStripeWebhookRequest } from '../helpers/stripe-event';
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route';

async function setupPaidEntry(showOverrides: Partial<Parameters<typeof makeShow>[0]> = {}) {
  const [exhibitor, org, breed] = await Promise.all([
    makeUser({ role: 'exhibitor' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    firstEntryFee: 1000,
    ...showOverrides,
  });
  const [showClass, dog] = await Promise.all([
    makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 1000 }),
    makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
  ]);
  const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 1000 });
  const entry = await makeEntry({
    showId: show.id,
    dogId: dog.id,
    exhibitorId: exhibitor.id,
    status: 'confirmed',
    totalFee: 1000,
    orderId: order.id,
  });

  const [catalogueItem, sponsorshipItem, donationItem] = await Promise.all([
    testDb.insert(sundryItemsTable).values({
      showId: show.id, name: 'Catalogue', priceInPence: 500, sortOrder: 0, enabled: true, maxPerOrder: 1,
    }).returning().then((r) => r[0]!),
    testDb.insert(sundryItemsTable).values({
      showId: show.id, name: 'Class Sponsorship', priceInPence: 1500, sortOrder: 1, enabled: true, maxPerOrder: null,
    }).returning().then((r) => r[0]!),
    testDb.insert(sundryItemsTable).values({
      showId: show.id, name: 'Donation', priceInPence: 100, sortOrder: 2, enabled: true, maxPerOrder: null,
    }).returning().then((r) => r[0]!),
  ]);

  return { exhibitor, org, breed, show, showClass, dog, order, entry, catalogueItem, sponsorshipItem, donationItem };
}

describe('orders.previewExtras / addExtras — the add-extras-to-entry journey', () => {
  it('previewExtras matches addExtras, the webhook applies on success, order totals bump by exactly subtotal/fee, payment succeeds, audit + email fire once, and a replay does not double', async () => {
    const { exhibitor, order, entry, sponsorshipItem, donationItem } = await setupPaidEntry();
    vi.mocked(stripeService.createPaymentIntent).mockClear();
    vi.mocked(emailService.sendExtrasAddedEmail).mockClear();

    const items = [
      { sundryItemId: sponsorshipItem.id, quantity: 1 },
      { sundryItemId: donationItem.id, quantity: 2 },
    ];

    const preview = await createTestCaller(exhibitor).orders.previewExtras({
      orderId: order.id,
      items,
    });
    const expectedSubtotal = 1500 + 2 * 100; // 1700
    expect(preview.subtotalPence).toBe(expectedSubtotal);
    expect(preview.platformFeePence).toBe(100 + Math.round(expectedSubtotal * 0.01));
    expect(preview.requiresPayment).toBe(true);

    const result = await createTestCaller(exhibitor).orders.addExtras({
      orderId: order.id,
      entryId: entry.id,
      items,
    });
    expect(result.requiresPayment).toBe(true);
    expect('clientSecret' in result && !!result.clientSecret).toBe(true);

    // Nothing applied yet — deferred until the webhook sees success.
    const beforeRows = await testDb.query.orderSundryItems.findMany({ where: eq(orderSundryItems.orderId, order.id) });
    expect(beforeRows).toHaveLength(0);
    const orderBefore = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(orderBefore?.totalAmount).toBe(1000);

    const adjPayment = await testDb.query.payments.findFirst({ where: eq(payments.orderId, order.id) });
    expect(adjPayment?.status).toBe('pending');
    expect(adjPayment?.type).toBe('adjustment');
    const intentId = adjPayment!.stripePaymentId!;
    const metadata = vi.mocked(stripeService.createPaymentIntent).mock.calls.at(-1)![1];
    expect(metadata.type).toBe('extras');
    expect(metadata.orderId).toBe(order.id);
    expect(metadata.entryId).toBe(entry.id);
    expect(metadata.subtotalPence).toBe(String(expectedSubtotal));
    expect(metadata.platformFeePence).toBe(String(preview.platformFeePence));

    // Webhook confirms the top-up.
    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: intentId, metadata } },
    });
    const webhookRes = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(webhookRes.status).toBe(200);

    const rows = await testDb.query.orderSundryItems.findMany({ where: eq(orderSundryItems.orderId, order.id) });
    expect(rows).toHaveLength(2);
    const sponsorshipRow = rows.find((r) => r.sundryItemId === sponsorshipItem.id);
    const donationRow = rows.find((r) => r.sundryItemId === donationItem.id);
    expect(sponsorshipRow?.quantity).toBe(1);
    expect(donationRow?.quantity).toBe(2);

    const orderAfter = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(orderAfter?.totalAmount).toBe(1000 + expectedSubtotal);
    expect(orderAfter?.platformFeePence).toBe(preview.platformFeePence);

    const paidPayment = await testDb.query.payments.findFirst({ where: eq(payments.stripePaymentId, intentId) });
    expect(paidPayment?.status).toBe('succeeded');

    const audit = await testDb.query.entryAuditLog.findMany({ where: eq(entryAuditLog.entryId, entry.id) });
    const applied = audit.filter((a) => a.action === 'extras_added' && (a.changes as { via?: string })?.via === 'extras_payment');
    expect(applied).toHaveLength(1);

    expect(vi.mocked(emailService.sendExtrasAddedEmail)).toHaveBeenCalledTimes(1);

    // Replay the SAME event — nothing doubles.
    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: intentId, metadata } },
    });
    await stripeWebhook(buildStripeWebhookRequest() as never);

    const rowsAfterReplay = await testDb.query.orderSundryItems.findMany({ where: eq(orderSundryItems.orderId, order.id) });
    expect(rowsAfterReplay).toHaveLength(2);
    const orderAfterReplay = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(orderAfterReplay?.totalAmount).toBe(1000 + expectedSubtotal);
    expect(orderAfterReplay?.platformFeePence).toBe(preview.platformFeePence);
    expect(vi.mocked(emailService.sendExtrasAddedEmail)).toHaveBeenCalledTimes(1);
  });

  it('cap: catalogue already on the order → requesting another → over_max', async () => {
    const { exhibitor, order, catalogueItem } = await setupPaidEntry();
    await testDb.insert(orderSundryItems).values({
      orderId: order.id, sundryItemId: catalogueItem.id, quantity: 1, unitPrice: 500,
    });

    await expect(
      createTestCaller(exhibitor).orders.previewExtras({
        orderId: order.id,
        items: [{ sundryItemId: catalogueItem.id, quantity: 1 }],
      })
    ).rejects.toThrow(/Maximum 1/i);
  });

  it('window: entryCloseDate yesterday with a stale status="entries_open" refuses the purchase', async () => {
    const { exhibitor, order, sponsorshipItem, show } = await setupPaidEntry();
    await testDb.update(shows)
      .set({ entryCloseDate: new Date(Date.now() - 60_000) })
      .where(eq(shows.id, show.id));

    await expect(
      createTestCaller(exhibitor).orders.previewExtras({
        orderId: order.id,
        items: [{ sundryItemId: sponsorshipItem.id, quantity: 1 }],
      })
    ).rejects.toThrow(/closed/i);
  });

  it('offline (cash/BACS) order → refused with a "contact the secretary" message, never a card charge', async () => {
    // show-metrics keys "the club already holds this money" on
    // orders.stripePaymentIntentId IS NULL; card extras on such an order
    // would be attributed to the club as cash and never settled.
    const { exhibitor, show, dog, sponsorshipItem } = await setupPaidEntry();
    const offlineOrder = await makeOrder({
      showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 1000, stripePaymentIntentId: null,
    });
    const offlineEntry = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed', totalFee: 1000, orderId: offlineOrder.id,
    });
    vi.mocked(stripeService.createPaymentIntent).mockClear();
    const caller = createTestCaller(exhibitor);
    const items = [{ sundryItemId: sponsorshipItem.id, quantity: 1 }];
    await expect(caller.orders.previewExtras({ orderId: offlineOrder.id, items })).rejects.toThrow(/paid directly to the club/);
    await expect(
      caller.orders.addExtras({ orderId: offlineOrder.id, entryId: offlineEntry.id, items }),
    ).rejects.toThrow(/paid directly to the club/);
    expect(vi.mocked(stripeService.createPaymentIntent)).not.toHaveBeenCalled();
  });

  it('wrong owner → FORBIDDEN', async () => {
    const { order, sponsorshipItem } = await setupPaidEntry();
    const stranger = await makeUser({ role: 'exhibitor' });

    await expect(
      createTestCaller(stranger).orders.previewExtras({
        orderId: order.id,
        items: [{ sundryItemId: sponsorshipItem.id, quantity: 1 }],
      })
    ).rejects.toThrow();
  });

  it('entry without a matching order → clear error from addExtras', async () => {
    const { exhibitor, order, sponsorshipItem, show, breed } = await setupPaidEntry();
    const otherDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const foreignEntry = await makeEntry({
      showId: show.id,
      dogId: otherDog.id,
      exhibitorId: exhibitor.id,
      status: 'confirmed',
      // No orderId — legacy/unlinked entry.
    });

    await expect(
      createTestCaller(exhibitor).orders.addExtras({
        orderId: order.id,
        entryId: foreignEntry.id,
        items: [{ sundryItemId: sponsorshipItem.id, quantity: 1 }],
      })
    ).rejects.toThrow(/entry not found/i);
  });

  it('free-only extras are applied immediately, with no Stripe call', async () => {
    const { exhibitor, order, entry, show } = await setupPaidEntry();
    const freeItem = await testDb.insert(sundryItemsTable).values({
      showId: show.id, name: 'Welcome Pack', priceInPence: 0, sortOrder: 3, enabled: true,
    }).returning().then((r) => r[0]!);
    vi.mocked(stripeService.createPaymentIntent).mockClear();

    const result = await createTestCaller(exhibitor).orders.addExtras({
      orderId: order.id,
      entryId: entry.id,
      items: [{ sundryItemId: freeItem.id, quantity: 1 }],
    });

    expect(result.requiresPayment).toBe(false);
    expect(vi.mocked(stripeService.createPaymentIntent)).not.toHaveBeenCalled();

    const rows = await testDb.query.orderSundryItems.findMany({ where: eq(orderSundryItems.orderId, order.id) });
    expect(rows).toHaveLength(1);
    const orderAfter = await testDb.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(orderAfter?.totalAmount).toBe(1000);
    expect(orderAfter?.platformFeePence).toBe(0);
    expect(vi.mocked(emailService.sendExtrasAddedEmail)).toHaveBeenCalled();
  });
});
