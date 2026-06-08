/**
 * Bug-hunt #23: dogs.kcRegNumber is globally unique, so a soft-deleted dog kept
 * its row and re-creating one with the same RKC number threw a raw 500 (unique
 * violation) — the dog could never be re-added. Now the owner's own removed dog
 * is restored on re-create; a clash with an active dog gives a friendly error.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { dogs } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeBreed } from '../helpers/factories';

const owners = [
  { ownerName: 'Jane Owner', ownerAddress: '1 High St', ownerEmail: 'jane@test.local', isPrimary: true },
];

describe('dog re-creation after soft-delete (bug-hunt #23)', () => {
  it('restores a previously-removed dog by RKC number instead of 500ing', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);

    const dog = await caller.dogs.create({
      registeredName: 'Rex', breedId: breed.id, sex: 'dog', dateOfBirth: '2024-01-01', kcRegNumber: 'AB123456', owners,
    });
    await caller.dogs.delete({ id: dog.id });

    const restored = await caller.dogs.create({
      registeredName: 'Rex Returns', breedId: breed.id, sex: 'dog', dateOfBirth: '2024-01-01', kcRegNumber: 'AB123456', owners,
    });
    expect(restored.id).toBe(dog.id); // same row, restored
    expect(restored.registeredName).toBe('Rex Returns');
    const row = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(row?.deletedAt).toBeNull();
  });

  it('rejects an RKC number already in active use with a friendly error', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);
    await caller.dogs.create({
      registeredName: 'Rex', breedId: breed.id, sex: 'dog', dateOfBirth: '2024-01-01', kcRegNumber: 'CD456789', owners,
    });
    await expect(
      caller.dogs.create({
        registeredName: 'Dup', breedId: breed.id, sex: 'dog', dateOfBirth: '2024-01-01', kcRegNumber: 'CD456789', owners,
      })
    ).rejects.toThrow(/already registered/i);
  });
});
