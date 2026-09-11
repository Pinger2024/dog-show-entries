import { describe, it, expect } from 'vitest';
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
  makeMembership,
} from '../helpers/factories';

/**
 * Amanda 2026-05-28: nobody but admins and the host-club's secretaries
 * should see exhibitor/dog identities before the morning of the show.
 * This file exercises the gate on steward.getClassEntries, which is the
 * primary path stewards use to view exhibits.
 */

// Wide gap on either side of "now" so the gate's answer is unambiguous
// regardless of when the test runs (UTC vs London midnight crossover, DST).
const SOON = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14);
  return d.toISOString().slice(0, 10);
})();

const RECENT_PAST = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 14);
  return d.toISOString().slice(0, 10);
})();

async function buildShowWithEntry(opts: { startDate: string }) {
  const [steward, exhibitor, secretary, admin, org, breed] = await Promise.all([
    makeUser({ role: 'steward' }),
    makeUser({ role: 'exhibitor' }),
    makeUser({ role: 'secretary' }),
    makeUser({ role: 'admin' }),
    makeOrg(),
    makeBreed(),
  ]);
  await makeMembership({ userId: secretary.id, organisationId: org.id });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    startDate: opts.startDate,
    endDate: opts.startDate,
    status: 'entries_closed',
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
  await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { steward, secretary, admin, show, showClass };
}

describe('show-day exhibits lock — steward.getClassEntries', () => {
  it('hides exhibitor + dog identities from stewards before show day', async () => {
    const { steward, showClass } = await buildShowWithEntry({ startDate: SOON });
    const caller = createTestCaller(steward);

    const data = await caller.steward.getClassEntries({ showClassId: showClass.id });

    expect(data.lockedUntilShowDay).toBe(true);
    expect(data.entries).toEqual([]);
    expect(data.showStartDate).toBe(SOON);
  });

  it('reveals exhibits to stewards on the morning of the show', async () => {
    const { steward, showClass } = await buildShowWithEntry({ startDate: RECENT_PAST });
    const caller = createTestCaller(steward);

    const data = await caller.steward.getClassEntries({ showClassId: showClass.id });

    expect(data.lockedUntilShowDay).toBe(false);
    expect(data.entries.length).toBe(1);
    expect(data.entries[0]?.dogName).toBeTruthy();
    expect(data.entries[0]?.exhibitorName).toBeTruthy();
  });

  it('lets host-club secretaries see exhibits before show day', async () => {
    const { secretary, showClass } = await buildShowWithEntry({ startDate: SOON });
    // Secretaries access entries via the steward router for the placements
    // workflow — they also bypass the show-day lock so they can prep, fix
    // typos, etc. while entries are still incoming.
    await makeStewardAssignment({ userId: secretary.id, showId: showClass.showId });
    const caller = createTestCaller(secretary);

    const data = await caller.steward.getClassEntries({ showClassId: showClass.id });

    expect(data.lockedUntilShowDay).toBe(false);
    expect(data.entries.length).toBe(1);
  });

  it('lets admins see exhibits before show day even without org membership', async () => {
    const { admin, showClass } = await buildShowWithEntry({ startDate: SOON });
    await makeStewardAssignment({ userId: admin.id, showId: showClass.showId });
    const caller = createTestCaller(admin);

    const data = await caller.steward.getClassEntries({ showClassId: showClass.id });

    expect(data.lockedUntilShowDay).toBe(false);
    expect(data.entries.length).toBe(1);
  });
});

describe('show-day exhibits lock — shows.getShowDogPhotos', () => {
  it('returns no dog photos on the public feed before show day', async () => {
    const { show } = await buildShowWithEntry({ startDate: SOON });
    const caller = createTestCaller(null);

    const photos = await caller.shows.getShowDogPhotos({ showId: show.id });

    expect(photos).toEqual([]);
  });
});
