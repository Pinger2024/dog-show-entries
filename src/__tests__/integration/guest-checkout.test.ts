/**
 * Buying extras WITHOUT signing in — Mandy, 15 Oct 2026: "Just extras, no dog"
 * asks only for a name and an email, no password. Design:
 * docs/DESIGN-extras-without-dog-2026-10-15.md (slice 2).
 *
 * The order is filed under the person with that email (found or created by
 * services/people.ts) and goes through the ONE checkout, placeOrder. The guest
 * path must never cancel someone else's payment, never rename an account,
 * never say whether an email is on Remi, and never take a dog entry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import * as stripeService from '@/server/services/stripe';
import * as emailService from '@/server/services/email';
import { orders, shows, users, sundryItems as sundryItemsTable } from '@/server/db/schema';
import { createCaller } from '@/server/trpc/router';
import { resetGuestCheckoutLimits } from '@/server/services/rate-limit';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeOrg, makeBreed, makeShow, makeDog, makeShowClass, makeClassDef } from '../helpers/factories';
import { injectStripeEvent, buildStripeWebhookRequest } from '../helpers/stripe-event';
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route';

function guestCaller(clientIp: string | null = '203.0.113.7') {
  return createCaller({ db: testDb, session: null, impersonating: null, callerIsAdmin: false, clientIp });
}

async function setup() {
  const breed = await makeBreed();
  const org = await makeOrg();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open', firstEntryFee: 1000 });
  const [catalogue] = await testDb
    .insert(sundryItemsTable)
    .values({ showId: show.id, name: 'Printed Catalogue', priceInPence: 500, sortOrder: 0, enabled: true })
    .returning();
  return { breed, org, show, catalogue: catalogue! };
}

const buyer = (email: string, name = 'Pat Buyer') => ({ name, email });

/** The client secret the stubbed createPaymentIntent handed back for an order. */
async function secretFor(orderId: string): Promise<string> {
  const order = await testDb.query.orders.findFirst({ where: eq(orders.id, orderId) });
  return `${order!.stripePaymentIntentId}_secret_browser`;
}

