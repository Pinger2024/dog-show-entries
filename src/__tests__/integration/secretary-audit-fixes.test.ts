/**
 * Phase 4 secretary-dashboard audit — fixes for the three reachable, verified
 * functional/security findings (the rest are documented in
 * SECRETARY_DASHBOARD_AUDIT.md for review):
 *
 *  1. getPreviousScheduleData leaked another club's schedule data (guarantor home
 *     addresses, prize money, sponsors) — it used the target show's org with no
 *     membership check. Now mirrors getScheduleData's verify.
 *  2. createManualEntry let a secretary record the same dog in the same class
 *     twice (online checkout already blocks this), duplicating catalogue rows and
 *     double-counting club revenue.
 *  3. The "Publish results" checklist item declared an autoDetectKey
 *     ('results_published') that getChecklistAutoDetect never populated, so it
 *     could never auto-tick.
 */
import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeSecretaryWithOrg,
} from '../helpers/factories';

describe('getPreviousScheduleData cross-org leak (audit #high)', () => {
  it('rejects a secretary reading another org show', async () => {
    const { user: secA } = await makeSecretaryWithOrg();
    const { org: orgB } = await makeSecretaryWithOrg();
    const showB = await makeShow({ organisationId: orgB.id });
    await expect(
      createTestCaller(secA).secretary.getPreviousScheduleData({ showId: showB.id })
    ).rejects.toThrow(/access to this show/i);
  });

  it('allows a secretary to read their own org show', async () => {
    const { user: sec, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    // No sibling show with scheduleData → resolves to null, must NOT throw.
    await expect(
      createTestCaller(sec).secretary.getPreviousScheduleData({ showId: show.id })
    ).resolves.toBeNull();
  });
});

describe('createManualEntry duplicate guard (audit #medium)', () => {
  it('rejects entering the same dog into the same class twice', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: 2000,
      subsequentEntryFee: 1000,
    });
    const cls = await makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 });
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'dup-manual@test.local' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const caller = createTestCaller(secretary);

    // First manual entry succeeds.
    await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [cls!.id],
      exhibitorEmail: exhibitor.email,
    });

    // Second identical manual entry is rejected (was silently duplicated before).
    await expect(
      caller.secretary.createManualEntry({
        showId: show.id,
        dogId: dog.id,
        classIds: [cls!.id],
        exhibitorEmail: exhibitor.email,
      })
    ).rejects.toThrow(/already entered/i);
  });

  it('still allows the same dog in a different class', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: 2000,
      subsequentEntryFee: 1000,
    });
    const clsA = await makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 });
    const clsB = await makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 });
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'dup-manual-2@test.local' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const caller = createTestCaller(secretary);

    await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [clsA!.id],
      exhibitorEmail: exhibitor.email,
    });
    // Different class for the same dog is a legitimate separate entry.
    const second = await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [clsB!.id],
      exhibitorEmail: exhibitor.email,
    });
    expect(second.id).toBeTruthy();
  });
});

describe('results_published checklist auto-detect (audit #low)', () => {
  it('flips to true once results are published', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'in_progress' });
    const caller = createTestCaller(secretary);

    const before = await caller.secretary.getChecklistAutoDetect({ showId: show.id });
    expect(before.results_published).toBe(false);

    await caller.secretary.publishResults({ showId: show.id, sendNotifications: false });

    const after = await caller.secretary.getChecklistAutoDetect({ showId: show.id });
    expect(after.results_published).toBe(true);
  });
});
