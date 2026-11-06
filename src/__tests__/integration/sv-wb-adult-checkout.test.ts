/**
 * Mandy 2026-10-09 (BRG rule, secretary Shirley Hutchinson): a dog born on or
 * after 1 Jan 2025 entered in Adult at a regional must have its character
 * assessment (WB) recorded. The online checkout REFUSES such an entry — the rule
 * lives in entryRequirements (lib/entry-requirements.ts), this is the journey.
 */
import { describe, it, expect } from 'vitest';
import { testDb } from '../helpers/db';
import { dogSvProfile } from '@/server/db/schema';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  svReadyDogFields,
  makeSecretaryWithOrg,
} from '../helpers/factories';

async function adultEntry(opts: { dateOfBirth: string; wb: boolean }) {
  const { org } = await makeSecretaryWithOrg();
  const breed = await makeBreed({ name: 'German Shepherd Dog' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'wusv',
    status: 'entries_open',
    juniorHandlerFee: 0,
    regionalFeeConfig: {
      tiers: [{ standardPence: 2000, memberPence: 1700 }],
      memberships: [],
      firstTimeEnabled: false,
      firstTimeFeePence: 0,
      donationsEnabled: false,
    },
  });
  const adult = await makeClassDef({ name: 'Adult', type: 'age' });
  const showClass = await makeShowClass({ showId: show.id, classDefinitionId: adult.id, breedId: breed.id, entryFee: 0 });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({
    ...svReadyDogFields,
    ownerId: exhibitor.id,
    breedId: breed.id,
    kcRegNumber: 'SZ3001',
    microchipNumber: '981000000003001',
    dateOfBirth: opts.dateOfBirth,
  });
  // Health triad done, so the character assessment is the only possible gap.
  await testDb.insert(dogSvProfile).values({ dogId: dog.id, hipGrade: 'bva', elbowGrade: 'bva', dna: 'recorded', wb: opts.wb });
  return () =>
    createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass!.id], isNfc: false }],
    });
}

describe('orders.checkout — character assessment (WB) for young Adults', () => {
  it('refuses a dog born 2025-01-01 in Adult without WB', async () => {
    const checkout = await adultEntry({ dateOfBirth: '2025-01-01', wb: false });
    await expect(checkout()).rejects.toThrow(/Character Assessment \(WB\)/);
  });

  it('accepts the same dog once WB is recorded', async () => {
    const checkout = await adultEntry({ dateOfBirth: '2025-01-01', wb: true });
    await expect(checkout()).resolves.toMatchObject({ totalAmount: 2000 });
  });

  it('accepts an older dog without WB', async () => {
    const checkout = await adultEntry({ dateOfBirth: '2024-12-31', wb: false });
    await expect(checkout()).resolves.toMatchObject({ totalAmount: 2000 });
  });
});
