/**
 * The registration-clash rule when the clashing dog is on a DIFFERENT
 * account. `dog-duplicate-registration.test.ts` and `dog-recreate.test.ts`
 * already cover the same-owner cases (naming the dog is fine — it's the
 * caller's own data); this file covers the case those never anticipated.
 *
 * Belinda Webb signed into a second account she'd accidentally created and
 * tried to re-add dogs already on her first one. The clash was found
 * correctly (kc_reg_number is UNIQUE), but the message named the other
 * account's dog and told her to "edit that record instead" — impossible
 * from an account that can't see or act on it, and a privacy leak besides
 * (Michael 2026-09-11). All three write paths that can hit this now share
 * one rule: lib/dog-registration-clash.ts.
 */
import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeBreed, makeDog } from '../helpers/factories';

const pedigree = { sireName: 'Sire A', damName: 'Dam A', breederName: 'Breeder A', colour: 'Black & Tan' };

describe('registration clash across accounts', () => {
  it('dogs.create: explains the clash is on another account instead of a flat "already registered"', async () => {
    const ownerA = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    await makeDog({
      ownerId: ownerA.id,
      breedId: breed.id,
      registeredName: 'Ardara Storm',
      kcRegNumber: 'ZZ1122334',
    });

    const ownerB = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(ownerB);

    const attempt = caller.dogs.create({
      registeredName: 'Ardara Storm',
      breedId: breed.id,
      sex: 'dog',
      dateOfBirth: '2023-01-01',
      kcRegNumber: 'ZZ1122334',
      owners: [{ ownerName: 'B Owner', ownerAddress: '2 Low St', ownerEmail: 'b@test.local', isPrimary: true }],
      ...pedigree,
    });

    await expect(attempt).rejects.toThrow(/different account/i);
    // Never names, and never points her at a record she can't act on.
    await expect(attempt).rejects.not.toThrow(/Ardara Storm/);
    await expect(attempt).rejects.not.toThrow(/edit that record/i);
  });

  it('dogs.update: never names the other account\'s dog', async () => {
    const ownerA = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    await makeDog({
      ownerId: ownerA.id,
      breedId: breed.id,
      registeredName: 'Kelso Fraser',
      kcRegNumber: 'YY998877',
    });

    const ownerB = await makeUser({ role: 'exhibitor' });
    const dogB = await makeDog({ ownerId: ownerB.id, breedId: breed.id, kcRegNumber: null });
    const caller = createTestCaller(ownerB);

    const attempt = caller.dogs.update({ id: dogB.id, kcRegNumber: 'YY998877' });

    await expect(attempt).rejects.toThrow(/different account/i);
    await expect(attempt).rejects.not.toThrow(/Kelso Fraser/);
    await expect(attempt).rejects.not.toThrow(/edit that record/i);
  });

  it('secretary.registerDogForExhibitor: a clean error, never the raw Postgres violation', async () => {
    const exhibitorA = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    await makeDog({
      ownerId: exhibitorA.id,
      breedId: breed.id,
      registeredName: 'Glenmara Jet',
      kcRegNumber: 'XX554433',
    });

    const secretary = await makeUser({ role: 'secretary' });
    const caller = createTestCaller(secretary);

    const attempt = caller.secretary.registerDogForExhibitor({
      registeredName: 'Glenmara Jet Two',
      kcRegNumber: 'XX554433',
      breedId: breed.id,
      sex: 'dog',
      dateOfBirth: '2023-01-01',
      exhibitorEmail: 'someone-else@test.local',
      ownerName: 'Some Exhibitor',
      ownerAddress: '3 New Rd',
    });

    await expect(attempt).rejects.toThrow(TRPCError);
    // Before the fix this wasn't a raw "duplicate key" string — it was
    // drizzle's "Failed query" wrapper, dumping the full INSERT statement
    // and every bound parameter (names, dates, ids). Guard against both
    // shapes of leak, not just the one first guessed.
    await expect(attempt).rejects.not.toThrow(/duplicate key|23505|dogs_kc_reg_number|failed query|insert into|\$\d/i);
  });
});
