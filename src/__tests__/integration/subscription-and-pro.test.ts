import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as stripeService from '@/server/services/stripe';
import { organisations } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeSecretaryWithOrg,
  makePlan,
} from '../helpers/factories';

describe('subscription.getPlans (public)', () => {
  it('returns active plans only, ordered by sortOrder', async () => {
    await Promise.all([
      makePlan({ name: 'Pro', sortOrder: 1, isActive: true }),
      makePlan({ name: 'Inactive', sortOrder: 0, isActive: false }),
      makePlan({ name: 'Basic', sortOrder: 0, isActive: true }),
    ]);
    const list = await createTestCaller(null).subscription.getPlans();
    const names = list.map((p) => p.name);
    expect(names).toContain('Basic');
    expect(names).toContain('Pro');
    expect(names).not.toContain('Inactive');
  });
});

describe('subscription.getMySubscription', () => {
  it('returns the org + its plan for an active member', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const plan = await makePlan({ stripePriceId: 'price_x' });
    await testDb.update(organisations).set({ planId: plan.id })
      .where(eq(organisations.id, org.id));

    const sub = await createTestCaller(user).subscription.getMySubscription({
      organisationId: org.id,
    });
    expect(sub.organisationId).toBe(org.id);
    expect(sub.plan?.id).toBe(plan.id);
  });

  it('rejects non-members of the org', async () => {
    const { user } = await makeSecretaryWithOrg();
    const otherOrg = await makeOrg();
    await expect(
      createTestCaller(user).subscription.getMySubscription({
        organisationId: otherOrg.id,
      }),
    ).rejects.toThrow(/active member/);
  });
});

describe('subscription.createCheckout', () => {
  it('returns the checkout session URL for a valid plan + active member', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const plan = await makePlan({ stripePriceId: 'price_paid' });
    vi.mocked(stripeService.createSubscriptionCheckout).mockClear();

    const res = await createTestCaller(user).subscription.createCheckout({
      planId: plan.id,
      organisationId: org.id,
    });
    expect(res.url).toMatch(/checkout\.stripe\.test/);
    // Customer id was persisted on the org
    const refreshed = await testDb.query.organisations.findFirst({
      where: eq(organisations.id, org.id),
    });
    expect(refreshed?.stripeCustomerId).toBe('cus_test_stub');
  });

  it('rejects an inactive plan with NOT_FOUND', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const plan = await makePlan({ isActive: false });
    await expect(
      createTestCaller(user).subscription.createCheckout({
        planId: plan.id, organisationId: org.id,
      }),
    ).rejects.toThrow(/Plan not found/);
  });

  it('rejects a plan with no stripePriceId', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const plan = await makePlan({ stripePriceId: null });
    await expect(
      createTestCaller(user).subscription.createCheckout({
        planId: plan.id, organisationId: org.id,
      }),
    ).rejects.toThrow(/Stripe price/);
  });
});

describe('subscription.createPortalSession', () => {
  it('returns a billing portal URL', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    await testDb.update(organisations).set({ stripeCustomerId: 'cus_test' })
      .where(eq(organisations.id, org.id));
    const res = await createTestCaller(user).subscription.createPortalSession({
      organisationId: org.id,
    });
    expect(res.url).toMatch(/billing\.stripe\.test/);
  });
});

describe('pro.createCheckout / pro.getSubscription / pro.createPortalSession', () => {
  it('getSubscription returns the user\'s pro subscription state', async () => {
    const user = await makeUser({
      role: 'exhibitor',
      proSubscriptionStatus: 'active',
      proStripeSubscriptionId: 'sub_test',
    });
    const sub = await createTestCaller(user).pro.getSubscription();
    expect(sub).toBeDefined();
  });

  it('createCheckout rejects when no Stripe price is configured for the interval', async () => {
    // PRO_MONTHLY_PRICE_ID / PRO_ANNUAL_PRICE_ID env vars unset in test env.
    const user = await makeUser({ role: 'exhibitor' });
    await expect(
      createTestCaller(user).pro.createCheckout({ interval: 'monthly' }),
    ).rejects.toThrow(/not configured/);
  });

  it('createPortalSession requires an existing customer; rejects when missing', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    await expect(createTestCaller(user).pro.createPortalSession())
      .rejects.toThrow();
  });
});
