/**
 * Buying extras with NO dog — Mandy approved 15 Oct 2026 (Shirley, GSDL-BRG:
 * "enter a JH / buy a catalogue / buy sponsorship without a dog"). The new
 * shape is a paid order with ZERO entries. Design:
 * docs/DESIGN-extras-without-dog-2026-10-15.md (slice 1).
 */
import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as stripeService from '@/server/services/stripe';
import {
  entries,
  orders,
  orderSundryItems,
  sundryItems as sundryItemsTable,
} from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeJudge,
  makeJudgeAssignment,
  makeSecretaryWithOrg,
} from '../helpers/factories';
import { injectStripeEvent, buildStripeWebhookRequest } from '../helpers/stripe-event';
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route';
import type { RegionalFeeConfig } from '@/server/db/schema/shows';

const REGIONAL_CONFIG: RegionalFeeConfig = {
  tiers: [{ standardPence: 2000, memberPence: 1700 }],
  memberships: [{ label: 'BRG/League member', requiresNumber: true }],
  firstTimeEnabled: true,
  firstTimeFeePence: 0,
  donationsEnabled: true,
};

async function setup(kind: 'rkc' | 'regional') {
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const breed = await makeBreed();
  const org = kind === 'regional' ? (await makeSecretaryWithOrg()).org : await makeOrg();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    firstEntryFee: 1000,
    ...(kind === 'regional'
      ? { showRuleset: 'wusv' as const, showScope: 'single_breed' as const, regionalFeeConfig: REGIONAL_CONFIG }
      : {}),
  });
  const [catalogue] = await testDb
    .insert(sundryItemsTable)
    .values({ showId: show.id, name: 'Printed Catalogue', priceInPence: 500, sortOrder: 0, enabled: true })
    .returning();
  const [parking] = await testDb
    .insert(sundryItemsTable)
    .values({ showId: show.id, name: 'Parking Pass', priceInPence: 300, sortOrder: 1, enabled: true })
    .returning();
  return { exhibitor, breed, org, show, catalogue: catalogue!, parking: parking! };
}

describe.each(['rkc', 'regional'] as const)('extras-only checkout journey (%s show)', (kind) => {
  it('creates a zero-entry order with the right totals, and the webhook marks it paid', async () => {
    const { exhibitor, show, catalogue, parking } = await setup(kind);
    vi.mocked(stripeService.createPaymentIntent).mockClear();

    const result = await createTestCaller(exhibitor as never).orders.checkout({
      showId: show.id,
      entries: [],
      sundryItems: [
        { sundryItemId: catalogue.id, quantity: 2 },
        { sundryItemId: parking.id, quantity: 1 },
      ],
    });

    const subtotal = 2 * 500 + 300;
    expect(result.totalAmount).toBe(subtotal);
    expect(result.entryCount).toBe(0);
    expect(result.freeEntry).toBe(false);

    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.status).toBe('pending_payment');
    expect(order?.totalAmount).toBe(subtotal);
    expect(order?.platformFeePence).toBe(100 + Math.round(subtotal * 0.01));
    expect(order?.donationPence).toBe(0);

    const orderEntries = await testDb.query.entries.findMany({ where: eq(entries.orderId, result.orderId) });
    expect(orderEntries).toHaveLength(0);
    const lines = await testDb.query.orderSundryItems.findMany({ where: eq(orderSundryItems.orderId, result.orderId) });
    expect(lines).toHaveLength(2);

    // Webhook: payment_intent.succeeded marks the order paid with zero entries.
    const metadata = vi.mocked(stripeService.createPaymentIntent).mock.calls.at(-1)![1];
    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: { id: order!.stripePaymentIntentId, metadata } },
    });
    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);
    const paid = await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(paid?.status).toBe('paid');
  });
});

describe('extras-only checkout rules', () => {
  it('refuses a cart with no entries and no extras', async () => {
    const { exhibitor, show } = await setup('rkc');
    await expect(
      createTestCaller(exhibitor as never).orders.checkout({ showId: show.id, entries: [], sundryItems: [] }),
    ).rejects.toThrow(/Choose a dog, a junior handler or at least one extra/);
  });

  it('ignores donation, regional membership and discount group when there are no entries', async () => {
    const { exhibitor, show, catalogue } = await setup('regional');
    const res = await createTestCaller(exhibitor as never).orders.checkout({
      showId: show.id,
      entries: [],
      sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
      donationPence: 2500,
      donationAffix: 'Of Nowhere',
      regionalMembership: 'BRG/League member',
      regionalMembershipNumber: 'BRG-1',
      regionalFirstTimeExhibitor: true,
      catalogueRequested: true,
      withholdFromPublication: true,
    });
    expect(res.totalAmount).toBe(500);
    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, res.orderId) });
    expect(order?.donationPence).toBe(0);
    expect(order?.donationAffix).toBeNull();
    expect(order?.regionalMembership).toBeNull();
    expect(order?.regionalMembershipNumber).toBeNull();
    expect(order?.regionalFirstTimeExhibitor).toBe(false);
    expect(order?.discountGroupId).toBeNull();
  });

  it('lets a judge at the show buy an extra when they are not entering a dog', async () => {
    const { exhibitor, show, catalogue, breed } = await setup('rkc');
    const judge = await makeJudge({ name: 'Judge Judy Judgington' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge!.id, breedId: breed.id });
    const judgeUser = await makeUser({ role: 'exhibitor', name: 'Judge Judy Judgington' });
    void exhibitor;
    const res = await createTestCaller(judgeUser as never).orders.checkout({
      showId: show.id,
      entries: [],
      sundryItems: [{ sundryItemId: catalogue.id, quantity: 1 }],
    });
    expect(res.totalAmount).toBe(500);
  });
});
