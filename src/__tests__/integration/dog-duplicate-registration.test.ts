/**
 * Duplicate registration numbers, and what the exhibitor is told.
 *
 * Rebecca Landgren added the same dog three times, then tried to put the
 * registration number on the fuller record. kc_reg_number is UNIQUE, so
 * Postgres refused it — and the raw violation, carrying the whole failed query
 * and every bound parameter, was rendered on her phone (Mandy 2026-08-22).
 *
 * `create` has guarded against this since bug hunt #23. `update` never did.
 */
import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeDog, makeBreed } from '../helpers/factories';

describe('dogs.update — duplicate registration number', () => {
  it('explains the clash in plain English instead of failing raw', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const first = await makeDog({
      ownerId: owner.id,
      breedId: breed.id,
      registeredName: 'Yakasimba Baloo',
      kcRegNumber: 'BB25399501',
    });
    const second = await makeDog({
      ownerId: owner.id,
      breedId: breed.id,
      registeredName: 'Yakasimba Baloo',
      kcRegNumber: null,
    });
    const caller = createTestCaller(owner);

    const attempt = caller.dogs.update({ id: second.id, kcRegNumber: 'BB25399501' });

    // Names the other dog so the owner can see it's their own duplicate.
    await expect(attempt).rejects.toThrow(/already on "Yakasimba Baloo"/);
    // And never leaks the machinery.
    await expect(attempt).rejects.not.toThrow(/insert|update "dogs"|\$\d|kc_reg_number/i);
    expect(first.kcRegNumber).toBe('BB25399501');
  });

  it('still lets a dog keep its own registration number on an unrelated edit', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({
      ownerId: owner.id,
      breedId: breed.id,
      registeredName: 'Sadrias Gertie',
      kcRegNumber: 'AV0905908',
    });
    const caller = createTestCaller(owner);

    // Re-sending the SAME number must not be read as a clash with itself.
    const updated = await caller.dogs.update({
      id: dog.id,
      kcRegNumber: 'AV0905908',
      colour: 'Black and Gold',
    });
    expect(updated.kcRegNumber).toBe('AV0905908');
  });

  it('lets an owner clear a registration number', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({
      ownerId: owner.id,
      breedId: breed.id,
      registeredName: 'Lochmore Stardust',
      kcRegNumber: 'BB99999999',
    });
    const caller = createTestCaller(owner);

    const updated = await caller.dogs.update({ id: dog.id, kcRegNumber: null });
    expect(updated.kcRegNumber).toBeNull();
  });
});
