import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { judges, judgeAssignments, judgeContracts } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeBreed,
  makeJudge,
  makeJudgeAssignment,
  makeUser,
  makeOrg,
} from '../helpers/factories';

describe('secretary.addJudge', () => {
  it('inserts a judge into the global pool', async () => {
    const { user } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);
    const judge = await caller.secretary.addJudge({
      name: 'Alex Judge',
      contactEmail: 'alex@example.test',
      kennelClubAffix: 'Sadira',
    });
    expect(judge?.name).toBe('Alex Judge');
    expect(judge?.contactEmail).toBe('alex@example.test');
  });
});

describe('secretary.updateJudge', () => {
  it('updates judge details', async () => {
    const { user } = await makeSecretaryWithOrg();
    const judge = await makeJudge({ name: 'Old', contactEmail: 'old@test' });
    const updated = await createTestCaller(user).secretary.updateJudge({
      judgeId: judge.id,
      name: 'New',
      contactEmail: 'new@test.com',
    });
    expect(updated.name).toBe('New');
    expect(updated.contactEmail).toBe('new@test.com');
  });
});

describe('secretary.searchJudges', () => {
  it('deduplicates results by case-insensitive name', async () => {
    const { user } = await makeSecretaryWithOrg();
    await Promise.all([
      makeJudge({ name: 'Smith Judge One', kcNumber: 'KC001' }),
      makeJudge({ name: 'smith judge one', kcNumber: 'KC002' }), // duplicate by name
      makeJudge({ name: 'Different Person' }),
    ]);
    const matches = await createTestCaller(user).secretary.searchJudges({ query: 'smith' });
    expect(matches).toHaveLength(1);
    // Either KC001 or KC002 may win depending on Postgres collation order;
    // the contract is "one row per case-insensitive name", which both prove.
    expect(matches[0]?.kcNumber).toMatch(/KC00[12]/);
  });
});

describe('secretary.assignJudge / bulkAssignJudge / removeJudgeAssignment', () => {
  it('assigns a judge to a show with an optional breed + sex', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const judge = await makeJudge();
    const caller = createTestCaller(user);

    const assignment = await caller.secretary.assignJudge({
      showId: show.id,
      judgeId: judge.id,
      breedId: breed.id,
      sex: 'dog',
    });
    expect(assignment.showId).toBe(show.id);
    expect(assignment.sex).toBe('dog');
  });

  it('bulk-assigns a judge to multiple breeds', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const judge = await makeJudge();
    const [breedA, breedB] = await Promise.all([makeBreed(), makeBreed()]);
    const caller = createTestCaller(user);

    const res = await caller.secretary.bulkAssignJudge({
      showId: show.id,
      judgeId: judge.id,
      breedIds: [breedA.id, breedB.id],
    });
    expect(res.count).toBe(2);
    const rows = await testDb.query.judgeAssignments.findMany({
      where: and(eq(judgeAssignments.showId, show.id), eq(judgeAssignments.judgeId, judge.id)),
    });
    expect(rows).toHaveLength(2);
  });

  it('removes a judge assignment', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const judge = await makeJudge();
    const assignment = await makeJudgeAssignment({
      showId: show.id, judgeId: judge.id, breedId: breed.id,
    });
    await createTestCaller(user).secretary.removeJudgeAssignment({ assignmentId: assignment.id });
    const rows = await testDb.query.judgeAssignments.findMany({ where: eq(judgeAssignments.id, assignment.id) });
    expect(rows).toHaveLength(0);
  });

  it('rejects assignment under a show in another org', async () => {
    const { user } = await makeSecretaryWithOrg();
    const otherOrg = await makeOrg();
    const otherShow = await makeShow({ organisationId: otherOrg.id });
    const judge = await makeJudge();
    await expect(
      createTestCaller(user).secretary.assignJudge({
        showId: otherShow.id, judgeId: judge.id,
      }),
    ).rejects.toThrow(/access/i);
  });
});

