import { describe, it, expect, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { achievements, judgeAssignments } from '@/server/db/schema';
import * as emailService from '@/server/services/email';
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
  makeAchievement,
  lockShowResults,
  setShowStatus,
} from '../helpers/factories';

/** Steward + show + breed + one entered+confirmed dog. */
async function showWithSteward() {
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

describe('steward.getShowClasses', () => {
  it('returns classes for an assigned show', async () => {
    const { steward, show } = await showWithSteward();
    const caller = createTestCaller(steward);
    const classes = await caller.steward.getShowClasses({ showId: show.id });
    expect(classes).toHaveLength(1);
    expect(classes[0]?.entryCount).toBe(1);
  });

  it('rejects an unassigned steward', async () => {
    const { show } = await showWithSteward();
    const intruder = await makeUser({ role: 'steward' });
    const caller = createTestCaller(intruder);
    await expect(caller.steward.getShowClasses({ showId: show.id }))
      .rejects.toThrow(/not assigned/);
  });
});

describe('steward.getClassEntries', () => {
  it('returns entries for the class with dog + handler details', async () => {
    const { steward, showClass, dog } = await showWithSteward();
    const caller = createTestCaller(steward);
    const data = await caller.steward.getClassEntries({ showClassId: showClass.id });
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]?.dogId).toBe(dog.id);
  });

  it('rejects an unassigned steward', async () => {
    const { showClass } = await showWithSteward();
    const intruder = await makeUser({ role: 'steward' });
    const caller = createTestCaller(intruder);
    await expect(caller.steward.getClassEntries({ showClassId: showClass.id }))
      .rejects.toThrow(/not assigned/);
  });
});

describe('steward.recordAchievement', () => {
  it('inserts an achievement for an entered dog', async () => {
    const { steward, show, dog } = await showWithSteward();
    const caller = createTestCaller(steward);
    const ach = await caller.steward.recordAchievement({
      showId: show.id,
      dogId: dog.id,
      type: 'best_of_breed',
      date: '2030-06-01',
    });
    expect(ach.type).toBe('best_of_breed');
    expect(ach.dogId).toBe(dog.id);
  });

  it('rejects sex-restricted award when dog sex does not match (Bitch CC on a dog)', async () => {
    const { steward, exhibitor, breed, show, showClass } = await showWithSteward();
    // The default dog from showWithSteward is sex='dog'; build a separate one to keep clarity.
    const maleDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, sex: 'dog' });
    const entry = await makeEntry({
      showId: show.id,
      dogId: maleDog.id,
      exhibitorId: exhibitor.id,
      status: 'confirmed',
    });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const caller = createTestCaller(steward);
    await expect(
      caller.steward.recordAchievement({
        showId: show.id,
        dogId: maleDog.id,
        type: 'bitch_cc',
        date: '2030-06-01',
      }),
    ).rejects.toThrow(/bitches only/);
  });

  it('upserts: re-recording the same type replaces the prior row', async () => {
    const { steward, show, dog } = await showWithSteward();
    const caller = createTestCaller(steward);
    await caller.steward.recordAchievement({
      showId: show.id, dogId: dog.id, type: 'best_of_breed', date: '2030-06-01',
    });
    await caller.steward.recordAchievement({
      showId: show.id, dogId: dog.id, type: 'best_of_breed', date: '2030-06-02',
    });
    const rows = await testDb.query.achievements.findMany({
      where: and(eq(achievements.showId, show.id), eq(achievements.dogId, dog.id)),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe('2030-06-02');
  });

  it('refuses recording once results are locked', async () => {
    const { steward, show, dog } = await showWithSteward();
    await lockShowResults(show.id);
    const caller = createTestCaller(steward);
    await expect(
      caller.steward.recordAchievement({
        showId: show.id, dogId: dog.id, type: 'best_of_breed', date: '2030-06-01',
      }),
    ).rejects.toThrow(/published and locked/);
  });

  it('rejects recording for a dog not entered in the show', async () => {
    const { steward, show } = await showWithSteward();
    const otherExhibitor = await makeUser({ role: 'exhibitor' });
    const otherDog = await makeDog({ ownerId: otherExhibitor.id });
    const caller = createTestCaller(steward);
    await expect(
      caller.steward.recordAchievement({
        showId: show.id, dogId: otherDog.id, type: 'best_of_breed', date: '2030-06-01',
      }),
    ).rejects.toThrow(/not entered in this show/);
  });
});

describe('steward.removeAchievement', () => {
  it('deletes the matching achievement row', async () => {
    const { steward, show, dog } = await showWithSteward();
    await makeAchievement({ showId: show.id, dogId: dog.id, type: 'best_of_breed' });
    const caller = createTestCaller(steward);
    const res = await caller.steward.removeAchievement({
      showId: show.id, dogId: dog.id, type: 'best_of_breed',
    });
    expect(res.removed).toBe(true);
    const rows = await testDb.query.achievements.findMany({
      where: and(eq(achievements.showId, show.id), eq(achievements.dogId, dog.id)),
    });
    expect(rows).toHaveLength(0);
  });
});

