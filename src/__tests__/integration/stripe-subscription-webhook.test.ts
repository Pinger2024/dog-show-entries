import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as stripeService from '@/server/services/stripe';
import { organisations, users } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route';
import { makeUser, makeOrg, makePlan } from '../helpers/factories';
import { injectStripeEvent, buildStripeWebhookRequest } from '../helpers/stripe-event';

/** Helpers to build minimal Stripe-shaped objects for the subscription handlers. */
const subscriptionEvent = (
  type: 'checkout.session.completed' | 'customer.subscription.updated' | 'customer.subscription.deleted',
  obj: Record<string, unknown>,
) => ({ type, data: { object: obj } });

describe('checkout.session.completed — organisation subscription', () => {
  it('activates an organisation subscription and links the plan via priceId', async () => {
    const org = await makeOrg();
    const plan = await makePlan({ stripePriceId: 'price_test_org' });

    // The handler retrieves the full subscription from Stripe to read priceId + period_end.
    vi.mocked(stripeService.getStripe).mockReturnValue({
      webhooks: { constructEvent: vi.fn(() => subscriptionEvent('checkout.session.completed', {
        mode: 'subscription',
        subscription: 'sub_test_org',
        customer: 'cus_test_org',
        metadata: { organisationId: org.id },
      })) },
      subscriptions: {
        retrieve: vi.fn(async () => ({
          items: { data: [{ price: { id: 'price_test_org' }, current_period_end: 9999999999 }] },
        })),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);

    const refreshed = await testDb.query.organisations.findFirst({ where: eq(organisations.id, org.id) });
    expect(refreshed?.subscriptionStatus).toBe('active');
    expect(refreshed?.stripeCustomerId).toBe('cus_test_org');
    expect(refreshed?.stripeSubscriptionId).toBe('sub_test_org');
    expect(refreshed?.planId).toBe(plan.id);
    expect(refreshed?.subscriptionCurrentPeriodEnd).toBeInstanceOf(Date);
  });

  it('activates a Pro user subscription on checkout', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    vi.mocked(stripeService.getStripe).mockReturnValue({
      webhooks: { constructEvent: vi.fn(() => subscriptionEvent('checkout.session.completed', {
        mode: 'subscription',
        subscription: 'sub_test_pro',
        customer: 'cus_test_pro',
        metadata: { type: 'pro', userId: user.id },
      })) },
      subscriptions: {
        retrieve: vi.fn(async () => ({
          items: { data: [{ price: { id: 'price_test_pro' }, current_period_end: 9999999999 }] },
        })),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);

    const refreshed = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(refreshed?.proSubscriptionStatus).toBe('active');
    expect(refreshed?.proStripeSubscriptionId).toBe('sub_test_pro');
    expect(refreshed?.stripeCustomerId).toBe('cus_test_pro');
  });

  it('no-ops on non-subscription checkout sessions', async () => {
    injectStripeEvent(subscriptionEvent('checkout.session.completed', {
      mode: 'payment',
      subscription: null,
      customer: 'cus_unused',
      metadata: {},
    }));
    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);
  });
});

describe('customer.subscription.updated', () => {
  it('updates an organisation\'s subscriptionStatus + plan when the subscription changes', async () => {
    const org = await makeOrg();
    await testDb.update(organisations).set({
      stripeSubscriptionId: 'sub_to_update',
      subscriptionStatus: 'active',
    }).where(eq(organisations.id, org.id));
    const newPlan = await makePlan({ stripePriceId: 'price_new' });

    injectStripeEvent(subscriptionEvent('customer.subscription.updated', {
      id: 'sub_to_update',
      status: 'past_due',
      items: { data: [{ price: { id: 'price_new' }, current_period_end: 9999999999 }] },
      metadata: {},
    }));

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);
    const refreshed = await testDb.query.organisations.findFirst({ where: eq(organisations.id, org.id) });
    expect(refreshed?.subscriptionStatus).toBe('past_due');
    expect(refreshed?.planId).toBe(newPlan.id);
  });

  it('updates a Pro user subscription status', async () => {
    const user = await makeUser({
      role: 'exhibitor',
      proStripeSubscriptionId: 'sub_pro_update',
      proSubscriptionStatus: 'active',
    });
    injectStripeEvent(subscriptionEvent('customer.subscription.updated', {
      id: 'sub_pro_update',
      status: 'canceled',
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: 9999999999 }] },
      metadata: { type: 'pro', userId: user.id },
    }));

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);
    const refreshed = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(refreshed?.proSubscriptionStatus).toBe('cancelled');
  });
});

describe('customer.subscription.deleted', () => {
  it('marks an organisation cancelled and clears its planId', async () => {
    const org = await makeOrg();
    const plan = await makePlan();
    await testDb.update(organisations).set({
      stripeSubscriptionId: 'sub_to_delete',
      planId: plan.id,
      subscriptionStatus: 'active',
    }).where(eq(organisations.id, org.id));

    injectStripeEvent(subscriptionEvent('customer.subscription.deleted', {
      id: 'sub_to_delete',
      metadata: {},
    }));

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);
    const refreshed = await testDb.query.organisations.findFirst({ where: eq(organisations.id, org.id) });
    expect(refreshed?.subscriptionStatus).toBe('cancelled');
    expect(refreshed?.planId).toBeNull();
  });

  it('marks a Pro user cancelled', async () => {
    const user = await makeUser({
      role: 'exhibitor',
      proStripeSubscriptionId: 'sub_pro_delete',
      proSubscriptionStatus: 'active',
    });
    injectStripeEvent(subscriptionEvent('customer.subscription.deleted', {
      id: 'sub_pro_delete',
      metadata: { type: 'pro', userId: user.id },
    }));

    const res = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(res.status).toBe(200);
    const refreshed = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(refreshed?.proSubscriptionStatus).toBe('cancelled');
  });
});
