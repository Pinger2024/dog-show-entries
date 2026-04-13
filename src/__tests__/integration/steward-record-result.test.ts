import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results, entries, shows } from '@/server/db/schema';
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
  makeEntryClass,
  makeResult,
  makeStewardAssignment,
} from '../helpers/factories';

/** A confirmed entry on an in_progress show, with a steward assigned. Lock open. */
async function showWithStewardAndEntry() {
  const steward = await makeUser({ role: 'steward' });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'in_progress',
  });
  await makeStewardAssignment({ userId: steward.id, showId: show.id });
  const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
  const entry = await makeEntry({
    showId: show.id,
    dogId: dog.id,
    exhibitorId: exhibitor.id,
    status: 'confirmed',
  });
  const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { steward, exhibitor, org, breed, show, showClass, dog, entry, ec };
}

describe('steward.recordResult', () => {
  it('records a placement for a confirmed entry', async () => {
    const { steward, ec } = await showWithStewardAndEntry();
    const caller = createTestCaller(steward);

    const result = await caller.steward.recordResult({
      entryClassId: ec.id,
      placement: 1,
    });

    expect(result.placement).toBe(1);
    expect(result.recordedBy).toBe(steward.id);
    expect(result.publishedAt).toBeNull();
  });

  it('overwrites an existing result on re-record (upsert)', async () => {
    const { steward, ec } = await showWithStewardAndEntry();
    const caller = createTestCaller(steward);

    await caller.steward.recordResult({ entryClassId: ec.id, placement: 1 });
    await caller.steward.recordResult({ entryClassId: ec.id, placement: 2 });

    const rows = await testDb.query.results.findMany({
      where: eq(results.entryClassId, ec.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.placement).toBe(2);
  });

  it('records placementStatus instead of a numeric placement', async () => {
    const { steward, ec } = await showWithStewardAndEntry();
    const caller = createTestCaller(steward);

    const result = await caller.steward.recordResult({
      entryClassId: ec.id,
      placement: null,
      placementStatus: 'withheld',
    });

    expect(result.placement).toBeNull();
    expect(result.placementStatus).toBe('withheld');
  });

  it('refuses to record once results are locked (post-publish)', async () => {
    const { steward, show, ec } = await showWithStewardAndEntry();
    // Simulate publish: set the lock directly without going through publishResults.
    await testDb
      .update(shows)
      .set({ resultsLockedAt: new Date(), resultsPublishedAt: new Date() })
      .where(eq(shows.id, show.id));
    const caller = createTestCaller(steward);

    await expect(
      caller.steward.recordResult({ entryClassId: ec.id, placement: 1 }),
    ).rejects.toThrow(/published and locked/);
  });

  it('rejects a steward not assigned to the show', async () => {
    const { ec } = await showWithStewardAndEntry();
    const intruder = await makeUser({ role: 'steward' });
    const caller = createTestCaller(intruder);

    await expect(
      caller.steward.recordResult({ entryClassId: ec.id, placement: 1 }),
    ).rejects.toThrow(/not assigned/);
  });

  it('rejects recording for a non-confirmed entry', async () => {
    const { steward, exhibitor, breed, show, showClass } = await showWithStewardAndEntry();
    // Build a SECOND entry that is still pending (e.g. abandoned checkout)
    const dog2 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const pendingEntry = await makeEntry({
      showId: show.id,
      dogId: dog2.id,
      exhibitorId: exhibitor.id,
      status: 'pending',
    });
    const pendingEc = await makeEntryClass({
      entryId: pendingEntry.id,
      showClassId: showClass.id,
    });
    const caller = createTestCaller(steward);

    await expect(
      caller.steward.recordResult({ entryClassId: pendingEc.id, placement: 1 }),
    ).rejects.toThrow(/non-confirmed/);
  });
});

describe('steward.removeResult', () => {
  it('deletes the result row', async () => {
    const { steward, ec } = await showWithStewardAndEntry();
    await makeResult({ entryClassId: ec.id, placement: 3, recordedBy: steward.id });
    const caller = createTestCaller(steward);

    const res = await caller.steward.removeResult({ entryClassId: ec.id });

    expect(res.removed).toBe(true);
    const rows = await testDb.query.results.findMany({
      where: eq(results.entryClassId, ec.id),
    });
    expect(rows).toHaveLength(0);
  });

  it('refuses to remove once results are locked', async () => {
    const { steward, show, ec } = await showWithStewardAndEntry();
    await makeResult({ entryClassId: ec.id, placement: 1, recordedBy: steward.id });
    await testDb
      .update(shows)
      .set({ resultsLockedAt: new Date(), resultsPublishedAt: new Date() })
      .where(eq(shows.id, show.id));
    const caller = createTestCaller(steward);

    await expect(
      caller.steward.removeResult({ entryClassId: ec.id }),
    ).rejects.toThrow(/published and locked/);
  });
});

describe('steward.markAbsent', () => {
  it('flips the entry.absent flag', async () => {
    const { steward, entry } = await showWithStewardAndEntry();
    const caller = createTestCaller(steward);

    await caller.steward.markAbsent({ entryId: entry.id, absent: true });

    const updated = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(updated?.absent).toBe(true);
  });

  it('rejects modification once the show is completed', async () => {
    const { steward, show, entry } = await showWithStewardAndEntry();
    await testDb.update(shows).set({ status: 'completed' }).where(eq(shows.id, show.id));
    const caller = createTestCaller(steward);

    await expect(
      caller.steward.markAbsent({ entryId: entry.id, absent: true }),
    ).rejects.toThrow(/completed or cancelled/);
  });
});

describe('steward.getMyShows', () => {
  it('returns only shows the steward is assigned to', async () => {
    const { steward, show } = await showWithStewardAndEntry();
    // Build another show, no assignment
    const otherOrg = await makeOrg();
    await makeShow({ organisationId: otherOrg.id, status: 'in_progress' });

    const caller = createTestCaller(steward);
    const myShows = await caller.steward.getMyShows();

    expect(myShows).toHaveLength(1);
    expect(myShows[0]?.id).toBe(show.id);
  });

  it('filters out drafts and cancelled assignments', async () => {
    const steward = await makeUser({ role: 'steward' });
    const org = await makeOrg();
    const draftShow = await makeShow({ organisationId: org.id, status: 'draft' });
    const cancelledShow = await makeShow({ organisationId: org.id, status: 'cancelled' });
    const liveShow = await makeShow({ organisationId: org.id, status: 'in_progress' });
    await makeStewardAssignment({ userId: steward.id, showId: draftShow.id });
    await makeStewardAssignment({ userId: steward.id, showId: cancelledShow.id });
    await makeStewardAssignment({ userId: steward.id, showId: liveShow.id });

    const caller = createTestCaller(steward);
    const myShows = await caller.steward.getMyShows();

    expect(myShows.map((s) => s.id)).toEqual([liveShow.id]);
  });
});