describe('steward.updateWinnerPhoto', () => {
  it('updates the photo URL on an existing result without losing placement', async () => {
    const { steward, ec } = await showWithSteward();
    await makeResult({ entryClassId: ec.id, placement: 1, recordedBy: steward.id });
    const caller = createTestCaller(steward);
    const updated = await caller.steward.updateWinnerPhoto({
      entryClassId: ec.id,
      winnerPhotoUrl: 'https://r2.test/photo.jpg',
    });
    expect(updated.winnerPhotoUrl).toBe('https://r2.test/photo.jpg');
    expect(updated.placement).toBe(1);
  });

  it('refuses without a pre-existing result row', async () => {
    const { steward, ec } = await showWithSteward();
    const caller = createTestCaller(steward);
    await expect(
      caller.steward.updateWinnerPhoto({ entryClassId: ec.id, winnerPhotoUrl: 'x' }),
    ).rejects.toThrow(/Result not found/);
  });
});

describe('steward.submitForJudgeApproval', () => {
  it('stamps approval token + status on assignments and sends an email', async () => {
    const { steward, show, breed } = await showWithSteward();
    const judge = await makeJudge({ contactEmail: 'judge@example.test' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    vi.mocked(emailService.sendJudgeApprovalRequestEmail).mockClear();

    const res = await createTestCaller(steward).steward.submitForJudgeApproval({
      showId: show.id,
      judgeId: judge.id,
    });

    expect(res.sent).toBe(true);
    expect(res.judgeEmail).toBe('judge@example.test');
    const updated = await testDb.query.judgeAssignments.findFirst({
      where: and(
        eq(judgeAssignments.showId, show.id),
        eq(judgeAssignments.judgeId, judge.id),
      ),
    });
    expect(updated?.approvalStatus).toBe('pending');
    expect(updated?.approvalToken).toBeTruthy();
    expect(vi.mocked(emailService.sendJudgeApprovalRequestEmail)).toHaveBeenCalled();
  });

  it('rejects when the judge has no contact email', async () => {
    const { steward, show, breed } = await showWithSteward();
    const judge = await makeJudge({ contactEmail: null });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    await expect(
      createTestCaller(steward).steward.submitForJudgeApproval({
        showId: show.id,
        judgeId: judge.id,
      }),
    ).rejects.toThrow(/email address on file/);
  });

  it('rejects when no assignment exists for that judge', async () => {
    const { steward, show } = await showWithSteward();
    const judge = await makeJudge({ contactEmail: 'judge@example.test' });
    await expect(
      createTestCaller(steward).steward.submitForJudgeApproval({
        showId: show.id,
        judgeId: judge.id,
      }),
    ).rejects.toThrow(/No assignments found/);
  });
});

describe('steward.getJudgeApprovalStatus', () => {
  it('returns one row per judge with their breeds + approval status', async () => {
    const { steward, show, breed } = await showWithSteward();
    const judge = await makeJudge({ contactEmail: 'a@b.test' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const status = await createTestCaller(steward).steward.getJudgeApprovalStatus({
      showId: show.id,
    });
    expect(status).toHaveLength(1);
    expect(status[0]?.judgeId).toBe(judge.id);
    expect(status[0]?.approvalStatus).toBeNull();
  });
});

describe('steward.getLiveResults publication gate', () => {
  it('hides recorded results from public callers until publishedAt is stamped', async () => {
    const { show, ec } = await showWithSteward();
    await makeResult({ entryClassId: ec.id, placement: 1 });
    const publicCaller = createTestCaller(null);

    const before = await publicCaller.steward.getLiveResults({ showId: show.id });
    expect(before.unpublished).toBe(true);
    expect(before.breedGroups).toEqual([]);

    // Stamp results.publishedAt to simulate the secretary publishing.
    const { results } = await import('@/server/db/schema');
    await testDb.update(results).set({ publishedAt: new Date() });

    const after = await publicCaller.steward.getLiveResults({ showId: show.id });
    expect(after.unpublished).toBe(false);
    const total = after.breedGroups.flatMap((g) => g.classes).flatMap((c) => c.results).length;
    expect(total).toBe(1);
  });

  it('shows unpublished results to privileged callers (steward/secretary/admin)', async () => {
    const { steward, show, ec } = await showWithSteward();
    await makeResult({ entryClassId: ec.id, placement: 1 });
    const stewardCaller = createTestCaller(steward);

    const live = await stewardCaller.steward.getLiveResults({ showId: show.id });
    expect(live.unpublished).toBe(false);
    const total = live.breedGroups.flatMap((g) => g.classes).flatMap((c) => c.results).length;
    expect(total).toBe(1);
  });
});
