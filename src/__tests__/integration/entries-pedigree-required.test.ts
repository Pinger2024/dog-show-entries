/**
 * Closing the entry-time hole: dogs.create/update now require sire, dam,
 * breeder and colour (see pedigree-required.test.ts), but nothing stopped a
 * dog that predates those checks — or one Mandy hasn't got to yet — from
 * being entered into a show anyway. The catalogue can't be produced without
 * these fields, so entries.create is the last choke point that needs them.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeSecretaryWithOrg,
} from '../helpers/factories';

/** A plain RKC single-breed show with one open (unrestricted-age) class. */
async function rkcShow() {
  const { org } = await makeSecretaryWithOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'rkc',
    status: 'entries_open',
    startDate: '2030-06-01',
    endDate: '2030-06-01',
  });
  const classDef = await makeClassDef({ name: 'Open' });
  const showClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: classDef.id,
    breedId: breed.id,
    entryFee: 500,
  });
  return { org, breed, show, showClass };
}

/** A dog that satisfies the baseline pedigree rule. */
function completePedigree() {
  return {
    sireName: 'Test Sire',
    damName: 'Test Dam',
    breederName: 'Test Breeder',
    colour: 'Black and Gold',
  };
}

describe('entries.create — baseline pedigree required to enter any show', () => {
  it('rejects an entry for a dog with a blank breeder', async () => {
    const { show, breed, showClass } = await rkcShow();
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id, ...completePedigree(), breederName: '' });

    await expect(
      createTestCaller(owner).entries.create({
        dogId: dog.id,
        showId: show.id,
        classIds: [showClass.id],
        isNfc: false,
      })
    ).rejects.toThrow(/breeder/i);

    const created = await testDb.query.entries.findMany({ where: eq(entries.showId, show.id) });
    expect(created).toHaveLength(0);
  });

  it('rejects an entry for a dog with a blank sire', async () => {
    const { show, breed, showClass } = await rkcShow();
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id, ...completePedigree(), sireName: null });

    await expect(
      createTestCaller(owner).entries.create({
        dogId: dog.id,
        showId: show.id,
        classIds: [showClass.id],
        isNfc: false,
      })
    ).rejects.toThrow(/sire/i);
  });

  it('rejects an entry for a dog with a blank dam', async () => {
    const { show, breed, showClass } = await rkcShow();
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id, ...completePedigree(), damName: '   ' });

    await expect(
      createTestCaller(owner).entries.create({
        dogId: dog.id,
        showId: show.id,
        classIds: [showClass.id],
        isNfc: false,
      })
    ).rejects.toThrow(/dam/i);
  });

  it('rejects an entry for a dog with a blank colour', async () => {
    const { show, breed, showClass } = await rkcShow();
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id, ...completePedigree(), colour: null });

    await expect(
      createTestCaller(owner).entries.create({
        dogId: dog.id,
        showId: show.id,
        classIds: [showClass.id],
        isNfc: false,
      })
    ).rejects.toThrow(/colour/i);
  });

  it('allows an entry when the dog has a complete pedigree', async () => {
    const { show, breed, showClass } = await rkcShow();
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id, ...completePedigree() });

    const entry = await createTestCaller(owner).entries.create({
      dogId: dog.id,
      showId: show.id,
      classIds: [showClass.id],
      isNfc: false,
    });

    expect(entry).toBeDefined();
    const created = await testDb.query.entries.findMany({ where: eq(entries.showId, show.id) });
    expect(created).toHaveLength(1);
  });
});
