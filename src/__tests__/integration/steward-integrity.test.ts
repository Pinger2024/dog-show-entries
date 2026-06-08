/**
 * Bug-hunt #14 + #15 — steward show-day integrity.
 *  #15: markAbsent / publishClassResults / unpublishClassResults skipped the
 *       results-lock check, so a steward could mutate published+locked results.
 *  #14: recordAchievement's upsert deleted by (show, dog, type), so a
 *       show-singular award (Best in Show) could be held by two dogs at once.
 */
import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { achievements } from '@/server/db/schema';
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
  makeStewardAssignment,
  lockShowResults,
} from '../helpers/factories';

async function showWithSteward() {
  const [steward, exhibitor, org, breed] = await Promise.all([
    makeUser({ role: 'steward' }),
    makeUser({ role: 'exhibitor' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress' });
  const [, showClass, dog] = await Promise.all([
    makeStewardAssignment({ userId: steward.id, showId: show.id }),
    makeShowClass({ showId: show.id, breedId: breed.id }),
    makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
  ]);
  const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
  await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { steward, exhibitor, breed, show, showClass, entry };
}

describe('steward locked-results guard (bug-hunt #15)', () => {
  it('markAbsent is blocked once results are published + locked', async () => {
    const { steward, show, entry } = await showWithSteward();
    await lockShowResults(show.id);
    await expect(
      createTestCaller(steward).steward.markAbsent({ entryId: entry.id, absent: true })
    ).rejects.toThrow(/published and locked/i);
  });

  it('publish/unpublish class results are blocked once locked', async () => {
    const { steward, show, showClass } = await showWithSteward();
    await lockShowResults(show.id);
    const caller = createTestCaller(steward);
    await expect(
      caller.steward.publishClassResults({ showId: show.id, showClassId: showClass.id })
    ).rejects.toThrow(/published and locked/i);
    await expect(
      caller.steward.unpublishClassResults({ showId: show.id, showClassId: showClass.id })
    ).rejects.toThrow(/published and locked/i);
  });
});

describe('steward show-level award uniqueness (bug-hunt #14)', () => {
  it('assigning Best in Show to a second dog removes the first holder', async () => {
    const { steward, exhibitor, breed, show } = await showWithSteward();
    const dogA = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dogB = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await makeEntry({ showId: show.id, dogId: dogA.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await makeEntry({ showId: show.id, dogId: dogB.id, exhibitorId: exhibitor.id, status: 'confirmed' });

    const caller = createTestCaller(steward);
    await caller.steward.recordAchievement({ showId: show.id, dogId: dogA.id, type: 'best_in_show', date: '2030-06-01' });
    await caller.steward.recordAchievement({ showId: show.id, dogId: dogB.id, type: 'best_in_show', date: '2030-06-01' });

    const bis = await testDb.query.achievements.findMany({
      where: and(eq(achievements.showId, show.id), eq(achievements.type, 'best_in_show')),
    });
    expect(bis).toHaveLength(1);
    expect(bis[0]?.dogId).toBe(dogB.id);
  });
});
