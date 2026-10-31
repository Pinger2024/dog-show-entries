/**
 * Limited show eligibility (RKC 2026): a dog that has won a CC, or has 5+
 * Reserve CCs under different judges, may not enter a Limited show. By the
 * co-founder's ruling of 2026-07-09, a single-breed championship Best
 * Dog/Best Bitch (+ reserve) COUNTS as the CC (+ RCC) — see
 * `effectiveCcType` in `src/lib/effective-achievement-type.ts`.
 *
 * `dogs.checkLimitedShowEligibility` (the enter page's warning) has always
 * applied that mapping. `orders.checkout` did not — it queried
 * `achievements.type` against a hardcoded CC/RCC list with no
 * `effectiveCcType` call, so a dog whose only "CC" was a single-breed
 * championship Best Dog was warned on the enter page but NOT blocked at
 * checkout. This test exercises checkout directly.
 */
import { describe, it, expect } from 'vitest';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeAchievement,
  makeJudge,
} from '../helpers/factories';
import { createTestCaller } from '../helpers/context';
import { testDb } from '../helpers/db';
import { achievements } from '@/server/db/schema';

async function limitedShow(orgId: string, breedId: string) {
  return makeShow({
    organisationId: orgId,
    breedId,
    showType: 'limited',
    status: 'entries_open',
    firstEntryFee: 500,
  });
}

describe('orders.checkout — Limited show eligibility', () => {
  it('rejects a dog whose only award is a Best Dog at a single-breed championship show (effective CC)', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();

    // The show where the Best Dog was won: single-breed championship, so
    // Best Dog is the effective CC (Mandy 2026-07-09 ruling).
    const champShow = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      showType: 'championship',
      showScope: 'single_breed',
      status: 'completed',
    });

    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Effective CC Dog' });
    await makeAchievement({ showId: champShow.id, dogId: dog.id, type: 'best_dog' });

    const show = await limitedShow(org.id, breed.id);
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      }),
    ).rejects.toThrow(/Effective CC Dog has won a CC and is ineligible for Limited shows/);
  });

  it('rejects a dog with a plain cc achievement', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Plain CC Dog' });
    await makeAchievement({ dogId: dog.id, type: 'cc' });

    const show = await limitedShow(org.id, breed.id);
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      }),
    ).rejects.toThrow(/Plain CC Dog has won a CC and is ineligible for Limited shows/);
  });

  it('accepts a dog with no awards', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const show = await limitedShow(org.id, breed.id);
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });

    const res = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
    });
    expect(res.orderId).toBeTruthy();
  });

  it('rejects a dog with 5+ RCC-equivalents under 5 different judges', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'RCC Dog' });

    for (let i = 0; i < 5; i++) {
      const judge = await makeJudge();
      await testDb
        .insert(achievements)
        .values({ dogId: dog.id, type: 'reserve_cc', judgeId: judge.id, date: '2030-06-01' });
    }

    const show = await limitedShow(org.id, breed.id);
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      }),
    ).rejects.toThrow(/RCC Dog has 5\+ RCCs under different judges and is ineligible for Limited shows/);
  });

  it('does not bar entry when the Best Dog was won at an OPEN show (not a championship)', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();

    const openShow = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      showType: 'open',
      showScope: 'single_breed',
      status: 'completed',
    });

    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await makeAchievement({ showId: openShow.id, dogId: dog.id, type: 'best_dog' });

    const show = await limitedShow(org.id, breed.id);
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });

    const res = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
    });
    expect(res.orderId).toBeTruthy();
  });
});
