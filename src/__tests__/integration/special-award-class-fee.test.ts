/**
 * Bug (Mandy 2026-07-19): a Special Award Class (its own low fee, e.g. £3) was
 * billed the standard first/subsequent entry-fee tier instead. Kathryn Morgan,
 * a member, entered ONLY the £3 special class and was charged the £18 members'
 * first-entry fee. Fee engine now charges special classes their own fee, outside
 * the tier + multi-dog package.
 *
 * Verified end-to-end across both the exhibitor (orders.checkout) and secretary
 * (createManualEntry) paths.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries, entryClasses } from '@/server/db/schema';
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

async function setup() {
  const { user: secretary, org } = await makeSecretaryWithOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    firstEntryFee: 2000, // £20
    subsequentEntryFee: 1000, // £10
  });
  const regularClass = await makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 });
  const specialDef = await makeClassDef({ name: 'Special Award Class - Post Graduate', type: 'special' });
  const specialClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: specialDef.id,
    breedId: breed.id,
    entryFee: 300, // £3
  });
  return { secretary, org, breed, show, regularClass: regularClass!, specialClass: specialClass! };
}

describe('Special Award Class pricing', () => {
  it('charges the special class its own fee when it is the ONLY class (the Kathryn case)', async () => {
    const { show, breed, specialClass } = await setup();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [specialClass.id], isNfc: false }],
    });

    const entry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, checkout.orderId) });
    expect(entry?.totalFee).toBe(300); // £3, NOT the £20 first-entry fee
    expect(checkout.totalAmount).toBe(300);
  });

  it('normal class + special class = first fee + own special fee (Denise/Miss G)', async () => {
    const { show, breed, regularClass, specialClass } = await setup();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [regularClass.id, specialClass.id], isNfc: false }],
    });

    const entry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, checkout.orderId) });
    expect(entry?.totalFee).toBe(2300); // £20 (first) + £3 (special), NOT £20 + £10 subsequent

    const rows = await testDb.query.entryClasses.findMany({ where: eq(entryClasses.entryId, entry!.id) });
    expect(rows.reduce((s, r) => s + (r.fee ?? 0), 0)).toBe(2300);
    // the special class row is charged £3, the normal one £20
    expect(rows.map((r) => r.fee).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([300, 2000]);
  });

  it('secretary manual entry prices the special class the same (£3 alone)', async () => {
    const { secretary, show, breed, specialClass } = await setup();
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });

    const manual = await createTestCaller(secretary).secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [specialClass.id],
      exhibitorEmail: owner.email,
    });
    expect(manual.totalFee).toBe(300);
  });
});
