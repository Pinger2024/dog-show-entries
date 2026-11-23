/**
 * "Lives overseas" is a fact about the judge (judges.lives_overseas), set by
 * the secretary when she adds the judge, when she edits the judge, and on the
 * Send Offer dialog. An overseas judge's offer carries the RKC's F(1).21.b
 * paragraphs only (src/lib/judge-offer-terms.ts; Mandy, 15 Nov 2026).
 *
 * Who may change it is the rule updateJudge already has for every judge
 * detail (judgeEngagedOutsideCallerOrgs): a judge engaged by another club is
 * locked for a secretary; an admin may change it.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { judges } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeBreed,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';

async function livesOverseas(judgeId: string) {
  const row = await testDb.query.judges.findFirst({ where: eq(judges.id, judgeId) });
  return row!.livesOverseas;
}

describe('a new judge lives in the UK unless the secretary says otherwise', () => {
  it('the column defaults to false', async () => {
    const judge = await makeJudge();
    expect(judge!.livesOverseas).toBe(false);
  });
});

describe('secretary.updateJudge — livesOverseas', () => {
  it('sets and clears the flag on a judge her own show uses', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const judge = await makeJudge();
    await makeJudgeAssignment({ showId: show.id, judgeId: judge!.id });
    const caller = createTestCaller(user);

    const on = await caller.secretary.updateJudge({ judgeId: judge!.id, livesOverseas: true });
    expect(on.livesOverseas).toBe(true);
    expect(await livesOverseas(judge!.id)).toBe(true);

    const off = await caller.secretary.updateJudge({ judgeId: judge!.id, livesOverseas: false });
    expect(off.livesOverseas).toBe(false);
    expect(await livesOverseas(judge!.id)).toBe(false);
  });

  it('the flag alone is a valid update (the Send Offer dialog sends only it)', async () => {
    const { user } = await makeSecretaryWithOrg();
    const judge = await makeJudge({ name: 'Keep Me', contactEmail: 'keep@test.local' });
    const updated = await createTestCaller(user).secretary.updateJudge({ judgeId: judge!.id, livesOverseas: true });
    expect(updated.livesOverseas).toBe(true);
    expect(updated.name).toBe('Keep Me');
    expect(updated.contactEmail).toBe('keep@test.local');
  });

  it('an edit that does not mention the flag leaves it alone', async () => {
    const { user } = await makeSecretaryWithOrg();
    const judge = await makeJudge({ livesOverseas: true });
    await createTestCaller(user).secretary.updateJudge({ judgeId: judge!.id, name: 'Renamed' });
    expect(await livesOverseas(judge!.id)).toBe(true);
  });

  it('a secretary cannot change it on a judge engaged by another club', async () => {
    const { org: orgA } = await makeSecretaryWithOrg();
    const showA = await makeShow({ organisationId: orgA.id });
    const judge = await makeJudge();
    await makeJudgeAssignment({ showId: showA.id, judgeId: judge!.id });

    const { user: rival } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(rival).secretary.updateJudge({ judgeId: judge!.id, livesOverseas: true }),
    ).rejects.toThrow(/another club/i);
    expect(await livesOverseas(judge!.id)).toBe(false);
  });
});

describe('secretary.addAndAssignJudge (the add-judge wizard) — livesOverseas', () => {
  it('a new judge is stored with the flag the secretary ticked', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const res = await createTestCaller(user).secretary.addAndAssignJudge({
      showId: show.id,
      name: 'Overseas Judge',
      contactEmail: 'overseas@test.local',
      livesOverseas: true,
      assignments: [{ breedId: breed.id, sex: null }],
    });
    expect(await livesOverseas(res.judge.id)).toBe(true);
  });

  it('a new judge with the box left alone lives in the UK', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const res = await createTestCaller(user).secretary.addAndAssignJudge({
      showId: show.id,
      name: 'UK Judge',
      contactEmail: 'uk@test.local',
      assignments: [{ breedId: breed.id, sex: null }],
    });
    expect(await livesOverseas(res.judge.id)).toBe(false);
  });

  it('an existing judge keeps a stored "lives overseas" when the wizard does not send the flag', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const judge = await makeJudge({ kcNumber: 'KC-OVERSEAS-1', contactEmail: 'o@test.local', livesOverseas: true });
    await createTestCaller(user).secretary.addAndAssignJudge({
      showId: show.id,
      name: judge!.name,
      kcNumber: 'KC-OVERSEAS-1',
      contactEmail: 'o@test.local',
      assignments: [{ breedId: breed.id, sex: null }],
    });
    expect(await livesOverseas(judge!.id)).toBe(true);
  });

  it('an existing judge takes the flag the secretary changed', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const judge = await makeJudge({ kcNumber: 'KC-OVERSEAS-2', contactEmail: 'o2@test.local' });
    await createTestCaller(user).secretary.addAndAssignJudge({
      showId: show.id,
      name: judge!.name,
      kcNumber: 'KC-OVERSEAS-2',
      contactEmail: 'o2@test.local',
      livesOverseas: true,
      assignments: [{ breedId: breed.id, sex: null }],
    });
    expect(await livesOverseas(judge!.id)).toBe(true);
  });

  it('cannot change it on a judge engaged by another club (same lock as the contact details)', async () => {
    const { org: orgA } = await makeSecretaryWithOrg();
    const showA = await makeShow({ organisationId: orgA.id });
    const judge = await makeJudge({ kcNumber: 'KC-OVERSEAS-3', contactEmail: 'o3@test.local' });
    await makeJudgeAssignment({ showId: showA.id, judgeId: judge!.id });

    const { user: rival, org: orgB } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const showB = await makeShow({ organisationId: orgB.id, breedId: breed.id });
    await createTestCaller(rival).secretary.addAndAssignJudge({
      showId: showB.id,
      name: judge!.name,
      kcNumber: 'KC-OVERSEAS-3',
      contactEmail: 'o3@test.local',
      livesOverseas: true,
      assignments: [{ breedId: breed.id, sex: null }],
    });
    expect(await livesOverseas(judge!.id)).toBe(false);
  });
});

describe('secretary.addJudge (the checklist\'s Add Judge form) — livesOverseas', () => {
  it('stores the flag when ticked, false when not', async () => {
    const { user } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);
    const overseas = await caller.secretary.addJudge({ name: 'Abroad', livesOverseas: true });
    const uk = await caller.secretary.addJudge({ name: 'At Home' });
    expect(await livesOverseas(overseas.id)).toBe(true);
    expect(await livesOverseas(uk.id)).toBe(false);
  });
});
