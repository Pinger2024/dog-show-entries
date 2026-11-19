import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { dogs } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeDog,
  makeEntry,
  makeUser,
} from '../helpers/factories';

/**
 * `secretary.updateDog` is the fifth write path to the pedigree columns, and
 * the 2026-09-11 clear-guard never reached it: dogs.update, the autosave route
 * and the dog form were fixed, this was not. A secretary correcting a typo
 * from the show's entries page could still empty the sire, dam or breeder —
 * the same defect Michael reproduced that morning, through a different door.
 *
 * Rule (lib/dog-pedigree.ts): cannot be cleared once set; a field that was
 * already blank stays editable so old records can be repaired.
 */

async function secretaryWithEnteredDog(dogOverrides = {}) {
  const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
  const exhibitor = await makeUser({});
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, ...dogOverrides });
  const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id });
  return { caller: createTestCaller(secretary), show, dog, entry };
}

describe('secretary.updateDog — pedigree', () => {
  it('refuses to clear a sire that was already set', async () => {
    const { caller, show, dog, entry } = await secretaryWithEnteredDog({ sireName: 'Old Sire' });

    await expect(
      caller.secretary.updateDog({
        showId: show.id,
        entryId: entry.id,
        changes: { sireName: '' },
        reason: 'typo fix',
      })
    ).rejects.toThrow(/don't clear|sire/i);

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.sireName).toBe('Old Sire');
  });

  it('refuses to clear the dam and breeder too', async () => {
    const { caller, show, dog, entry } = await secretaryWithEnteredDog({
      damName: 'Old Dam',
      breederName: 'Old Breeder',
    });

    await expect(
      caller.secretary.updateDog({
        showId: show.id,
        entryId: entry.id,
        changes: { damName: '', breederName: '' },
        reason: 'typo fix',
      })
    ).rejects.toThrow();

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.damName).toBe('Old Dam');
    expect(saved?.breederName).toBe('Old Breeder');
  });

  it('still allows a genuine correction to a different value', async () => {
    const { caller, show, dog, entry } = await secretaryWithEnteredDog({ sireName: 'Norwolf Rex' });

    await caller.secretary.updateDog({
      showId: show.id,
      entryId: entry.id,
      changes: { sireName: 'Norwulf Rex' },
      reason: 'affix misspelled',
    });

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.sireName).toBe('Norwulf Rex');
  });

  it('still allows filling in a pedigree field that was blank', async () => {
    const { caller, show, dog, entry } = await secretaryWithEnteredDog({ sireName: null });

    await caller.secretary.updateDog({
      showId: show.id,
      entryId: entry.id,
      changes: { sireName: 'Newly Known Sire' },
      reason: 'owner supplied the pedigree',
    });

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.sireName).toBe('Newly Known Sire');
  });

  it('still allows editing the registered name, which is not a pedigree field', async () => {
    const { caller, show, dog, entry } = await secretaryWithEnteredDog({ sireName: 'Old Sire' });

    await caller.secretary.updateDog({
      showId: show.id,
      entryId: entry.id,
      changes: { registeredName: 'Corrected Name' },
      reason: 'spelling',
    });

    const saved = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(saved?.registeredName).toBe('Corrected Name');
    expect(saved?.sireName).toBe('Old Sire');
  });
});
