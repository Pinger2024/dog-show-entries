/**
 * `getJudgeCoverage` (Judge Coverage dashboard) and `getChecklistAutoDetect`'s
 * `judges_assigned` tick both answer the same question — "is every judging
 * requirement on this show covered by an assigned judge?" — but until now
 * `getChecklistAutoDetect` re-derived its own answer instead of calling
 * `getJudgeCoverage`. Its version had no Special-Award-Classes lane and let
 * ANY breedId===null assignment match ANY breed, so a show whose only
 * assignment was a Special-Award-Classes-only judge (breedId null, sex null,
 * isSpecialAwardsClassesJudge true) ticked "Judges assigned" while the
 * coverage dashboard still showed the breed uncovered.
 *
 * These tests must PASS against the fixed code (one owner:
 * src/server/services/judge-coverage.ts) and FAIL against the pre-fix
 * secretary.ts, where (a) below ticks judges_assigned=true despite
 * getJudgeCoverage reporting the breed classes uncovered.
 */
import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';

async function makeBreedClasses(showId: string, breedId: string) {
  const [dogClassDef, bitchClassDef] = await Promise.all([
    makeClassDef({ type: 'age' }),
    makeClassDef({ type: 'age' }),
  ]);
  const [dogClass, bitchClass] = await Promise.all([
    makeShowClass({ showId, breedId, classDefinitionId: dogClassDef.id, sex: 'dog' }),
    makeShowClass({ showId, breedId, classDefinitionId: bitchClassDef.id, sex: 'bitch' }),
  ]);
  return { dogClass, bitchClass };
}

async function makeSpecialAwardClass(showId: string, breedId: string) {
  const sacDef = await makeClassDef({ name: `Special Award Class — Veteran ${Date.now()}-${Math.random()}`, type: 'age' });
  return makeShowClass({ showId, breedId, classDefinitionId: sacDef.id, sex: null });
}

describe('judge coverage — checklist agrees with the dashboard', () => {
  it('(a) a Special-Award-Classes-only judge must NOT tick judges_assigned for uncovered breed classes', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showScope: 'single_breed' });
    await makeBreedClasses(show.id, breed.id);

    const sacJudge = await makeJudge();
    await makeJudgeAssignment({
      showId: show.id,
      judgeId: sacJudge.id,
      breedId: null,
      sex: null,
      isSpecialAwardsClassesJudge: true,
    });

    const caller = createTestCaller(user);
    const [coverage, checklist] = await Promise.all([
      caller.secretary.getJudgeCoverage({ showId: show.id }),
      caller.secretary.getChecklistAutoDetect({ showId: show.id }),
    ]);

    // The breed's dog/bitch classes are NOT covered by a SAC-only judge.
    expect(coverage.coveredCount).toBeLessThan(coverage.totalCount);
    expect(checklist.judges_assigned).toBe(false);
    expect(checklist.judges_assigned).toBe(coverage.coveredCount === coverage.totalCount);
  });

  it('(b) a properly covered show ticks judges_assigned true, agreeing with the dashboard', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showScope: 'single_breed' });
    await makeBreedClasses(show.id, breed.id);

    const judge = await makeJudge();
    await makeJudgeAssignment({
      showId: show.id,
      judgeId: judge.id,
      breedId: breed.id,
      sex: null, // catch-all sex — covers both dog and bitch classes for this breed
    });

    const caller = createTestCaller(user);
    const [coverage, checklist] = await Promise.all([
      caller.secretary.getJudgeCoverage({ showId: show.id }),
      caller.secretary.getChecklistAutoDetect({ showId: show.id }),
    ]);

    expect(coverage.coveredCount).toBe(coverage.totalCount);
    expect(checklist.judges_assigned).toBe(true);
    expect(checklist.judges_assigned).toBe(coverage.coveredCount === coverage.totalCount);
  });

  it('(c) no assignments at all — both false', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showScope: 'single_breed' });
    await makeBreedClasses(show.id, breed.id);

    const caller = createTestCaller(user);
    const [coverage, checklist] = await Promise.all([
      caller.secretary.getJudgeCoverage({ showId: show.id }),
      caller.secretary.getChecklistAutoDetect({ showId: show.id }),
    ]);

    expect(coverage.coveredCount).toBe(0);
    expect(checklist.judges_assigned).toBe(false);
    expect(checklist.judges_assigned).toBe(coverage.coveredCount === coverage.totalCount);
  });

  it('(d) a breed-null, non-SAC catch-all judge — checklist agrees with whatever the dashboard says', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showScope: 'single_breed' });
    await makeBreedClasses(show.id, breed.id);

    const judge = await makeJudge();
    await makeJudgeAssignment({
      showId: show.id,
      judgeId: judge.id,
      breedId: null,
      sex: null,
      isSpecialAwardsClassesJudge: false,
    });

    const caller = createTestCaller(user);
    const [coverage, checklist] = await Promise.all([
      caller.secretary.getJudgeCoverage({ showId: show.id }),
      caller.secretary.getChecklistAutoDetect({ showId: show.id }),
    ]);

    expect(checklist.judges_assigned).toBe(coverage.coveredCount === coverage.totalCount);
  });

  it('(e) breed classes covered but Special Award Classes uncovered — checklist agrees (must be false)', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showScope: 'single_breed' });
    await makeBreedClasses(show.id, breed.id);
    await makeSpecialAwardClass(show.id, breed.id);

    const judge = await makeJudge();
    await makeJudgeAssignment({
      showId: show.id,
      judgeId: judge.id,
      breedId: breed.id,
      sex: null,
      isSpecialAwardsClassesJudge: false,
    });

    const caller = createTestCaller(user);
    const [coverage, checklist] = await Promise.all([
      caller.secretary.getJudgeCoverage({ showId: show.id }),
      caller.secretary.getChecklistAutoDetect({ showId: show.id }),
    ]);

    expect(coverage.coveredCount).toBeLessThan(coverage.totalCount);
    expect(checklist.judges_assigned).toBe(false);
    expect(checklist.judges_assigned).toBe(coverage.coveredCount === coverage.totalCount);
  });
});
