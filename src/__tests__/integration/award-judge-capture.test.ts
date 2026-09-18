import { describe, it, expect } from 'vitest';
import {
  makeSecretaryWithOrgAndBreed,
  makeUser,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';
import { createTestCaller } from '../helpers/context';

/**
 * The judge who awarded a top award (CC / Best Dog / Best Bitch …) is captured on
 * the achievement, derived from the show's breed-level judge assignments, so the
 * Champion "3 CCs under 3 different judges" rule can count them (Mandy 2026-07-09).
 */
async function singleBreedShow(scope: 'single_breed' | 'group' | 'general' = 'single_breed') {
  const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: scope,
    showType: 'championship',
    status: 'in_progress',
  });
  const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
  const entry = await makeEntry({
    showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed',
  });
  await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { secretary, show, breed, dog, caller: createTestCaller(secretary) };
}

describe('top-award judge capture', () => {
  it('captures the both-sexes breed judge on a Best Bitch', async () => {
    const { secretary, show, breed, dog, caller } = await singleBreedShow();
    const judge = await makeJudge({ name: 'Mandy McAteer' });
    // One judge covers the whole breed (dogs AND bitches) — the BAGSD case.
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: null });

    const ach = await caller.secretary.recordAchievement({
      showId: show.id, dogId: dog.id, type: 'best_bitch', date: '2030-06-01',
    });
    expect(ach?.judgeId).toBe(judge.id);
    void secretary;
  });

  it('picks the correct sex judge when dogs and bitches are split', async () => {
    const { show, breed, dog, caller } = await singleBreedShow();
    const dogJudge = await makeJudge({ name: 'Dog Judge' });
    const bitchJudge = await makeJudge({ name: 'Bitch Judge' });
    await makeJudgeAssignment({ showId: show.id, judgeId: dogJudge.id, breedId: breed.id, sex: 'dog' });
    await makeJudgeAssignment({ showId: show.id, judgeId: bitchJudge.id, breedId: breed.id, sex: 'bitch' });

    const bitchAch = await caller.secretary.recordAchievement({
      showId: show.id, dogId: dog.id, type: 'best_bitch', date: '2030-06-01',
    });
    expect(bitchAch?.judgeId).toBe(bitchJudge.id);

    const dogAch = await caller.secretary.recordAchievement({
      showId: show.id, dogId: dog.id, type: 'best_dog', date: '2030-06-01',
    });
    expect(dogAch?.judgeId).toBe(dogJudge.id);
  });

  it('leaves judgeId null when a non-sex award is ambiguous (split judges)', async () => {
    const { show, breed, dog, caller } = await singleBreedShow();
    const dogJudge = await makeJudge({ name: 'Dog Judge' });
    const bitchJudge = await makeJudge({ name: 'Bitch Judge' });
    await makeJudgeAssignment({ showId: show.id, judgeId: dogJudge.id, breedId: breed.id, sex: 'dog' });
    await makeJudgeAssignment({ showId: show.id, judgeId: bitchJudge.id, breedId: breed.id, sex: 'bitch' });

    // Best of Breed has no sex → two candidate judges → ambiguous → null.
    const ach = await caller.secretary.recordAchievement({
      showId: show.id, dogId: dog.id, type: 'best_of_breed', date: '2030-06-01',
    });
    expect(ach?.judgeId).toBeNull();
  });

  it('does not derive a judge for a group/general show', async () => {
    const { show, breed, dog, caller } = await singleBreedShow('group');
    const judge = await makeJudge({ name: 'Group Judge' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: null });

    const ach = await caller.secretary.recordAchievement({
      showId: show.id, dogId: dog.id, type: 'best_bitch', date: '2030-06-01',
    });
    expect(ach?.judgeId).toBeNull();
  });
});
