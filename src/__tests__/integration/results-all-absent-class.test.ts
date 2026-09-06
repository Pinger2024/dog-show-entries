/**
 * Bug (Mandy, NE GSD Regional, 5 Sept 2026): a class only appears on the live
 * results page once at least one result has been recorded for it. That makes
 * two very different situations look identical — the class is simply absent
 * from the page:
 *   1. Not judged yet — correct to hide.
 *   2. Every dog entered was marked absent — the class WAS reached, nobody
 *      turned up, and there is nothing to record.
 *
 * Real example: class 6b (Puppy Dog Short Coat) vanished entirely because its
 * one confirmed entry was marked absent. This file locks in that case (2) now
 * shows, flagged `allAbsent`, with an empty results array — and that case (1)
 * still hides exactly as before.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results, shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeClassDef,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
  makeStewardAssignment,
} from '../helpers/factories';

const PAST = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

async function baseShow() {
  const [steward, org, breed] = await Promise.all([
    makeUser({ role: 'steward' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showRuleset: 'rkc',
    status: 'in_progress',
    startDate: PAST,
    endDate: PAST,
  });
  await makeStewardAssignment({ userId: steward.id, showId: show.id });
  const classDef = await makeClassDef({ name: 'Puppy Dog' });
  return { steward, org, breed, show, classDef };
}

async function confirmedEntry(showId: string, breedId: string, showClassId: string, opts: { absent?: boolean } = {}) {
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId, sex: 'dog' });
  const entry = await makeEntry({ showId, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
  const ec = await makeEntryClass({ entryId: entry.id, showClassId, absent: opts.absent ?? false });
  return { exhibitor, dog, entry, ec };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findCard(live: any, classId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return live.breedGroups.flatMap((g: any) => g.classes).find((c: any) => c.classId === classId);
}

describe('live results — all-confirmed-entries-absent class (2026-09-06)', () => {
  it('(a) every confirmed entry absent → class appears, flagged allAbsent, with no results', async () => {
    const { steward, breed, show, classDef } = await baseShow();
    const showClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'dog', classNumber: 6,
    });
    await confirmedEntry(show.id, breed.id, showClass.id, { absent: true });
    await confirmedEntry(show.id, breed.id, showClass.id, { absent: true });

    const live = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });
    const card = findCard(live, showClass.id);

    expect(card).toBeDefined();
    expect(card!.allAbsent).toBe(true);
    expect(card!.results).toEqual([]);
    expect(card!.dogsForward).toBe(0);
    expect(card!.entriesCount).toBe(2);

    // Same for a public (unauthenticated) caller — this is pure attendance
    // data, not a gated placement.
    const publicLive = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    const publicCard = findCard(publicLive, showClass.id);
    expect(publicCard).toBeDefined();
    expect(publicCard!.allAbsent).toBe(true);
    expect(publicCard!.results).toEqual([]);
  });

  it('(b) entries present, none absent, no results yet → stays hidden (not judged)', async () => {
    const { steward, breed, show, classDef } = await baseShow();
    const showClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'dog', classNumber: 1,
    });
    await confirmedEntry(show.id, breed.id, showClass.id, { absent: false });
    await confirmedEntry(show.id, breed.id, showClass.id, { absent: false });

    const live = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });
    expect(findCard(live, showClass.id)).toBeUndefined();

    const publicLive = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    expect(findCard(publicLive, showClass.id)).toBeUndefined();
  });

  it('(c) a mix of absent and judged still appears exactly as today (not allAbsent)', async () => {
    const { steward, breed, show, classDef } = await baseShow();
    const showClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'dog', classNumber: 2,
    });
    await confirmedEntry(show.id, breed.id, showClass.id, { absent: true });
    const { ec } = await confirmedEntry(show.id, breed.id, showClass.id, { absent: false });
    const result = await makeResult({ entryClassId: ec.id, placement: 1 });
    await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result.id));

    const live = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });
    const card = findCard(live, showClass.id);
    expect(card).toBeDefined();
    expect(card!.allAbsent).toBe(false);
    expect(card!.results).toHaveLength(1);
    expect(card!.results[0]!.placement).toBe(1);
    expect(card!.dogsForward).toBe(1);
    expect(card!.entriesCount).toBe(2);

    const publicLive = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    const publicCard = findCard(publicLive, showClass.id);
    expect(publicCard).toBeDefined();
    expect(publicCard!.allAbsent).toBe(false);
    expect(publicCard!.results).toHaveLength(1);
  });

  it('(d) a class with zero entries stays hidden', async () => {
    const { steward, breed, show, classDef } = await baseShow();
    const showClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'dog', classNumber: 3,
    });

    const live = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });
    expect(findCard(live, showClass.id)).toBeUndefined();

    const publicLive = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    expect(findCard(publicLive, showClass.id)).toBeUndefined();
  });

  it('(e) publication gating is unchanged for an all-absent class — a stale (or published) result on an absent entry never leaks', async () => {
    const { steward, breed, show, classDef } = await baseShow();
    const showClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'dog', classNumber: 4,
    });
    // A placement was recorded and then the dog was marked absent — the
    // stale result must never surface, published or not (existing
    // `!ec.absent` guard, untouched by this change).
    const { ec: ec1 } = await confirmedEntry(show.id, breed.id, showClass.id, { absent: true });
    await makeResult({ entryClassId: ec1.id, placement: 1 }); // unpublished, stale

    const { ec: ec2 } = await confirmedEntry(show.id, breed.id, showClass.id, { absent: true });
    const publishedStale = await makeResult({ entryClassId: ec2.id, placement: 2 });
    await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, publishedStale.id));

    const live = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });
    const card = findCard(live, showClass.id);
    expect(card).toBeDefined();
    expect(card!.allAbsent).toBe(true);
    expect(card!.results).toEqual([]); // neither stale result leaks, privileged or not

    const publicLive = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    const publicCard = findCard(publicLive, showClass.id);
    expect(publicCard).toBeDefined();
    expect(publicCard!.allAbsent).toBe(true);
    expect(publicCard!.results).toEqual([]);
  });
});

describe('live results — all-absent class respects the show-day lock (2026-09-06)', () => {
  /** Same shape as baseShow() but with a caller-supplied status, so a class
   *  can be built on a show that hasn't started yet (entry lists/attendance
   *  stay hidden from the public until show day everywhere else in the
   *  app — an absence keyed in early must not be the one path that skips
   *  that lock). */
  async function showWithStatus(status: 'entries_closed' | 'in_progress') {
    const [steward, org, breed] = await Promise.all([
      makeUser({ role: 'steward' }),
      makeOrg(),
      makeBreed(),
    ]);
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      showRuleset: 'rkc',
      status,
      startDate: PAST,
      endDate: PAST,
    });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });
    const classDef = await makeClassDef({ name: 'Puppy Dog' });
    return { steward, org, breed, show, classDef };
  }

  it('(f) an all-absent class on a show that has NOT started is hidden from the public but visible to the steward', async () => {
    const { steward, breed, show, classDef } = await showWithStatus('entries_closed');
    const showClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'dog', classNumber: 7,
    });
    await confirmedEntry(show.id, breed.id, showClass.id, { absent: true });

    const publicLive = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    expect(findCard(publicLive, showClass.id)).toBeUndefined();

    const live = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });
    const card = findCard(live, showClass.id);
    expect(card).toBeDefined();
    expect(card!.allAbsent).toBe(true);
    expect(card!.results).toEqual([]);
  });

  it('(g) the same class becomes publicly visible once the show is in_progress', async () => {
    const { steward, breed, show, classDef } = await showWithStatus('in_progress');
    const showClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'dog', classNumber: 8,
    });
    await confirmedEntry(show.id, breed.id, showClass.id, { absent: true });

    const publicLive = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    const publicCard = findCard(publicLive, showClass.id);
    expect(publicCard).toBeDefined();
    expect(publicCard!.allAbsent).toBe(true);
    expect(publicCard!.results).toEqual([]);

    const live = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });
    expect(findCard(live, showClass.id)).toBeDefined();
  });

  it('(h) a normal class with a published result is unaffected by the show-day lock, before or after show day', async () => {
    const { steward, breed, show, classDef } = await showWithStatus('entries_closed');
    const showClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'dog', classNumber: 9,
    });
    const { ec } = await confirmedEntry(show.id, breed.id, showClass.id, { absent: false });
    const result = await makeResult({ entryClassId: ec.id, placement: 1 });
    await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result.id));

    // Not started yet — the published result still shows publicly, exactly
    // as it always has (this class is never all-absent, so the new lock
    // must not touch it).
    const publicLiveBefore = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    const publicCardBefore = findCard(publicLiveBefore, showClass.id);
    expect(publicCardBefore).toBeDefined();
    expect(publicCardBefore!.results).toHaveLength(1);

    await testDb.update(shows).set({ status: 'in_progress' }).where(eq(shows.id, show.id));

    const publicLiveAfter = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    const publicCardAfter = findCard(publicLiveAfter, showClass.id);
    expect(publicCardAfter).toBeDefined();
    expect(publicCardAfter!.results).toHaveLength(1);
  });
});
