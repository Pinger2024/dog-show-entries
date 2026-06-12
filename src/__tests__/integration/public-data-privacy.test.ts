import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeShow,
  makeBreed,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeShowClass,
  makeResult,
} from '../helpers/factories';

/**
 * Regression tests for the 2026-06-12 public-data privacy hotfix.
 *
 * Three leaks, one theme — data crossing from club/secretary scope into
 * public payloads:
 *  1. Club payout bank details (sort code / account number) embedded in
 *     every public show response via the full organisations row.
 *  2. Draft shows (incl. secretary PII) enumerable through the public
 *     shows.list status filter.
 *  3. The public dog profile revealing upcoming-show entries (pre-judging
 *     risk) and keyed-in-but-unpublished results/achievements.
 */

const anon = () => createTestCaller(null);

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

describe('public payloads never include club bank details', () => {
  it('shows.getById returns the organisation without payout or Stripe fields', async () => {
    // makeOrg defaults to payment-ready: payout details are set.
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });

    const result = await anon().shows.getById({ id: show.id });
    const orgPayload = result.organisation as Record<string, unknown>;

    expect(orgPayload.name).toBe(org.name);
    expect(orgPayload).not.toHaveProperty('payoutSortCode');
    expect(orgPayload).not.toHaveProperty('payoutAccountNumber');
    expect(orgPayload).not.toHaveProperty('payoutAccountName');
    expect(orgPayload).not.toHaveProperty('stripeCustomerId');
    expect(orgPayload).not.toHaveProperty('stripeSubscriptionId');
    expect(orgPayload).not.toHaveProperty('stripeAccountId');
  });

  it('shows.list returns organisations without payout or Stripe fields', async () => {
    const org = await makeOrg();
    await makeShow({ organisationId: org.id, status: 'entries_open' });

    const { items } = await anon().shows.list({ limit: 20, cursor: 0 });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const orgPayload = item.organisation as Record<string, unknown>;
      expect(orgPayload).not.toHaveProperty('payoutSortCode');
      expect(orgPayload).not.toHaveProperty('payoutAccountNumber');
      expect(orgPayload).not.toHaveProperty('stripeCustomerId');
    }
  });

  it('steward.getLiveResults returns the organisation without payout fields', async () => {
    const org = await makeOrg();
    const show = await makeShow({
      organisationId: org.id,
      status: 'in_progress',
      startDate: pastDate(0),
      endDate: pastDate(0),
    });

    const live = await anon().steward.getLiveResults({ showId: show.id });
    const orgPayload = live.show.organisation as Record<string, unknown>;
    expect(orgPayload.name).toBe(org.name);
    expect(orgPayload).not.toHaveProperty('payoutSortCode');
    expect(orgPayload).not.toHaveProperty('payoutAccountNumber');
  });
});

describe('draft shows are not publicly enumerable', () => {
  it('shows.list rejects a draft status filter outright', async () => {
    await expect(
      // The enum no longer admits 'draft' — cast simulates a crafted request.
      anon().shows.list({ status: 'draft' as never, limit: 20, cursor: 0 })
    ).rejects.toThrow();
  });

  it('default shows.list never includes draft or cancelled shows', async () => {
    const org = await makeOrg();
    const draft = await makeShow({ organisationId: org.id, status: 'draft' });
    const cancelled = await makeShow({ organisationId: org.id, status: 'cancelled' });
    await makeShow({ organisationId: org.id, status: 'entries_open' });

    const { items } = await anon().shows.list({ limit: 100, cursor: 0 });
    const ids = items.map((s) => s.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(cancelled.id);
  });
});

describe('public dog profile pre-judging and publication gates', () => {
  it('hides upcoming-show entries from the public but not from the owner', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const upcomingShow = await makeShow({
      organisationId: org.id,
      status: 'entries_open',
      startDate: futureDate(14),
      endDate: futureDate(14),
    });
    await makeEntry({
      showId: upcomingShow.id,
      dogId: dog.id,
      exhibitorId: owner.id,
      status: 'confirmed',
    });

    // A judge (or anyone) must not see the dog is entered in a future show.
    const publicView = await anon().dogs.getPublicProfile({ id: dog.id });
    expect(publicView.showHistory).toHaveLength(0);
    expect(publicView.stats.totalShows).toBe(0);

    // The owner still sees their own upcoming entry.
    const ownerView = await createTestCaller(owner).dogs.getPublicProfile({ id: dog.id });
    expect(ownerView.showHistory).toHaveLength(1);
  });

  it('hides unpublished results from the public until publication', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const pastShow = await makeShow({
      organisationId: org.id,
      status: 'completed',
      startDate: pastDate(7),
      endDate: pastDate(7),
    });
    const showClass = await makeShowClass({ showId: pastShow.id, breedId: breed.id });
    const entry = await makeEntry({
      showId: pastShow.id,
      dogId: dog.id,
      exhibitorId: owner.id,
      status: 'confirmed',
    });
    const entryClass = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const result = await makeResult({ entryClassId: entryClass.id, placement: 1 });

    // Keyed in but not yet published: the show appears (it's in the past)
    // but the placement does not.
    let publicView = await anon().dogs.getPublicProfile({ id: dog.id });
    expect(publicView.showHistory).toHaveLength(1);
    expect(publicView.showHistory[0]!.classes[0]!.placement).toBeNull();
    expect(publicView.stats.firsts).toBe(0);

    // Publish, and the placement becomes visible.
    await testDb
      .update(results)
      .set({ publishedAt: new Date() })
      .where(eq(results.id, result.id));

    publicView = await anon().dogs.getPublicProfile({ id: dog.id });
    expect(publicView.showHistory[0]!.classes[0]!.placement).toBe(1);
    expect(publicView.stats.firsts).toBe(1);
  });

  it('timeline.getForDog only surfaces published results', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const pastShow = await makeShow({
      organisationId: org.id,
      status: 'completed',
      startDate: pastDate(7),
      endDate: pastDate(7),
    });
    const showClass = await makeShowClass({ showId: pastShow.id, breedId: breed.id });
    const entry = await makeEntry({
      showId: pastShow.id,
      dogId: dog.id,
      exhibitorId: owner.id,
      status: 'confirmed',
    });
    const entryClass = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const result = await makeResult({ entryClassId: entryClass.id, placement: 2 });

    let timeline = await anon().timeline.getForDog({ dogId: dog.id, limit: 20 });
    expect(timeline.items.filter((i) => i.itemType === 'show_result')).toHaveLength(0);

    await testDb
      .update(results)
      .set({ publishedAt: new Date() })
      .where(eq(results.id, result.id));

    timeline = await anon().timeline.getForDog({ dogId: dog.id, limit: 20 });
    expect(timeline.items.filter((i) => i.itemType === 'show_result')).toHaveLength(1);
  });
});
