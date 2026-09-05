import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results, entries, entryClasses, shows } from '@/server/db/schema';
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
  makeJudge,
  makeJudgeAssignment,
  lockShowResults,
} from '../helpers/factories';

/** A confirmed entry on an in_progress show, with a steward assigned. Lock open. */
async function showWithStewardAndEntry() {
  const [steward, exhibitor, org, breed] = await Promise.all([
    makeUser({ role: 'steward' }),
    makeUser({ role: 'exhibitor' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'in_progress',
  });
  const [, showClass, dog] = await Promise.all([
    makeStewardAssignment({ userId: steward.id, showId: show.id }),
    makeShowClass({ showId: show.id, breedId: breed.id }),
    makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
  ]);
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
    await lockShowResults(show.id);
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

  it('rejects a second dog into a placement another dog already holds', async () => {
    const { steward, exhibitor, breed, show, showClass, ec } = await showWithStewardAndEntry();
    // A second confirmed dog in the SAME class.
    const dogB = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entryB = await makeEntry({
      showId: show.id,
      dogId: dogB.id,
      exhibitorId: exhibitor.id,
      status: 'confirmed',
    });
    const ecB = await makeEntryClass({ entryId: entryB.id, showClassId: showClass.id });
    const caller = createTestCaller(steward);

    await caller.steward.recordResult({ entryClassId: ec.id, placement: 1 });

    await expect(
      caller.steward.recordResult({ entryClassId: ecB.id, placement: 1 }),
    ).rejects.toThrow(/already taken/);
  });

  it('still lets the same entry change its own placement (no false clash)', async () => {
    const { steward, ec } = await showWithStewardAndEntry();
    const caller = createTestCaller(steward);

    await caller.steward.recordResult({ entryClassId: ec.id, placement: 1 });
    const res = await caller.steward.recordResult({ entryClassId: ec.id, placement: 2 });

    expect(res.placement).toBe(2);
  });

  it('lets the same placement be reused in a DIFFERENT class', async () => {
    const { steward, exhibitor, breed, show, ec } = await showWithStewardAndEntry();
    // A second class + dog on the same show — placement 1 there must be allowed.
    const otherClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const dogB = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entryB = await makeEntry({
      showId: show.id,
      dogId: dogB.id,
      exhibitorId: exhibitor.id,
      status: 'confirmed',
    });
    const ecB = await makeEntryClass({ entryId: entryB.id, showClassId: otherClass.id });
    const caller = createTestCaller(steward);

    await caller.steward.recordResult({ entryClassId: ec.id, placement: 1 });
    const res = await caller.steward.recordResult({ entryClassId: ecB.id, placement: 1 });

    expect(res.placement).toBe(1);
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

  // Real incident (Mandy 2026-08-12): a dog absent from her breed class was
  // shown — and placed 1st — in a Special Award class at the same show.
  // Attendance is per CLASS, so a placement in one class must succeed while
  // the same entry is absent in another, and must still be refused in the
  // class she's actually absent from.
  it('records a placement in one class while the same entry is absent in another', async () => {
    const { steward, show, ec } = await showWithStewardAndEntry();
    const specialAwardClass = await makeShowClass({ showId: show.id });
    const ecSpecial = await makeEntryClass({ entryId: ec.entryId, showClassId: specialAwardClass.id });
    const caller = createTestCaller(steward);

    await caller.steward.markAbsent({ entryClassId: ec.id, absent: true });

    const result = await caller.steward.recordResult({ entryClassId: ecSpecial.id, placement: 1 });
    expect(result.placement).toBe(1);

    await expect(
      caller.steward.recordResult({ entryClassId: ec.id, placement: 1 }),
    ).rejects.toThrow(/Cannot record a placement for an absent entry/);
  });
});

/** An entries_closed show with a steward + one confirmed entry, on a given
 *  start date, ready for the very first placing. */
async function closedShowReadyForFirstResult(startDate: string) {
  const [steward, exhibitor, org, breed] = await Promise.all([
    makeUser({ role: 'steward' }),
    makeUser({ role: 'exhibitor' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_closed',
    startDate,
    endDate: startDate,
  });
  const [, showClass, dog] = await Promise.all([
    makeStewardAssignment({ userId: steward.id, showId: show.id }),
    makeShowClass({ showId: show.id, breedId: breed.id }),
    makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
  ]);
  const entry = await makeEntry({
    showId: show.id,
    dogId: dog.id,
    exhibitorId: exhibitor.id,
    status: 'confirmed',
  });
  const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { steward, show, ec };
}

describe('steward.recordResult — auto-start the show on show day', () => {
  const PAST = '2020-01-01'; // show day has passed → reached
  const FUTURE = '2999-01-01'; // show day is years away → not reached

  it('flips entries_closed → in_progress on the first placing on show day', async () => {
    const { steward, show, ec } = await closedShowReadyForFirstResult(PAST);
    await createTestCaller(steward).steward.recordResult({ entryClassId: ec.id, placement: 1 });

    const after = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(after?.status).toBe('in_progress');
  });

  it('does NOT start the show before show day', async () => {
    const { steward, show, ec } = await closedShowReadyForFirstResult(FUTURE);
    await createTestCaller(steward).steward.recordResult({ entryClassId: ec.id, placement: 1 });

    const after = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(after?.status).toBe('entries_closed');
  });

  it('never runs backwards — a completed show stays completed', async () => {
    const { steward, show, ec } = await closedShowReadyForFirstResult(PAST);
    await testDb.update(shows).set({ status: 'completed' }).where(eq(shows.id, show.id));
    await createTestCaller(steward).steward.recordResult({ entryClassId: ec.id, placement: 1 });

    const after = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(after?.status).toBe('completed');
  });

  it('is idempotent — a second placing leaves an already-started show in_progress', async () => {
    const { steward, show, ec } = await closedShowReadyForFirstResult(PAST);
    const caller = createTestCaller(steward);
    await caller.steward.recordResult({ entryClassId: ec.id, placement: 1 }); // flips it
    await caller.steward.recordResult({ entryClassId: ec.id, placement: 2 }); // no-op transition

    const after = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(after?.status).toBe('in_progress');
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
    await lockShowResults(show.id);
    const caller = createTestCaller(steward);

    await expect(
      caller.steward.removeResult({ entryClassId: ec.id }),
    ).rejects.toThrow(/published and locked/);
  });
});

describe('steward.markAbsent', () => {
  it('flips the entry_class absent flag and rolls entries.absent up to true when it was the only class', async () => {
    const { steward, entry, ec } = await showWithStewardAndEntry();
    const caller = createTestCaller(steward);

    await caller.steward.markAbsent({ entryClassId: ec.id, absent: true });

    const updatedEc = await testDb.query.entryClasses.findFirst({ where: eq(entryClasses.id, ec.id) });
    expect(updatedEc?.absent).toBe(true);
    const updatedEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(updatedEntry?.absent).toBe(true);
  });

  it('leaves entries.absent false when only SOME of the entry classes are absent', async () => {
    const { steward, show, entry, ec } = await showWithStewardAndEntry();
    // A second class on the SAME entry — the Special Award she's still shown in.
    const specialAwardClass = await makeShowClass({ showId: show.id });
    await makeEntryClass({ entryId: entry.id, showClassId: specialAwardClass.id });
    const caller = createTestCaller(steward);

    await caller.steward.markAbsent({ entryClassId: ec.id, absent: true });

    const updatedEc = await testDb.query.entryClasses.findFirst({ where: eq(entryClasses.id, ec.id) });
    expect(updatedEc?.absent).toBe(true);
    const updatedEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(updatedEntry?.absent).toBe(false);
  });

  it('rolls entries.absent back to false when the last absent class is unmarked', async () => {
    const { steward, show, entry, ec } = await showWithStewardAndEntry();
    const secondClass = await makeShowClass({ showId: show.id });
    const ec2 = await makeEntryClass({ entryId: entry.id, showClassId: secondClass.id, absent: true });
    await testDb.update(entryClasses).set({ absent: true }).where(eq(entryClasses.id, ec.id));
    await testDb.update(entries).set({ absent: true }).where(eq(entries.id, entry.id));
    const caller = createTestCaller(steward);

    await caller.steward.markAbsent({ entryClassId: ec2.id, absent: false });

    const updatedEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(updatedEntry?.absent).toBe(false);
  });

  it('allows attendance changes on a completed show once results are not locked', async () => {
    const { steward, show, ec } = await showWithStewardAndEntry();
    await testDb.update(shows).set({ status: 'completed' }).where(eq(shows.id, show.id));
    const caller = createTestCaller(steward);

    const result = await caller.steward.markAbsent({ entryClassId: ec.id, absent: true });
    expect(result.entryClass.absent).toBe(true);
  });

  it('still refuses attendance changes on a cancelled show', async () => {
    const { steward, show, ec } = await showWithStewardAndEntry();
    await testDb.update(shows).set({ status: 'cancelled' }).where(eq(shows.id, show.id));
    const caller = createTestCaller(steward);

    await expect(
      caller.steward.markAbsent({ entryClassId: ec.id, absent: true }),
    ).rejects.toThrow(/cancelled/);
  });

  it('refuses attendance changes once results are published and locked', async () => {
    const { steward, show, ec } = await showWithStewardAndEntry();
    await lockShowResults(show.id);
    const caller = createTestCaller(steward);

    await expect(
      caller.steward.markAbsent({ entryClassId: ec.id, absent: true }),
    ).rejects.toThrow(/published and locked/);
  });
});

describe('steward.submitForJudgeApproval', () => {
  it('refuses to email the judge before any results are recorded', async () => {
    const { steward, show, breed } = await showWithStewardAndEntry();
    const judge = await makeJudge({ contactEmail: 'judge@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const caller = createTestCaller(steward);

    await expect(
      caller.steward.submitForJudgeApproval({ showId: show.id, judgeId: judge.id }),
    ).rejects.toThrow(/record at least one result/i);
  });

  it('sends once at least one result exists', async () => {
    const { steward, show, breed, ec } = await showWithStewardAndEntry();
    const judge = await makeJudge({ contactEmail: 'judge@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const caller = createTestCaller(steward);

    await caller.steward.recordResult({ entryClassId: ec.id, placement: 1 });
    const res = await caller.steward.submitForJudgeApproval({ showId: show.id, judgeId: judge.id });

    expect(res.sent).toBe(true);
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
    const [steward, org] = await Promise.all([
      makeUser({ role: 'steward' }),
      makeOrg(),
    ]);
    const [draftShow, cancelledShow, liveShow] = await Promise.all([
      makeShow({ organisationId: org.id, status: 'draft' }),
      makeShow({ organisationId: org.id, status: 'cancelled' }),
      makeShow({ organisationId: org.id, status: 'in_progress' }),
    ]);
    await Promise.all([
      makeStewardAssignment({ userId: steward.id, showId: draftShow.id }),
      makeStewardAssignment({ userId: steward.id, showId: cancelledShow.id }),
      makeStewardAssignment({ userId: steward.id, showId: liveShow.id }),
    ]);

    const caller = createTestCaller(steward);
    const myShows = await caller.steward.getMyShows();

    expect(myShows.map((s) => s.id)).toEqual([liveShow.id]);
  });
});
