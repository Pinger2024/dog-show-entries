/**
 * Mandy, 16 Nov 2026: Winter Spectacular had every class published live by its
 * stewards but the dashboard said "Results not yet published". The secretary's
 * publication status now reports 'none' | 'live' | 'final' from the one owner
 * (lib/results-publication.ts), while `published` — which the Unpublish button
 * and the lock depend on — still means Publish Results has been pressed.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results, shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeUser,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
} from '../helpers/factories';

async function finishedShowWithOneResult() {
  const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'completed' });
  const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
  const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
  const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  const result = await makeResult({ entryClassId: ec.id, placement: 1 });
  const caller = createTestCaller({ ...user, name: user.name ?? 'Secretary' });
  return { show, result, caller };
}

describe('secretary.getResultsPublicationStatus — none / live / final', () => {
  it("'none' while nothing is on the public page", async () => {
    const { show, caller } = await finishedShowWithOneResult();
    const status = await caller.secretary.getResultsPublicationStatus({ showId: show.id });
    expect(status.publication).toBe('none');
    expect(status.published).toBe(false);
  });

  it("'live' when a steward has published a class but Publish Results has not been pressed", async () => {
    const { show, result, caller } = await finishedShowWithOneResult();
    await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result.id));

    const status = await caller.secretary.getResultsPublicationStatus({ showId: show.id });
    expect(status.publication).toBe('live');
    // Not finalised: the Unpublish button and the lock still wait for Publish Results.
    expect(status.published).toBe(false);
  });

  it("'final' once Publish Results has been pressed", async () => {
    const { show, result, caller } = await finishedShowWithOneResult();
    const now = new Date();
    await testDb.update(results).set({ publishedAt: now }).where(eq(results.id, result.id));
    await testDb.update(shows).set({ resultsPublishedAt: now, resultsLockedAt: now }).where(eq(shows.id, show.id));

    const status = await caller.secretary.getResultsPublicationStatus({ showId: show.id });
    expect(status.publication).toBe('final');
    expect(status.published).toBe(true);
  });
});
