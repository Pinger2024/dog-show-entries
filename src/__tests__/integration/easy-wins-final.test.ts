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
  makeResult,
  makeStewardAssignment,
  makeSecretaryWithOrg,
  makeSecretaryWithOrgAndBreed,
  setShowStatus,
} from '../helpers/factories';

describe('secretary.getDashboard', () => {
  it('returns aggregates for a secretary with an org and a show', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    await makeShow({ organisationId: org.id, status: 'in_progress' });
    const dashboard = await createTestCaller(user).secretary.getDashboard();
    expect(dashboard.organisations).toHaveLength(1);
    expect(dashboard.activeShowsCount).toBe(1);
    expect(dashboard.totalShows).toBe(1);
  });

  it('returns empty aggregates for a secretary with no orgs', async () => {
    const lonelySecretary = await makeUser({ role: 'secretary' });
    const dashboard = await createTestCaller(lonelySecretary).secretary.getDashboard();
    expect(dashboard.organisations).toEqual([]);
    expect(dashboard.totalShows).toBe(0);
  });
});

describe('secretary.getOrganisation', () => {
  it('returns the secretary\'s active org', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const result = await createTestCaller(user).secretary.getOrganisation();
    expect(result?.id).toBe(org.id);
  });

  it('returns null for a secretary with no org membership', async () => {
    const lonelySecretary = await makeUser({ role: 'secretary' });
    const result = await createTestCaller(lonelySecretary).secretary.getOrganisation();
    expect(result).toBeNull();
  });
});

describe('secretary.orgMembers', () => {
  it('returns active members for a member of the org', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const list = await createTestCaller(user).secretary.orgMembers({ organisationId: org.id });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(user.id);
  });

  it('rejects callers not in the org', async () => {
    const { user } = await makeSecretaryWithOrg();
    const otherOrg = await makeOrg();
    await expect(
      createTestCaller(user).secretary.orgMembers({ organisationId: otherOrg.id }),
    ).rejects.toThrow(/Not a member/);
  });
});

describe('secretary.seedChecklist', () => {
  it('inserts default checklist items + reports seeded=true (or false on second run)', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);

    const first = await caller.secretary.seedChecklist({ showId: show.id });
    expect(first.seeded).not.toBe(false); // first call seeded

    // Second call should detect existing items and skip
    const second = await caller.secretary.seedChecklist({ showId: show.id });
    expect(second.seeded).toBe(false);
  });
});

describe('secretary.getShowPhaseContext', () => {
  it('returns phase context shape for a draft show', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    const ctx = await createTestCaller(user).secretary.getShowPhaseContext({ showId: show.id });
    expect(ctx).toBeDefined();
  });
});

describe('steward.getResultsSummary (public)', () => {
  it('returns aggregated counts for a show with one recorded result', async () => {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress' });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entry = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed',
    });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    await makeResult({ entryClassId: ec.id, placement: 1, recordedBy: secretary.id });
    await setShowStatus(show.id, 'completed');

    const summary = await createTestCaller(null).steward.getResultsSummary({ showId: show.id });
    expect(summary).toBeDefined();
  });
});

describe('steward role coverage of getMyShows includes a freshly-assigned show', () => {
  it('newly-assigned steward sees the show immediately', async () => {
    const steward = await makeUser({ role: 'steward' });
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id, status: 'in_progress' });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });
    const list = await createTestCaller(steward).steward.getMyShows();
    expect(list.map((s) => s.id)).toContain(show.id);
  });
});
