import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
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
 * "Remi as merchant of record" — clubs give us their bank details in one
 * simple form; Remi holds the entry money and BACS it on to them after
 * the show. No Stripe Connect, no hosted onboarding, no KYC.
 *
 * These tests cover the live-and-shipping shape: the updatePayoutDetails
 * validation, the entries_open gate, and the checklist auto-detect key.
 */

async function orgWithSecretary(override: Partial<typeof organisations.$inferInsert> = {}) {
  const secretary = await makeUser({ role: 'secretary' });
  // Start from "no payout details" so we can exercise the gate. The
  // factory default is payment-ready; we override to null here.
  const org = await makeOrg({
    payoutAccountName: null,
    payoutSortCode: null,
    payoutAccountNumber: null,
    ...override,
  });
  await makeMembership({ userId: secretary.id, organisationId: org.id });
  return { secretary, org };
}

describe('secretary.getPayoutDetails', () => {
  it('returns nulls when no details are saved', async () => {
    const { secretary, org } = await orgWithSecretary();
    const caller = createTestCaller(secretary);

    const details = await caller.secretary.getPayoutDetails({
      organisationId: org.id,
    });

    expect(details.accountName).toBeNull();
    expect(details.sortCode).toBeNull();
    expect(details.accountNumber).toBeNull();
  });

  it('returns the saved details for authorised members', async () => {
    const { secretary, org } = await orgWithSecretary({
      payoutAccountName: 'Test Club',
      payoutSortCode: '10-88-00',
      payoutAccountNumber: '00012345',
    });
    const caller = createTestCaller(secretary);

    const details = await caller.secretary.getPayoutDetails({
      organisationId: org.id,
    });

    expect(details.accountName).toBe('Test Club');
    expect(details.sortCode).toBe('10-88-00');
    expect(details.accountNumber).toBe('00012345');
  });
});

describe('secretary.updatePayoutDetails', () => {
  it('saves valid bank details and normalises the sort code', async () => {
    const { secretary, org } = await orgWithSecretary();
    const caller = createTestCaller(secretary);

    // Accept un-hyphenated sort code on input; output should be hyphenated.
    await caller.secretary.updatePayoutDetails({
      organisationId: org.id,
      accountName: 'Clyde Valley GSD Club',
      sortCode: '108800',
      accountNumber: '00012345',
    });

    const refreshed = await testDb.query.organisations.findFirst({
      where: eq(organisations.id, org.id),
    });
    expect(refreshed?.payoutAccountName).toBe('Clyde Valley GSD Club');
    expect(refreshed?.payoutSortCode).toBe('10-88-00');
    expect(refreshed?.payoutAccountNumber).toBe('00012345');
  });

  it('rejects malformed sort codes', async () => {
    const { secretary, org } = await orgWithSecretary();
    const caller = createTestCaller(secretary);

    await expect(
      caller.secretary.updatePayoutDetails({
        organisationId: org.id,
        accountName: 'Test',
        sortCode: '12345', // too short
        accountNumber: '00012345',
      })
    ).rejects.toThrow(/Sort code/i);
  });

  it('rejects malformed account numbers', async () => {
    const { secretary, org } = await orgWithSecretary();
    const caller = createTestCaller(secretary);

    await expect(
      caller.secretary.updatePayoutDetails({
        organisationId: org.id,
        accountName: 'Test',
        sortCode: '10-88-00',
        accountNumber: '1234', // too short
      })
    ).rejects.toThrow(/Account number/i);
  });
});

describe('shows.update entries_open gate', () => {
  it('throws PRECONDITION_FAILED if the host org has no payout bank details', async () => {
    const { secretary, org } = await orgWithSecretary(); // no payout details
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'published',
    });
    const caller = createTestCaller(secretary);

    await expect(
      caller.shows.update({ id: show.id, status: 'entries_open' })
    ).rejects.toThrow(/bank details/);

    const still = await testDb.query.shows.findFirst({
      where: eq(shows.id, show.id),
    });
    expect(still?.status).toBe('published');
  });

  it('allows entries_open once the org has payout details saved', async () => {
    // Factory default org has payout details; should just work.
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

describe('secretary.getChecklistAutoDetect payout_details_set', () => {
  it('is true only when all three bank fields are populated', async () => {
    // False case
    const { secretary: s1, org: org1 } = await orgWithSecretary();
    const breed = await makeBreed();
    const show1 = await makeShow({
      organisationId: org1.id,
      breedId: breed.id,
    });
    const caller1 = createTestCaller(s1);
    const detected1 = await caller1.secretary.getChecklistAutoDetect({ showId: show1.id });
    expect(detected1.payout_details_set).toBe(false);

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
    expect(detected2.payout_details_set).toBe(true);
  });
});