describe('orders.guestCheckout', () => {
  beforeEach(() => {
    resetGuestCheckoutLimits();
    vi.mocked(stripeService.cancelPaymentIntent).mockClear();
    vi.mocked(stripeService.retrievePaymentIntent).mockReset();
    vi.mocked(stripeService.retrievePaymentIntent).mockResolvedValue(null);
  });

  it('a new email: one lower-case person (named, no password), an extras-only order, paid by the webhook', async () => {
    const { show, catalogue } = await setup();
    vi.mocked(stripeService.createPaymentIntent).mockClear();

    const result = await guestCaller().orders.guestCheckout({
      showId: show.id,
      sundryItems: [{ sundryItemId: catalogue.id, quantity: 2 }],
      buyer: buyer(' Pat.Buyer@Test.Local ', '  Pat Buyer '),
    });

    expect(result.totalAmount).toBe(1000);
    expect(result.entryCount).toBe(0);
    expect(result.clientSecret).toBeTruthy();

    const people = await testDb.select().from(users).where(eq(users.email, 'pat.buyer@test.local'));
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe('Pat Buyer');
    expect(people[0].passwordHash).toBeNull();

    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.exhibitorId).toBe(people[0].id);
    expect(order?.status).toBe('pending_payment');
    expect(order?.platformFeePence).toBe(100 + Math.round(1000 * 0.01));

    const metadata = vi.mocked(stripeService.createPaymentIntent).mock.calls.at(-1)![1];
    expect(metadata.buyer).toBe('guest');
    expect(metadata.exhibitorId).toBe(people[0].id);

    vi.mocked(emailService.sendOrderPaidEmails).mockClear();
    injectStripeEvent({ type: 'payment_intent.succeeded', data: { object: { id: order!.stripePaymentIntentId, metadata } } });
    expect((await stripeWebhook(buildStripeWebhookRequest() as never)).status).toBe(200);
    expect((await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) }))?.status).toBe('paid');
    expect(emailService.sendOrderPaidEmails).toHaveBeenCalledWith(result.orderId);
  });

  it('an email already on Remi (typed in another case): filed under that account, its name untouched, same answer shape', async () => {
    const { show, catalogue } = await setup();
    const jane = await makeUser({ email: 'jane@test.local', name: 'Jane Smith' });

    const result = await guestCaller().orders.guestCheckout({
      showId: show.id,
      sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
      buyer: buyer('JANE@test.local', 'Not Jane'),
    });

    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.exhibitorId).toBe(jane.id);
    const [row] = await testDb.select().from(users).where(eq(users.id, jane.id));
    expect(row.name).toBe('Jane Smith');
    expect(Object.keys(result).sort()).toEqual(
      ['clientSecret', 'entryCount', 'freeEntry', 'grossAmount', 'orderId', 'platformFeePence', 'totalAmount'],
    );
  });

  it("never cancels someone else's open checkout just because their email was typed", async () => {
    const { show, catalogue, breed } = await setup();
    const jane = await makeUser({ email: 'jane@test.local' });
    const dog = await makeDog({ ownerId: jane.id, breedId: breed.id });
    const def = await makeClassDef({ name: 'Open' });
    const cls = await makeShowClass({ showId: show.id, classDefinitionId: def.id, breedId: breed.id, entryFee: 1000 });
    const janes = await createTestCaller(jane as never).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [cls.id] }],
    });

    await guestCaller().orders.guestCheckout({
      showId: show.id,
      sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
      buyer: buyer('jane@test.local'),
    });

    const still = await testDb.query.orders.findFirst({ where: eq(orders.id, janes.orderId) });
    expect(still?.status).toBe('pending_payment');
    expect(stripeService.cancelPaymentIntent).not.toHaveBeenCalled();
  });

  it("cancels the browser's own earlier checkout when it proves it with the client secret — even after the email changed", async () => {
    const { show, catalogue } = await setup();
    const first = await guestCaller().orders.guestCheckout({
      showId: show.id,
      sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
      buyer: buyer('first.try@test.local'),
    });
    const secret = await secretFor(first.orderId);
    const firstOrder = await testDb.query.orders.findFirst({ where: eq(orders.id, first.orderId) });
    vi.mocked(stripeService.retrievePaymentIntent).mockResolvedValue({ client_secret: secret } as never);

    await guestCaller().orders.guestCheckout({
      showId: show.id,
      sundryItems: [{ sundryItemId: catalogue.id, quantity: 2 }],
      buyer: buyer('second.try@test.local'),
      previousOrder: { orderId: first.orderId, clientSecret: secret },
    });

    expect((await testDb.query.orders.findFirst({ where: eq(orders.id, first.orderId) }))?.status).toBe('cancelled');
    expect(stripeService.cancelPaymentIntent).toHaveBeenCalledWith(firstOrder!.stripePaymentIntentId);
  });

  it('a wrong secret, or an order at another show, is left alone and the new checkout still goes ahead', async () => {
    const { show, catalogue } = await setup();
    const first = await guestCaller().orders.guestCheckout({
      showId: show.id,
      sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
      buyer: buyer('guest@test.local'),
    });
    const realSecret = await secretFor(first.orderId);
    vi.mocked(stripeService.retrievePaymentIntent).mockResolvedValue({ client_secret: realSecret } as never);

    const guessed = await guestCaller().orders.guestCheckout({
      showId: show.id,
      sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
      buyer: buyer('guest@test.local'),
      previousOrder: { orderId: first.orderId, clientSecret: realSecret.replace('_secret_browser', '_secret_guess') },
    });
    expect(guessed.orderId).not.toBe(first.orderId);

    const other = await setup();
    await guestCaller().orders.guestCheckout({
      showId: other.show.id,
      sundryItems: [{ sundryItemId: other.catalogue.id, quantity: 1 }],
      buyer: buyer('guest@test.local'),
      previousOrder: { orderId: first.orderId, clientSecret: realSecret },
    });

    expect((await testDb.query.orders.findFirst({ where: eq(orders.id, first.orderId) }))?.status).toBe('pending_payment');
    expect(stripeService.cancelPaymentIntent).not.toHaveBeenCalled();
  });

  it('takes no dog entry, no empty cart, and no signed-in caller', async () => {
    const { show, catalogue } = await setup();
    await expect(
      guestCaller().orders.guestCheckout({
        showId: show.id,
        sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
        buyer: buyer('dog@test.local'),
        // A hand-made request: the field doesn't exist, so it is stripped.
        ...({ entries: [{ entryType: 'standard', dogId: catalogue.id, classIds: [] }] } as object),
      }),
    ).resolves.toMatchObject({ entryCount: 0 });

    await expect(
      guestCaller().orders.guestCheckout({ showId: show.id, sundryItems: [], buyer: buyer('empty@test.local') }),
    ).rejects.toThrow();

    const signedIn = await makeUser();
    await expect(
      createTestCaller(signedIn as never).orders.guestCheckout({
        showId: show.id,
        sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
        buyer: buyer('me@test.local'),
      }),
    ).rejects.toThrow(/signed in/);
  });

  it('refuses a show that is not taking entries, through the one checkout', async () => {
    const { show, catalogue } = await setup();
    await testDb.update(shows).set({ status: 'entries_closed' }).where(eq(shows.id, show.id));
    await expect(
      guestCaller().orders.guestCheckout({
        showId: show.id,
        sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
        buyer: buyer('late@test.local'),
      }),
    ).rejects.toThrow(/not accepting entries/);
  });

  it('limits attempts per address and per email', async () => {
    const { show, catalogue } = await setup();
    const attempt = (email: string, ip: string) =>
      guestCaller(ip).orders.guestCheckout({
        showId: show.id,
        sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
        buyer: buyer(email),
      });

    for (let i = 0; i < 5; i++) await attempt('same@test.local', `198.51.100.${i}`);
    await expect(attempt('same@test.local', '198.51.100.99')).rejects.toThrow(/Too many tries/);

    resetGuestCheckoutLimits();
    for (let i = 0; i < 10; i++) await attempt(`p${i}@test.local`, '192.0.2.1');
    await expect(attempt('p99@test.local', '192.0.2.1')).rejects.toThrow(/Too many tries/);
    await expect(attempt('p99@test.local', '192.0.2.2')).resolves.toBeTruthy();
  });
});
