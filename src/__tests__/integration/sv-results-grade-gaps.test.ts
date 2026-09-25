import { describe, it, expect } from 'vitest';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeClassDef,
  makeDog,
  makeUser,
  makeStewardAssignment,
} from '../helpers/factories';
import * as schema from '@/server/db/schema';
import { loadSvResultsData } from '@/server/services/sv-results-data';
import { buildSvResultsXlsxRows } from '@/lib/sv-results';

// NE Regional, 5 Sept 2026: no. 11 Dramana Anno Domini was placed 1st in
// Minor Puppy Dog (Long Coat) and never graded. Nothing warned anyone; the
// results went to the League with a blank grade and Shirley added VP by hand
// (GSDL BRG, 24 Sept 2026). This journey walks that exact path — steward
// places without grading, the secretary is told before sending, the steward
// grades, and the spreadsheet comes out right.

async function regionalWithOnePlacedPuppy() {
  const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
  const [steward, exhibitor] = await Promise.all([
    makeUser({ role: 'steward' }),
    makeUser({ role: 'exhibitor' }),
  ]);
  const show = await makeShow({
    organisationId: org.id,
    showRuleset: 'wusv',
    showScope: 'single_breed',
    breedId: breed.id,
    status: 'in_progress',
  });
  await makeStewardAssignment({ userId: steward.id, showId: show.id });

  const minorDef = await makeClassDef({ name: 'SV Minor Puppy', type: 'sv_age' });
  const [minorDogLong] = await testDb
    .insert(schema.showClasses)
    .values({
      showId: show.id,
      classDefinitionId: minorDef.id,
      sex: 'dog',
      svCoatType: 'long_stock',
      entryFee: 2000,
      sortOrder: 6,
    })
    .returning();

  const dog = await makeDog({
    ownerId: exhibitor.id,
    breedId: breed.id,
    registeredName: 'DRAMANA ANNO DOMINI',
    sex: 'dog',
    coatType: 'long_stock',
  });
  const [entry] = await testDb
    .insert(schema.entries)
    .values({
      showId: show.id,
      dogId: dog.id,
      exhibitorId: exhibitor.id,
      status: 'confirmed',
      entryType: 'standard',
      catalogueNumber: '11',
      totalFee: 2000,
    })
    .returning();
  const [ec] = await testDb
    .insert(schema.entryClasses)
    .values({ entryId: entry!.id, showClassId: minorDogLong!.id, fee: 2000 })
    .returning();

  return { secretary, steward, org, show, ec: ec! };
}

describe('SV regional — a placed dog with no grade is caught before the results go out', () => {
  it('warns the secretary, clears once the steward grades, and the spreadsheet comes out right', async () => {
    const { secretary, steward, show, ec } = await regionalWithOnePlacedPuppy();
    const stewardCaller = createTestCaller(steward);
    const secretaryCaller = createTestCaller(secretary);

    // Steward taps the dog into 1st — what the steward page sends (no grade).
    await stewardCaller.steward.recordResult({
      entryClassId: ec.id,
      placement: 1,
      placementStatus: null,
      specialAward: null,
    });

    // The secretary's documents page is told, with the dog and the class.
    expect(await secretaryCaller.secretary.getSvResultsGradeGaps({ showId: show.id })).toEqual([
      {
        catalogueNumber: '11',
        dogName: 'DRAMANA ANNO DOMINI',
        className: 'Minor Puppy Dog (6-9 months), Long Coat',
      },
    ]);

    // Steward picks VP from the grade dropdown — what setGrade sends.
    await stewardCaller.steward.recordResult({
      entryClassId: ec.id,
      placement: 1,
      placementStatus: null,
      specialAward: null,
      svGrade: 'vp',
    });

    expect(await secretaryCaller.secretary.getSvResultsGradeGaps({ showId: show.id })).toEqual([]);

    const load = await loadSvResultsData(testDb, show.id);
    const rows = buildSvResultsXlsxRows(load!.reportInput, { venue: 'Outpaw Pursuits', date: '05/09/2026' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      className: '6-9 months LCD',
      ringNumber: '11',
      grading: 'VP',
      placing: 1,
    });
  });

  it('refuses a secretary from another club', async () => {
    const { show } = await regionalWithOnePlacedPuppy();
    const { user: otherSecretary } = await makeSecretaryWithOrgAndBreed();
    const caller = createTestCaller(otherSecretary);

    await expect(caller.secretary.getSvResultsGradeGaps({ showId: show.id })).rejects.toThrow(
      /do not have access/,
    );
  });

  it('returns nothing for a non-regional (RKC) show', async () => {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, showRuleset: 'rkc', breedId: breed.id });
    const caller = createTestCaller(secretary);

    expect(await caller.secretary.getSvResultsGradeGaps({ showId: show.id })).toEqual([]);
  });
});
