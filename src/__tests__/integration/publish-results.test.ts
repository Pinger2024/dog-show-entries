import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import * as notifications from '@/server/services/results-notifications';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeSecretaryWithOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
} from '../helpers/factories';
import { shows, results } from '@/server/db/schema';

/**
 * Builds a show that is mid-event with one entered dog and one recorded result,
 * ready to be published. Returns everything the test needs.
 */
async function showReadyToPublish() {
  const { user: secretary, org } = await makeSecretaryWithOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'in_progress',
  });
  const showClass = await makeShowClass({ showId: show.id });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
  const entry = await makeEntry({
    showId: show.id,
    dogId: dog.id,
    exhibitorId: exhibitor.id,
    status: 'confirmed',
  });
  const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  const result = await makeResult({
    entryClassId: ec.id,
    placement: 1,
    recordedBy: secretary.id,
  });
  return { secretary, org, show, showClass, exhibitor, dog, entry, ec, result };
}

describe('secretary.publishResults', () => {
  it('publishes a show in progress and stamps published_at on results', async () => {
    const { secretary, show, result } = await showReadyToPublish();
    const caller = createTestCaller(secretary);

    const res = await caller.secretary.publishResults({ showId: show.id });

    expect(res.published).toBe(true);
    expect(res.publishedAt).toBeInstanceOf(Date);

    const dbShow = await testDb.query.shows.findFirst({
      where: eq(shows.id, show.id),
    });
    expect(dbShow?.resultsPublishedAt).not.toBeNull();
    expect(dbShow?.resultsLockedAt).not.toBeNull();

    const dbResult = await testDb.query.results.findFirst({
      where: eq(results.id, result.id),
    });
    expect(dbResult?.publishedAt).not.toBeNull();
  });

  it('fires async exhibitor notifications by default', async () => {
    const { secretary, show } = await showReadyToPublish();
    const caller = createTestCaller(secretary);

    await caller.secretary.publishResults({ showId: show.id });

    // The procedure fires notifications via fire-and-forget Promise.all.
    // Yield to the microtask queue so the dynamic import + .then settle.
    await new Promise((r) => setImmediate(r));

    expect(vi.mocked(notifications.sendExhibitorResultsEmails)).toHaveBeenCalledWith(show.id);
    expect(vi.mocked(notifications.sendFollowerResultsNotifications)).toHaveBeenCalledWith(show.id);
    expect(vi.mocked(notifications.createResultsMilestonePosts)).toHaveBeenCalledWith(show.id);
  });

  it('skips notifications when sendNotifications is false', async () => {
    const { secretary, show } = await showReadyToPublish();
    const caller = createTestCaller(secretary);
    vi.mocked(notifications.sendExhibitorResultsEmails).mockClear();

    await caller.secretary.publishResults({ showId: show.id, sendNotifications: false });
    await new Promise((r) => setImmediate(r));

    expect(vi.mocked(notifications.sendExhibitorResultsEmails)).not.toHaveBeenCalled();
  });

  it('rejects when show status is draft', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    const caller = createTestCaller(secretary);

    await expect(caller.secretary.publishResults({ showId: show.id }))
      .rejects.toThrow(/in progress or completed/);
  });

  it('rejects double-publish', async () => {
    const { secretary, show } = await showReadyToPublish();
    const caller = createTestCaller(secretary);

    await caller.secretary.publishResults({ showId: show.id });

    await expect(caller.secretary.publishResults({ showId: show.id }))
      .rejects.toThrow(/already published/);
  });

  it('rejects when caller is not a member of the show owning org', async () => {
    const { show } = await showReadyToPublish();
    // A secretary belonging to a DIFFERENT org should be FORBIDDEN
    const { user: outsider } = await makeSecretaryWithOrg();
    const caller = createTestCaller(outsider);

    await expect(caller.secretary.publishResults({ showId: show.id }))
      .rejects.toThrow(/access/i);
  });

  it('rejects exhibitor role with FORBIDDEN', async () => {
    const { show } = await showReadyToPublish();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(exhibitor);

    await expect(caller.secretary.publishResults({ showId: show.id }))
      .rejects.toThrow(TRPCError);
  });
});

describe('secretary.unpublishResults', () => {
  it('clears published timestamps on the show and its results', async () => {
    const { secretary, show, result } = await showReadyToPublish();
    const caller = createTestCaller(secretary);

    await caller.secretary.publishResults({ showId: show.id });
    const before = await testDb.query.results.findFirst({ where: eq(results.id, result.id) });
    expect(before?.publishedAt).not.toBeNull();

    await caller.secretary.unpublishResults({ showId: show.id });

    const dbShow = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(dbShow?.resultsPublishedAt).toBeNull();
    expect(dbShow?.resultsLockedAt).toBeNull();

    const after = await testDb.query.results.findFirst({ where: eq(results.id, result.id) });
    expect(after?.publishedAt).toBeNull();
  });
});