describe('secretary.getShowJudges', () => {
  it('returns all assignments for a show with judge + breed embedded', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const judge = await makeJudge({ name: 'My Judge' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const list = await createTestCaller(user).secretary.getShowJudges({ showId: show.id });
    expect(list).toHaveLength(1);
    expect(list[0]?.judge?.name).toBe('My Judge');
  });
});

describe('secretary.getJudgeCoverage', () => {
  it('reports unmet breed/sex requirements derived from showClasses', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showScope: 'single_breed' });
    const { makeShowClass } = await import('../helpers/factories');
    await makeShowClass({ showId: show.id, breedId: breed.id });

    const result = await createTestCaller(user).secretary.getJudgeCoverage({ showId: show.id });
    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.coveredCount).toBe(0);
    expect(result.coverage[0]?.judges).toEqual([]);
  });

  it('shows a covered requirement once a judge is assigned to the breed', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showScope: 'single_breed' });
    const { makeShowClass } = await import('../helpers/factories');
    await makeShowClass({ showId: show.id, breedId: breed.id });
    const judge = await makeJudge();
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });

    const result = await createTestCaller(user).secretary.getJudgeCoverage({ showId: show.id });
    const covered = result.coverage.find((c) => c.breedId === breed.id);
    expect(covered?.judges.length ?? 0).toBeGreaterThan(0);
    expect(result.coveredCount).toBeGreaterThan(0);
  });
});

describe('secretary.sendJudgeOffer', () => {
  it('creates a contract row, marks stage offer_sent, and dispatches an email', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const judge = await makeJudge({ name: 'Mary Judge' });
    const caller = createTestCaller(user);

    const contract = await caller.secretary.sendJudgeOffer({
      showId: show.id,
      judgeId: judge.id,
      judgeEmail: 'mary@example.test',
      hotelCost: 12000,
    });

    expect(contract.stage).toBe('offer_sent');
    expect(contract.offerToken).toBeTruthy();
    expect(contract.tokenExpiresAt).toBeInstanceOf(Date);

    const dbContract = await testDb.query.judgeContracts.findFirst({
      where: eq(judgeContracts.id, contract.id),
    });
    expect(dbContract?.judgeEmail).toBe('mary@example.test');
    expect(dbContract?.hotelCost).toBe(12000);

    // The procedure also backfills judges.contactEmail when missing.
    const updatedJudge = await testDb.query.judges.findFirst({ where: eq(judges.id, judge.id) });
    expect(updatedJudge?.contactEmail).toBe('mary@example.test');
  });

  it('rejects when the judge does not exist', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    await expect(
      createTestCaller(user).secretary.sendJudgeOffer({
        showId: show.id,
        judgeId: '00000000-0000-0000-0000-000000000000',
        judgeEmail: 'x@x.test',
      }),
    ).rejects.toThrow(/Judge not found/);
  });

  it('rejects sending an offer for a show in another org', async () => {
    const { user } = await makeSecretaryWithOrg();
    const otherOrg = await makeOrg();
    const otherShow = await makeShow({ organisationId: otherOrg.id });
    const judge = await makeJudge();
    await expect(
      createTestCaller(user).secretary.sendJudgeOffer({
        showId: otherShow.id,
        judgeId: judge.id,
        judgeEmail: 'x@x.test',
      }),
    ).rejects.toThrow(/access/i);
  });
});

describe('secretary.getJudgeContracts', () => {
  it('returns contracts for a show', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const judge = await makeJudge();
    await createTestCaller(user).secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'a@b.test',
    });
    const contracts = await createTestCaller(user).secretary.getJudgeContracts({ showId: show.id });
    expect(contracts).toHaveLength(1);
  });

  it('returns empty for a show with no contracts', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const contracts = await createTestCaller(user).secretary.getJudgeContracts({ showId: show.id });
    expect(contracts).toEqual([]);
  });
});

// Suppress unused-import warnings on schema tables referenced only via factories.
void judges; void judgeAssignments; void makeUser;
