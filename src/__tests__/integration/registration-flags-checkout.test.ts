/**
 * The exhibitor sets NAF/TAF/CNAF per dog on the cart-review step, and the
 * checkout payload is mapped field-by-field with no spread — so a new field is
 * exactly the kind that gets silently dropped between cart and database.
 * These tests pin that the flags actually land on the `entries` rows.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries } from '@/server/db/schema';
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

async function flagShow() {
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
  });
  const classDef = await makeClassDef();
  const showClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: classDef.id,
    breedId: breed.id,
    entryFee: 800,
  });
  const dog = await makeDog({
    ownerId: exhibitor.id,
    breedId: breed.id,
    sireName: 'Test Sire',
    damName: 'Test Dam',
    breederName: 'Test Breeder',
    colour: 'Black and Gold',
  });
  return { exhibitor, show, showClass, dog };
}

describe('orders.checkout — RKC registration flags persist', () => {
  it('writes the flags the exhibitor ticked onto the entry', async () => {
    const { exhibitor, show, showClass, dog } = await flagShow();

    await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [
        {
          entryType: 'standard',
          dogId: dog.id,
          classIds: [showClass.id],
          isNfc: false,
          naf: true,
          taf: true,
          cnaf: false,
        },
      ],
    });

    const [row] = await testDb.select().from(entries).where(eq(entries.showId, show.id));
    expect(row?.naf).toBe(true);
    expect(row?.taf).toBe(true);
    expect(row?.cnaf).toBe(false);
  });

  it('stores an ATC number for an overseas dog, normalised', async () => {
    const { exhibitor, show, showClass, dog } = await flagShow();

    await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [
        {
          entryType: 'standard',
          dogId: dog.id,
          classIds: [showClass.id],
          isNfc: false,
          atcNumber: ' atc01234swe ',
        },
      ],
    });

    const [row] = await testDb.select().from(entries).where(eq(entries.showId, show.id));
    expect(row?.atcNumber).toBe('ATC01234SWE');
  });

  it('defaults every flag to false when the exhibitor leaves it alone', async () => {
    const { exhibitor, show, showClass, dog } = await flagShow();

    await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [
        { entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false },
      ],
    });

    const [row] = await testDb.select().from(entries).where(eq(entries.showId, show.id));
    expect(row?.naf).toBe(false);
    expect(row?.taf).toBe(false);
    expect(row?.cnaf).toBe(false);
  });
});
