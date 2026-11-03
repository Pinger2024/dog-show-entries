/**
 * Mandy, 3 Nov 2026 (Telegram 8175): exhibitors typed both joint owners into
 * one name box, and some typed their address into the name — which then
 * printed in the catalogue as their surname. Ruling (8178): "I'd stop them
 * till they sort it". Every server path that saves an owner's name refuses
 * both, with the words that say how to fix it — the screens check first, but
 * the server is the rule (lib/owner-name.ts). The secretary's Register New Dog
 * gains a joint owner, so a postal entry for joint owners is never stranded.
 */
import { describe, it, expect } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { dogOwners } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeBreed, makeSecretaryWithOrg } from '../helpers/factories';

const pedigree = { sireName: 'Sire A', damName: 'Dam A', breederName: 'Breeder A', colour: 'Black and Gold' };
const owner = (ownerName: string) => ({
  ownerName, ownerAddress: '1 High St, Lanark', ownerEmail: 'owner@test.local', isPrimary: true,
});

describe('an owner name with two people or an address in it is refused', () => {
  it('dogs.create refuses two people in one owner box', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    await expect(
      createTestCaller(user).dogs.create({
        registeredName: 'Rex', breedId: breed.id, sex: 'dog', dateOfBirth: '2024-01-01', ...pedigree,
        owners: [owner('John & Jane Smith')],
      }),
    ).rejects.toThrow(/two people/i);
  });

  it('dogs.update refuses an address typed into the name', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(user);
    const dog = await caller.dogs.create({
      registeredName: 'Rex', breedId: breed.id, sex: 'dog', dateOfBirth: '2024-01-01', ...pedigree,
      owners: [owner('Jane Smith')],
    });
    await expect(
      caller.dogs.update({ id: dog.id, owners: [owner('Jane Smith 12 High Street')] }),
    ).rejects.toThrow(/looks like an address/i);
  });

  it('dogs.create still takes two proper owners', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await createTestCaller(user).dogs.create({
      registeredName: 'Rex', breedId: breed.id, sex: 'dog', dateOfBirth: '2024-01-01', ...pedigree,
      owners: [owner('John Smith'), { ...owner('Jane Smith'), isPrimary: false }],
    });
    expect(dog.id).toBeTruthy();
  });

  it('sign-up and the profile refuse the same names for the account holder', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(user);
    await expect(
      caller.onboarding.saveProfile({ name: 'John & Jane Smith', address: '1 High St', postcode: 'ML11 8ET' }),
    ).rejects.toThrow(/one person's name/i);
    await expect(caller.users.updateProfile({ name: 'Jane Smith, Lanark' })).rejects.toThrow(/looks like an address/i);
  });
});

describe("the secretary's Register New Dog", () => {
  it('refuses two people in the owner box', async () => {
    const { user: secretary } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    await expect(
      createTestCaller(secretary).secretary.registerDogForExhibitor({
        registeredName: 'Postal Pup', breedId: breed.id, sex: 'bitch', dateOfBirth: '2024-02-02', ...pedigree,
        exhibitorEmail: 'postal@test.local', ownerName: 'John & Jane Smith', ownerAddress: '1 High St, Lanark',
      }),
    ).rejects.toThrow(/two people/i);
  });

  it('records a joint owner as a second owner at the same address', async () => {
    const { user: secretary } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const dog = await createTestCaller(secretary).secretary.registerDogForExhibitor({
      registeredName: 'Postal Pup', breedId: breed.id, sex: 'bitch', dateOfBirth: '2024-02-02', ...pedigree,
      exhibitorEmail: 'postal@test.local', ownerName: 'John Smith', ownerAddress: '1 High St, Lanark',
      jointOwnerName: 'Jane Smith',
    });
    const owners = await testDb.query.dogOwners.findMany({
      where: eq(dogOwners.dogId, dog.id), orderBy: [asc(dogOwners.sortOrder)],
    });
    expect(owners.map((o) => [o.ownerName, o.ownerAddress, o.isPrimary, o.sortOrder])).toEqual([
      ['John Smith', '1 High St, Lanark', true, 0],
      ['Jane Smith', '1 High St, Lanark', false, 1],
    ]);
  });
});
