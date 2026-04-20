import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import * as stripeService from '@/server/services/stripe';
import { organisations, shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeMembership,
  makeBreed,
  makeShow,
} from '../helpers/factories';

/**
 * Connect onboarding + gating tests.
 *
 * The Stripe service module is mocked wholesale in setup.ts — here we just
 * verify the tRPC procedures and the payment-gate check the right things,
 * and that the mocks see the right argument shapes.
 */

async function orgWithSecretary(override: Partial<typeof organisations.$inferInsert> = {}) {
  const secretary = await makeUser({ role: 'secretary' });
  const org = await makeOrg({
    contactEmail: 'secretary@club.test',
    // Deliberately start from "no Stripe Connect" — the factory's default is
    // active, which hides the pre-Connect code paths we're exercising here.
    stripeAccountId: null,
    stripeAccountStatus: 'not_started',
    stripeChargesEnabled: false,
    stripeDetailsSubmitted: false,
    stripePayoutsEnabled: false,
    ...override,
  });
  await makeMembership({ userId: secretary.id, organisationId: org.id });
  return { secretary, org };
}

describe('stripeConnect.getStatus', () => {
  it('returns the default not_started state for a fresh org', async () => {
    const { secretary, org } = await orgWithSecretary();
    const caller = createTestCaller(secretary);

    const status = await caller.stripeConnect.getStatus({ organisationId: org.id });

    expect(status.status).toBe('not_started');
    expect(status.accountId).toBeNull();
    expect(status.chargesEnabled).toBe(false);
  });

  it('rejects users who are not active members of the org', async () => {
    const { org } = await orgWithSecretary();
    const stranger = await makeUser({ role: 'secretary' }); // different org, no membership here
    const caller = createTestCaller(stranger);

    await expect(
      caller.stripeConnect.getStatus({ organisationId: org.id })
    ).rejects.toThrow(/not an active member/);
  });
});

describe('stripeConnect.startOnboarding', () => {
  beforeEach(() => {
    vi.mocked(stripeService.createConnectAccount).mockClear();
    vi.mocked(stripeService.createConnectOnboardingLink).mockClear();
  });

  it('creates a new connected account on first call, stashes the id on the org, and returns a hosted-onboarding URL', async () => {
    const { secretary, org } = await orgWithSecretary();
    const caller = createTestCaller(secretary);

    const res = await caller.stripeConnect.startOnboarding({
      organisationId: org.id,
    });

    expect(res.url).toBe('https://connect.stripe.test/onboard');

    expect(vi.mocked(stripeService.createConnectAccount)).toHaveBeenCalledWith({
      email: 'secretary@club.test',
      organisationId: org.id,
      organisationName: org.name,
    });

    const refreshed = await testDb.query.organisations.findFirst({
      where: eq(organisations.id, org.id),
    });
    expect(refreshed?.stripeAccountId).toMatch(/^acct_test_/);
    expect(refreshed?.stripeAccountStatus).toBe('pending');
  });

  it('reuses the existing Stripe account id on resume — does NOT mint a new account', async () => {
    const { secretary, org } = await orgWithSecretary({
      stripeAccountId: 'acct_preexisting',
      stripeAccountStatus: 'pending',
    });
    const caller = createTestCaller(secretary);

    await caller.stripeConnect.startOnboarding({ organisationId: org.id });

    expect(vi.mocked(stripeService.createConnectAccount)).not.toHaveBeenCalled();
    expect(vi.mocked(stripeService.createConnectOnboardingLink)).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acct_preexisting' })
    );
  });

  it('falls back to the signed-in user email when the org has no contactEmail of its own', async () => {
    const secretary = await makeUser({ role: 'secretary', email: 'fallback@test.local' });
    const org = await makeOrg({
      contactEmail: null,
      stripeAccountId: null,
      stripeAccountStatus: 'not_started',
      stripeChargesEnabled: false,
    });
    await makeMembership({ userId: secretary.id, organisationId: org.id });
    const caller = createTestCaller(secretary);

    await caller.stripeConnect.startOnboarding({ organisationId: org.id });

    expect(vi.mocked(stripeService.createConnectAccount)).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'fallback@test.local' })
    );
  });
});

describe('stripeConnect.refreshStatus', () => {
  it('pulls the latest flags from Stripe and mirrors them into the org row', async () => {
    const { secretary, org } = await orgWithSecretary({
      stripeAccountId: 'acct_pending_review',
      stripeAccountStatus: 'pending',
    });
    const caller = createTestCaller(secretary);

    const res = await caller.stripeConnect.refreshStatus({
      organisationId: org.id,
    });

    expect(res.status).toBe('active'); // from setup.ts mock default
    expect(res.refreshed).toBe(true);

    const refreshed = await testDb.query.organisations.findFirst({
      where: eq(organisations.id, org.id),
    });
    expect(refreshed?.stripeAccountStatus).toBe('active');
    expect(refreshed?.stripeChargesEnabled).toBe(true);
    expect(refreshed?.stripeOnboardingCompletedAt).not.toBeNull();
  });

  it('is a no-op for orgs with no account id yet', async () => {
    const { secretary, org } = await orgWithSecretary(); // not_started
    const caller = createTestCaller(secretary);

    const res = await caller.stripeConnect.refreshStatus({
      organisationId: org.id,
    });

    expect(res.refreshed).toBe(false);
  });
});

describe('shows.update entries_open gate', () => {
  it('throws PRECONDITION_FAILED if the host org has no active Stripe Connect account', async () => {
    const { secretary, org } = await orgWithSecretary(); // not_started
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'published',
    });
    const caller = createTestCaller(secretary);

    await expect(
      caller.shows.update({ id: show.id, status: 'entries_open' })
    ).rejects.toThrow(/Payments page/);

    const still = await testDb.query.shows.findFirst({
      where: eq(shows.id, show.id),
    });
    expect(still?.status).toBe('published');
  });

  it('allows entries_open once the org has charges_enabled=true', async () => {
    // Factory default org has Connect active, so this should just work.
    const secretary = await makeUser({ role: 'secretary' });
    const org = await makeOrg();
    await makeMembership({ userId: secretary.id, organisationId: org.id });
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'published',
    });
    const caller = createTestCaller(secretary);

    const res = await caller.shows.update({
      id: show.id,
      status: 'entries_open',
    });
    expect(res.status).toBe('entries_open');
  });
});

describe('secretary.getChecklistAutoDetect stripe_connected', () => {
  it('is true for an active+charges-enabled org, false otherwise', async () => {
    // False case
    const { secretary: s1, org: org1 } = await orgWithSecretary();
    const breed = await makeBreed();
    const show1 = await makeShow({
      organisationId: org1.id,
      breedId: breed.id,
    });
    const caller1 = createTestCaller(s1);
    const detected1 = await caller1.secretary.getChecklistAutoDetect({ showId: show1.id });
    expect(detected1.stripe_connected).toBe(false);

    // True case — factory default org
    const s2 = await makeUser({ role: 'secretary' });
    const org2 = await makeOrg();
    await makeMembership({ userId: s2.id, organisationId: org2.id });
    const show2 = await makeShow({
      organisationId: org2.id,
      breedId: breed.id,
    });
    const caller2 = createTestCaller(s2);
    const detected2 = await caller2.secretary.getChecklistAutoDetect({ showId: show2.id });
    expect(detected2.stripe_connected).toBe(true);
  });
});
