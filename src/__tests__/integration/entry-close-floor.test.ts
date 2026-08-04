import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeSecretaryWithOrgAndBreed,
  makeShow,
} from '../helpers/factories';

/**
 * Mandy's hard rule (2026-08-04, "two weeks give or take a day"): a show's
 * entry close date — and postal close date — must be at least 13 calendar
 * days before the show start date, every show type. Root-cause validation
 * lives in `entry-close-rules.ts` and is enforced at three call sites in
 * shows.ts: `create`, `update` (editing dates), and the `update` transition
 * to `entries_open` (against whatever is already stored).
 *
 * Real-world trigger: North Eastern GSD Club Championship Show 2026 sits in
 * prod with start 11 Oct / close 2 Oct — a 9-day gap. These tests use the
 * same 9-day-gap shape.
 */
describe('shows.create — entry-close floor', () => {
  it('rejects a 9-day gap between entryCloseDate and startDate', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const caller = createTestCaller(user);

    await expect(
      caller.shows.create({
        name: 'Too-Soon Show',
        showType: 'open',
        showScope: 'single_breed',
        organisationId: org.id,
        breedId: breed.id,
        startDate: '2030-06-11',
        endDate: '2030-06-11',
        entryCloseDate: new Date('2030-06-02T12:00:00.000Z').toISOString(), // 9 days before
      })
    ).rejects.toThrow(/at least two weeks before the show/i);

    const created = await testDb.query.shows.findFirst({ where: eq(shows.name, 'Too-Soon Show') });
    expect(created).toBeUndefined();
  });

  it('accepts an entryCloseDate exactly 13 days before startDate', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const caller = createTestCaller(user);

    const created = await caller.shows.create({
      name: 'Exactly Compliant Show',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-06-11',
      endDate: '2030-06-11',
      entryCloseDate: new Date('2030-05-29T12:00:00.000Z').toISOString(), // 13 days before
    });

    expect(created.id).toBeTruthy();
  });
});

describe('shows.update — entry-close floor', () => {
  it('rejects moving entryCloseDate inside the floor', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      startDate: '2030-06-11',
      endDate: '2030-06-11',
      status: 'draft',
    });
    const caller = createTestCaller(user);

    await expect(
      caller.shows.update({
        id: show.id,
        entryCloseDate: new Date('2030-06-02T12:00:00.000Z').toISOString(), // 9 days before
      })
    ).rejects.toThrow(/at least two weeks before the show/i);

    const reloaded = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(reloaded?.entryCloseDate).toBeNull();
  });

  it('rejects moving postalCloseDate inside the floor', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      startDate: '2030-06-11',
      endDate: '2030-06-11',
      status: 'draft',
    });
    const caller = createTestCaller(user);

    await expect(
      caller.shows.update({
        id: show.id,
        postalCloseDate: new Date('2030-06-02T12:00:00.000Z').toISOString(), // 9 days before
      })
    ).rejects.toThrow(/at least two weeks before the show/i);

    const reloaded = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(reloaded?.postalCloseDate).toBeNull();
  });

  it('rejects moving startDate closer when the STORED close date is not in this call\'s input', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    // Compliant when created: 13-day gap against the original 20 Jun start.
    const show = await makeShow({
      organisationId: org.id,
      startDate: '2030-06-20',
      endDate: '2030-06-20',
      entryCloseDate: new Date('2030-06-07T12:00:00.000Z'),
      status: 'draft',
    });
    const caller = createTestCaller(user);

    // Move startDate earlier — the STORED close date is now only a 9-day gap,
    // but this call never mentions entryCloseDate at all.
    await expect(
      caller.shows.update({
        id: show.id,
        startDate: '2030-06-16',
      })
    ).rejects.toThrow(/at least two weeks before the show/i);

    const reloaded = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(reloaded?.startDate).toBe('2030-06-20'); // unchanged — the whole update was rejected
  });

  it('allows moving startDate when the stored close date still clears the floor', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      startDate: '2030-06-20',
      endDate: '2030-06-20',
      entryCloseDate: new Date('2030-06-07T12:00:00.000Z'), // 13-day gap
      status: 'draft',
    });
    const caller = createTestCaller(user);

    // Push startDate LATER — the gap only grows, still compliant.
    const res = await caller.shows.update({ id: show.id, startDate: '2030-06-25' });
    expect(res.startDate).toBe('2030-06-25');
  });
});

describe('shows.update — entries_open transition vs the entry-close floor', () => {
  it('rejects opening entries when the stored close date has a 9-day gap (North Eastern GSD Club shape)', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed(); // payout details set by default
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-06-11',
      endDate: '2030-06-11',
      entryCloseDate: new Date('2030-06-02T12:00:00.000Z'), // 9-day gap
      status: 'published',
    });
    const caller = createTestCaller(user);

    await expect(
      caller.shows.update({ id: show.id, status: 'entries_open' })
    ).rejects.toThrow(/at least two weeks before the show/i);

    const reloaded = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(reloaded?.status).toBe('published'); // unchanged
  });

  it('allows opening entries when the stored close date respects the floor and payout details are set', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-06-11',
      endDate: '2030-06-11',
      entryCloseDate: new Date('2030-05-29T12:00:00.000Z'), // exactly 13-day gap
      status: 'published',
    });
    const caller = createTestCaller(user);

    const res = await caller.shows.update({ id: show.id, status: 'entries_open' });
    expect(res.status).toBe('entries_open');
  });

  it('allows opening entries when the show has no close date set at all', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-06-11',
      endDate: '2030-06-11',
      status: 'published',
    });
    const caller = createTestCaller(user);

    const res = await caller.shows.update({ id: show.id, status: 'entries_open' });
    expect(res.status).toBe('entries_open');
  });
});
