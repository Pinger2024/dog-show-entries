/**
 * Mandy 2026-08-03, real incident: "Andy & Ann Johnstone" is crammed into
 * one owner slot on one of her dogs and prints as one person in the
 * catalogue — but Edit Dog had no way to fix it. Owners could only ever be
 * set at dog CREATION; dogs.update had no owners input at all, and the edit
 * form stripped `owners` before mutating and never loaded the saved rows.
 *
 * These tests pin the fix at the server choke point: dogs.update now
 * accepts an optional `owners` array (mirroring create's shape exactly)
 * that fully replaces the dog's dog_owners rows when provided, and leaves
 * them untouched when omitted.
 */
import { describe, it, expect } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { dogOwners } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeBreed } from '../helpers/factories';

const pedigree = { sireName: 'Sire A', damName: 'Dam A', breederName: 'Breeder A', colour: 'Black & Tan' };

async function loadOwners(dogId: string) {
  return testDb.query.dogOwners.findMany({
    where: eq(dogOwners.dogId, dogId),
    orderBy: [asc(dogOwners.sortOrder)],
  });
}

describe('dogs.update — editing a dog\'s saved owners', () => {
  it('replaces all owner rows, preserving the row-0 account link, sortOrder and isPrimary', async () => {
    const mandy = await makeUser({ role: 'exhibitor', name: 'Mandy McAteer' });
    const breed = await makeBreed();
    const caller = createTestCaller(mandy);

    const dog = await caller.dogs.create({
      registeredName: 'Rex',
      breedId: breed.id,
      sex: 'dog',
      dateOfBirth: '2024-01-01',
      ...pedigree,
      owners: [
        { ownerName: 'Mandy McAteer', ownerAddress: '1 High St', ownerEmail: 'mandy@test.local', isPrimary: true },
      ],
    });

    await caller.dogs.update({
      id: dog.id,
      owners: [
        { ownerName: 'Mandy McAteer', ownerAddress: '1 High St', ownerEmail: 'mandy@test.local', isPrimary: true },
        { ownerName: 'Andy Johnstone', ownerAddress: '2 Low St', ownerEmail: 'andy@test.local', isPrimary: false },
        { ownerName: 'Ann Johnstone', ownerAddress: '2 Low St', ownerEmail: 'ann@test.local', isPrimary: false },
      ],
    });

    const owners = await loadOwners(dog.id);
    expect(owners).toHaveLength(3);

    expect(owners[0]?.ownerName).toBe('Mandy McAteer');
    expect(owners[0]?.userId).toBe(mandy.id); // account link preserved
    expect(owners[0]?.isPrimary).toBe(true);
    expect(owners[0]?.sortOrder).toBe(0);

    expect(owners[1]?.ownerName).toBe('Andy Johnstone');
    expect(owners[1]?.userId).toBeNull();
    expect(owners[1]?.isPrimary).toBe(false);
    expect(owners[1]?.sortOrder).toBe(1);

    expect(owners[2]?.ownerName).toBe('Ann Johnstone');
    expect(owners[2]?.userId).toBeNull();
    expect(owners[2]?.sortOrder).toBe(2);
  });

  it('matches the Xano acceptance shape: a crammed joint-owner slot splits into two people', async () => {
    const mandy = await makeUser({ role: 'exhibitor', name: 'Mandy McAteer' });
    const breed = await makeBreed();
    const caller = createTestCaller(mandy);

    // Created the pre-fix way: row 0 linked to Mandy's account, row 1 a
    // single guest slot holding both joint owners' names crammed together.
    const dog = await caller.dogs.create({
      registeredName: 'Xano',
      breedId: breed.id,
      sex: 'bitch',
      dateOfBirth: '2023-06-01',
      ...pedigree,
      owners: [
        { ownerName: 'Mandy McAteer', ownerAddress: '1 High St', ownerEmail: 'mandy@test.local', isPrimary: true },
        { ownerName: 'Andy & Ann Johnstone', ownerAddress: '2 Low St', ownerEmail: 'andy@test.local', isPrimary: false },
      ],
    });

    let owners = await loadOwners(dog.id);
    expect(owners).toHaveLength(2);
    expect(owners[1]?.ownerName).toBe('Andy & Ann Johnstone');

    await caller.dogs.update({
      id: dog.id,
      owners: [
        { ownerName: 'Mandy McAteer', ownerAddress: '1 High St', ownerEmail: 'mandy@test.local', isPrimary: true },
        { ownerName: 'Andy Johnstone', ownerAddress: '2 Low St', ownerEmail: 'andy@test.local', isPrimary: false },
        { ownerName: 'Ann Johnstone', ownerAddress: '2 Low St', ownerEmail: 'ann@test.local', isPrimary: false },
      ],
    });

    owners = await loadOwners(dog.id);
    expect(owners).toHaveLength(3);
    expect(owners.map((o) => o.ownerName)).toEqual(['Mandy McAteer', 'Andy Johnstone', 'Ann Johnstone']);
    expect(owners[0]?.userId).toBe(mandy.id);
    expect(owners[1]?.userId).toBeNull();
    expect(owners[2]?.userId).toBeNull();
  });

  it('leaves owner rows untouched when `owners` is omitted from the update', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);
    const dog = await caller.dogs.create({
      registeredName: 'Untouched',
      breedId: breed.id,
      sex: 'dog',
      dateOfBirth: '2024-01-01',
      ...pedigree,
      owners: [{ ownerName: 'Original Owner', ownerAddress: '1 St', ownerEmail: 'o@test.local', isPrimary: true }],
    });

    const updated = await caller.dogs.update({ id: dog.id, registeredName: 'Renamed, No Owner Change' });
    expect(updated.registeredName).toBe('Renamed, No Owner Change');

    const owners = await loadOwners(dog.id);
    expect(owners).toHaveLength(1);
    expect(owners[0]?.ownerName).toBe('Original Owner');
  });

  it('rejects an owner-row edit from someone who does not own the dog, leaving rows untouched', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const intruder = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const ownerCaller = createTestCaller(owner);
    const dog = await ownerCaller.dogs.create({
      registeredName: 'Guarded',
      breedId: breed.id,
      sex: 'dog',
      dateOfBirth: '2024-01-01',
      ...pedigree,
      owners: [{ ownerName: 'Real Owner', ownerAddress: '1 St', ownerEmail: 'real@test.local', isPrimary: true }],
    });

    const intruderCaller = createTestCaller(intruder);
    await expect(
      intruderCaller.dogs.update({
        id: dog.id,
        owners: [{ ownerName: 'Hijacked', ownerAddress: '2 St', ownerEmail: 'hi@test.local', isPrimary: true }],
      })
    ).rejects.toThrow(/do not own this dog/);

    const owners = await loadOwners(dog.id);
    expect(owners).toHaveLength(1);
    expect(owners[0]?.ownerName).toBe('Real Owner');
  });

  it('rejects more than 4 owners', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);
    const dog = await caller.dogs.create({
      registeredName: 'Crowded',
      breedId: breed.id,
      sex: 'dog',
      dateOfBirth: '2024-01-01',
      ...pedigree,
      owners: [{ ownerName: 'Owner One', ownerAddress: '1 St', ownerEmail: 'o1@test.local', isPrimary: true }],
    });

    await expect(
      caller.dogs.update({
        id: dog.id,
        owners: Array.from({ length: 5 }, (_, i) => ({
          ownerName: `Owner ${i + 1}`,
          ownerAddress: `${i + 1} St`,
          ownerEmail: `o${i + 1}@test.local`,
          isPrimary: i === 0,
        })),
      })
    ).rejects.toThrow();

    const owners = await loadOwners(dog.id);
    expect(owners).toHaveLength(1); // rejected before any replace happened
  });

  it('rejects zero owners (at least one is required)', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);
    const dog = await caller.dogs.create({
      registeredName: 'MustKeepOne',
      breedId: breed.id,
      sex: 'dog',
      dateOfBirth: '2024-01-01',
      ...pedigree,
      owners: [{ ownerName: 'Owner One', ownerAddress: '1 St', ownerEmail: 'o1@test.local', isPrimary: true }],
    });

    await expect(caller.dogs.update({ id: dog.id, owners: [] })).rejects.toThrow();

    const owners = await loadOwners(dog.id);
    expect(owners).toHaveLength(1);
  });
});
