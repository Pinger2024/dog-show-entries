/**
 * Closes the REAL entry-time hole: orders.checkout — the exhibitor checkout
 * path used by src/app/(shows)/shows/[id]/enter/page.tsx — inserts into
 * `entries` directly and never went through entries.create's guard. A dog
 * missing sire/dam/breeder/colour could still be checked out and paid for.
 *
 * Must run BEFORE any Stripe payment intent / order row is created — a
 * rejection after payment would be worse than the original bug, so every
 * test here also asserts no `orders` row exists afterward.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { orders, entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
} from '../helpers/factories';

async function pedigreeShow() {
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'rkc',
    status: 'entries_open',
    startDate: '2030-06-01',
    endDate: '2030-06-01',
    firstEntryFee: 800,
    subsequentEntryFee: 500,
    nfcEntryFee: 300,
    juniorHandlerFee: 400,
  });
  const classDef = await makeClassDef();
  const showClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: classDef.id,
    breedId: breed.id,
    entryFee: 800,
  });
  const jhDef = await makeClassDef({ type: 'junior_handler' });
  const jhClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: jhDef.id,
    entryFee: 400,
  });
  return { exhibitor, org, breed, show, showClass, jhClass };
}

function completePedigree() {
  return {
    sireName: 'Test Sire',
    damName: 'Test Dam',
    breederName: 'Test Breeder',
    colour: 'Black and Gold',
  };
}

async function noOrdersOrEntriesCreated(showId: string) {
  const dbOrders = await testDb.query.orders.findMany({ where: eq(orders.showId, showId) });
  const dbEntries = await testDb.query.entries.findMany({ where: eq(entries.showId, showId) });
  expect(dbOrders).toHaveLength(0);
  expect(dbEntries).toHaveLength(0);
}

describe('orders.checkout — baseline pedigree required before payment', () => {
  it("rejects checkout when a standard entry's dog has a blank breeder", async () => {
    const { exhibitor, breed, show, showClass } = await pedigreeShow();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, ...completePedigree(), breederName: '' });

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      })
    ).rejects.toThrow(/breeder/i);

    await noOrdersOrEntriesCreated(show.id);
  });

  it("rejects checkout when a standard entry's dog has a blank sire", async () => {
    const { exhibitor, breed, show, showClass } = await pedigreeShow();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, ...completePedigree(), sireName: null });

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      })
    ).rejects.toThrow(/sire/i);

    await noOrdersOrEntriesCreated(show.id);
  });

  it("rejects checkout when a standard entry's dog has a blank dam", async () => {
    const { exhibitor, breed, show, showClass } = await pedigreeShow();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, ...completePedigree(), damName: '   ' });

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      })
    ).rejects.toThrow(/dam/i);

    await noOrdersOrEntriesCreated(show.id);
  });

  it("rejects checkout when a standard entry's dog has a blank colour", async () => {
    const { exhibitor, breed, show, showClass } = await pedigreeShow();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, ...completePedigree(), colour: null });

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      })
    ).rejects.toThrow(/colour/i);

    await noOrdersOrEntriesCreated(show.id);
  });

  it('allows checkout when every dog has a complete pedigree', async () => {
    const { exhibitor, breed, show, showClass } = await pedigreeShow();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, ...completePedigree() });

    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
    });

    expect(result).toBeDefined();
    const dbEntries = await testDb.query.entries.findMany({ where: eq(entries.showId, show.id) });
    expect(dbEntries).toHaveLength(1);
  });

  it('allows a junior-handler entry with no dog attached, even alongside an incomplete standard dog elsewhere', async () => {
    const { exhibitor, show, jhClass } = await pedigreeShow();

    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [
        {
          entryType: 'junior_handler',
          classIds: [jhClass.id],
          isNfc: false,
          handlerName: 'Jamie Handler',
          handlerDob: '2015-01-01',
        },
      ],
    });

    expect(result).toBeDefined();
    const dbEntries = await testDb.query.entries.findMany({ where: eq(entries.showId, show.id) });
    expect(dbEntries).toHaveLength(1);
    expect(dbEntries[0]?.dogId).toBeNull();
  });
});
