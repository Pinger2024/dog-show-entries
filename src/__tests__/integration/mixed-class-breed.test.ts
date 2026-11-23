/**
 * Mandy, Telegram 8355 (19 Nov 2026): "Why is the contract mentioning junior
 * handling when there are no jh classes selected".
 *
 * South Western's Open Show was set up "Combined Dog & Bitch", so the wizard
 * saved every class with no breed. Remi reads a judge line with no breed and no
 * sex as the Junior Handling judge, so the judge of the mixed Veteran class was
 * offered "… Dogs & Bitches classes / Junior Handling".
 *
 * Every earlier single-breed show had its mixed classes saved WITH the show's
 * breed (Veteran, Special Award Classes), and the judge line for them carried
 * it too. So: on a single-breed show, a mixed class that is not Junior
 * Handling is saved with the show's breed, whichever way it is created.
 */
import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { showClasses, judgeAssignments, shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrgAndBreed, makeClassDef, makeVenue, makeShow } from '../helpers/factories';
import { judgeOfferDetails, judgeOfferShowWith } from '@/server/services/judge-offer-email';

async function classesOf(showId: string) {
  return testDb.query.showClasses.findMany({
    where: eq(showClasses.showId, showId),
    with: { classDefinition: { columns: { name: true, type: true } }, breed: true },
  });
}

