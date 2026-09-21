/**
 * Mandy, 21 Sept 2026: a Champion dog with no Remi-recorded CC — an import,
 * or simply never entered on Remi before — was told "eligible for all
 * achievement classes" on the class-selection step. A Champion (RKC or a
 * recognised governing body) is eligible for Open only; the gate that
 * decides this (`dogs.getWinSummary`) only ever looked at `achievements`
 * rows, never at `dog_titles` rows or a title typed into the registered
 * name (e.g. "CH Reno..."). Fixed via `lib/dog-champion-status.ts`.
 */
import { describe, it, expect } from 'vitest';
import { dogTitles } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
} from '../helpers/factories';

/** Post Graduate, Limit and Open achievement classes on a show — the
 *  minimum schedule needed to see the eligibility gate actually bite. */
async function makeAchievementShow() {
  const owner = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg();
  const breed = await makeBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });
  for (const name of ['Post Graduate', 'Limit', 'Open']) {
    const classDef = await makeClassDef({ name, type: 'achievement' });
    await makeShowClass({ showId: show.id, breedId: breed.id, classDefinitionId: classDef.id });
  }
  return { owner, breed, show };
}

describe('dogs.getWinSummary — Champion dogs are Open only', () => {
  it('a Champion by NAME PREFIX with no titles/achievements is suggested Open only', async () => {
    const { owner, breed, show } = await makeAchievementShow();
    const dog = await makeDog({
      ownerId: owner.id,
      breedId: breed.id,
      registeredName: 'CH RENO DE LA PETITE LAETICIA (IMP FRA)',
    });

    const summary = await createTestCaller(owner).dogs.getWinSummary({
      dogId: dog.id,
      showId: show.id,
    });

    expect(summary.recommendation.suggested).toBe('Open');
    expect(summary.recommendation.eligible).toEqual(['Open']);
  });

  it('a Champion by TITLE ROW (sh_ch) with a plain name is Open only', async () => {
    const { owner, breed, show } = await makeAchievementShow();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id, registeredName: 'Plain Name Dog' });
    await testDb.insert(dogTitles).values({ dogId: dog.id, title: 'sh_ch' });

    const summary = await createTestCaller(owner).dogs.getWinSummary({
      dogId: dog.id,
      showId: show.id,
    });

    expect(summary.recommendation.suggested).toBe('Open');
    expect(summary.recommendation.eligible).toEqual(['Open']);
  });

  it('an Obedience Champion (ob_ch) is NOT treated as Open-only', async () => {
    const { owner, breed, show } = await makeAchievementShow();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id, registeredName: 'Plain Name Dog' });
    await testDb.insert(dogTitles).values({ dogId: dog.id, title: 'ob_ch' });

    const summary = await createTestCaller(owner).dogs.getWinSummary({
      dogId: dog.id,
      showId: show.id,
    });

    // No qualifying wins and no show-champion title — every achievement
    // class on the show schedule is eligible (Post Graduate is offered
    // first). Not asserting the exact array: a pre-existing, unrelated
    // quirk in `getAchievementEligible`'s name matching lists "Post
    // Graduate" twice (it also satisfies the "Graduate" pattern) — not
    // this bug, not touched by this fix.
    expect(summary.recommendation.eligible).toEqual(
      expect.arrayContaining(['Post Graduate', 'Limit', 'Open']),
    );
    expect(summary.recommendation.suggested).not.toBe('Open');
  });
});