describe('a mixed class on a single-breed show carries the show breed (Mandy 8355)', () => {
  it('journey: Combined Dog & Bitch show → judge added from the classes → the offer does not say Junior Handling', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const [puppy, veteran] = await Promise.all([
      makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 }),
      makeClassDef({ name: 'Veteran', type: 'age', sortOrder: 99 }),
    ]);
    const caller = createTestCaller(user);
    const created = await caller.shows.create({
      name: 'Combined Open Show',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      venueId: (await makeVenue({ organisationId: org.id })).id,
      breedId: breed.id,
      startDate: '2030-06-01',
      endDate: '2030-06-01',
      classSexArrangement: 'combined_sex',
      classDefinitionIds: [puppy.id, veteran.id],
      entryFee: 1000,
    });

    const cls = await classesOf(created.id);
    expect(cls).toHaveLength(2);

    // The Add Judge wizard offers one line per breed + sex found on the classes
    // (add-judge-wizard.tsx showBreedSexCombos) and saves the judge with them.
    const combos = [...new Map(cls.map((c) => [`${c.breedId}:${c.sex}`, { breedId: c.breedId, sex: c.sex as 'dog' | 'bitch' | null }])).values()];
    await caller.secretary.addAndAssignJudge({
      showId: created.id,
      name: 'Miss S Smith',
      contactEmail: 'judge@example.invalid',
      assignments: combos,
    });

    const show = await testDb.query.shows.findFirst({ where: eq(shows.id, created.id), with: judgeOfferShowWith });
    const lines = await testDb.query.judgeAssignments.findMany({
      where: eq(judgeAssignments.showId, created.id),
      with: { breed: true },
    });
    const { classificationLine } = judgeOfferDetails(show!, lines, { livesOverseas: false });
    expect(classificationLine).not.toContain('Junior Handling');
    expect(classificationLine).toBe(`${breed.name} Dogs & Bitches classes`);

    // …because the mixed classes were saved with the show's breed, the shape
    // every earlier single-breed show already has.
    for (const c of cls) {
      expect(c.sex).toBeNull();
      expect(c.breedId).toBe(breed.id);
      expect(c.isBreedSpecific).toBe(true);
    }
  });

  it('Separate Dog & Bitch show: Dog and Bitch classes keep no breed, Junior Handling keeps no breed', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const [puppy, jh] = await Promise.all([
      makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 }),
      makeClassDef({ name: 'JH 12-16', type: 'junior_handler', sortOrder: 200 }),
    ]);
    const created = await createTestCaller(user).shows.create({
      name: 'Separate Open Show',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      venueId: (await makeVenue({ organisationId: org.id })).id,
      breedId: breed.id,
      startDate: '2030-06-01',
      endDate: '2030-06-01',
      classSexArrangement: 'separate_sex',
      classDefinitionIds: [puppy.id, jh.id],
      entryFee: 1000,
      juniorHandlerFee: 0,
    });
    const cls = await classesOf(created.id);
    expect(cls).toHaveLength(3);
    for (const c of cls) expect(c.breedId).toBeNull();
    expect(cls.find((c) => c.classDefinition?.type === 'junior_handler')?.sex).toBeNull();
  });

  it('Combined show with Junior Handling: the JH class stays without a breed (it is the Junior Handling shape)', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const [veteran, jh] = await Promise.all([
      makeClassDef({ name: 'Veteran', type: 'age', sortOrder: 99 }),
      makeClassDef({ name: 'JH 6-11', type: 'junior_handler', sortOrder: 200 }),
    ]);
    const created = await createTestCaller(user).shows.create({
      name: 'Combined With JH',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      venueId: (await makeVenue({ organisationId: org.id })).id,
      breedId: breed.id,
      startDate: '2030-06-01',
      endDate: '2030-06-01',
      classSexArrangement: 'combined_sex',
      classDefinitionIds: [veteran.id, jh.id],
      entryFee: 1000,
      juniorHandlerFee: 0,
    });
    const cls = await classesOf(created.id);
    expect(cls.find((c) => c.classDefinition?.type === 'junior_handler')?.breedId).toBeNull();
    expect(cls.find((c) => c.classDefinition?.name === 'Veteran')?.breedId).toBe(breed.id);
  });

  it('Add Individual Class: Combined with "Any breed" on a single-breed show saves the show breed; Dog/Bitch and JH do not', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, showScope: 'single_breed', breedId: breed.id });
    const [veteran, open, jh] = await Promise.all([
      makeClassDef({ name: 'Veteran', type: 'age', sortOrder: 99 }),
      makeClassDef({ name: 'Open', type: 'achievement', sortOrder: 50 }),
      makeClassDef({ name: 'JH 12-16', type: 'junior_handler', sortOrder: 200 }),
    ]);
    const caller = createTestCaller(user);
    const vet = await caller.secretary.addShowClass({ showId: show.id, classDefinitionId: veteran.id, sex: null, entryFee: 1000 });
    const dogOpen = await caller.secretary.addShowClass({ showId: show.id, classDefinitionId: open.id, sex: 'dog', entryFee: 1000 });
    const jhClass = await caller.secretary.addShowClass({ showId: show.id, classDefinitionId: jh.id, sex: null, entryFee: 100 });

    expect(vet.breedId).toBe(breed.id);
    expect(vet.isBreedSpecific).toBe(true);
    expect(dogOpen.breedId).toBeNull();
    expect(jhClass.breedId).toBeNull();
  });

  it('bulk class creation with no breeds ticked, on a single-breed show: the mixed Veteran gets the show breed, JH does not', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, showScope: 'single_breed', breedId: breed.id });
    const [veteran, jh] = await Promise.all([
      makeClassDef({ name: 'Veteran', type: 'age', sortOrder: 99 }),
      makeClassDef({ name: 'JH 6-11', type: 'junior_handler', sortOrder: 200 }),
    ]);
    await createTestCaller(user).secretary.bulkCreateClasses({
      showId: show.id,
      breedIds: [],
      classDefinitionIds: [veteran.id, jh.id],
      entryFee: 1000,
    });
    const cls = await classesOf(show.id);
    expect(cls.find((c) => c.classDefinition?.name === 'Veteran')?.breedId).toBe(breed.id);
    expect(cls.find((c) => c.classDefinition?.type === 'junior_handler')?.breedId).toBeNull();
  });

  it('an all-breed show is untouched: a breed-less mixed class stays breed-less', async () => {
    const { user, org } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, showScope: 'general' });
    const avOpen = await makeClassDef({ name: 'AV Open', type: 'achievement', sortOrder: 60 });
    const added = await createTestCaller(user).secretary.addShowClass({ showId: show.id, classDefinitionId: avOpen.id, sex: null, entryFee: 1000 });
    expect(added.breedId).toBeNull();
    const row = await testDb.query.showClasses.findFirst({ where: and(eq(showClasses.id, added.id)) });
    expect(row?.isBreedSpecific).toBe(false);
  });
});
