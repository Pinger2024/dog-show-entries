import { describe, it, expect } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { entries, entryClasses, payments } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makePayment,
} from '../helpers/factories';

const publicCaller = () => createTestCaller(null);

describe('shows.list (public, with filters)', () => {
  it('returns only published / entries_open shows by default', async () => {
    const org = await makeOrg();
    await makeShow({ organisationId: org.id, status: 'draft', name: 'Hidden Draft' });
    const open = await makeShow({ organisationId: org.id, status: 'entries_open', name: 'Open Show' });
    await makeShow({ organisationId: org.id, status: 'completed', name: 'Old Show' });

    const result = await publicCaller().shows.list({});
    const names = result.items.map((s) => s.name);
    expect(names).toContain(open.name);
    expect(names).not.toContain('Hidden Draft');
    expect(names).not.toContain('Old Show');
  });

  it('filters by status when provided', async () => {
    const org = await makeOrg();
    await makeShow({ organisationId: org.id, status: 'completed', name: 'Completed One' });
    await makeShow({ organisationId: org.id, status: 'entries_open', name: 'Open' });
    const result = await publicCaller().shows.list({ status: 'completed' });
    const names = result.items.map((s) => s.name);
    expect(names).toContain('Completed One');
    expect(names).not.toContain('Open');
  });

  it('filters by show type', async () => {
    const org = await makeOrg();
    await makeShow({ organisationId: org.id, status: 'entries_open', showType: 'open', name: 'Open Show' });
    await makeShow({ organisationId: org.id, status: 'entries_open', showType: 'championship', name: 'Champ Show' });
    const result = await publicCaller().shows.list({ showType: 'championship' });
    expect(result.items.map((s) => s.name)).toEqual(['Champ Show']);
  });

  it('filters by breedId — only shows with breed-specific classes for that breed are returned', async () => {
    // Note: the procedure also matches classes with isBreedSpecific=false (catch-all),
    // so this test marks classes breed-specific to assert the narrow case.
    const { showClasses: showClassesTable } = await import('@/server/db/schema');
    const { makeClassDef } = await import('../helpers/factories');
    const org = await makeOrg();
    const [breedA, breedB, cd] = await Promise.all([makeBreed(), makeBreed(), makeClassDef()]);
    const showA = await makeShow({ organisationId: org.id, status: 'entries_open', name: 'A Show' });
    const showB = await makeShow({ organisationId: org.id, status: 'entries_open', name: 'B Show' });
    await testDb.insert(showClassesTable).values([
      { showId: showA.id, breedId: breedA.id, classDefinitionId: cd.id, entryFee: 500, isBreedSpecific: true },
      { showId: showB.id, breedId: breedB.id, classDefinitionId: cd.id, entryFee: 500, isBreedSpecific: true },
    ]);

    const result = await publicCaller().shows.list({ breedId: breedA.id });
    expect(result.items.map((s) => s.name)).toEqual(['A Show']);
  });

  it('search matches show name (case-insensitive substring)', async () => {
    const org = await makeOrg();
    await makeShow({ organisationId: org.id, status: 'entries_open', name: 'Spring Bonanza' });
    await makeShow({ organisationId: org.id, status: 'entries_open', name: 'Autumn Open' });
    const result = await publicCaller().shows.list({ search: 'spring' });
    expect(result.items.map((s) => s.name)).toEqual(['Spring Bonanza']);
  });
});

describe('shows.getById + getClasses (public)', () => {
  it('returns a show + its classes', async () => {
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'entries_open', name: 'Detail Show',
    });
    await makeShowClass({ showId: show.id, breedId: breed.id });
    await makeShowClass({ showId: show.id, breedId: breed.id });

    const dbShow = await publicCaller().shows.getById({ id: show.id });
    expect(dbShow?.name).toBe('Detail Show');

    const classes = await publicCaller().shows.getClasses({ showId: show.id });
    expect(classes).toHaveLength(2);
  });

  it('returns NOT_FOUND for an unknown show id', async () => {
    await expect(
      publicCaller().shows.getById({ id: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow();
  });
});

async function entryReadyToEdit() {
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    firstEntryFee: 800,
    subsequentEntryFee: 400,
  });
  const [c1, c2, c3, dog] = await Promise.all([
    makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 800 }),
    makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 800 }),
    makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 800 }),
    makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
  ]);
  const entry = await makeEntry({
    showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed', totalFee: 800,
  });
  await makeEntryClass({ entryId: entry.id, showClassId: c1.id, fee: 800 });
  return { exhibitor, show, breed, c1, c2, c3, dog, entry };
}

describe('entries.update (class edit + fee diff)', () => {
  it('adds a class — fee goes up, returns clientSecret for additional payment', async () => {
    const { exhibitor, entry, c1, c2 } = await entryReadyToEdit();
    const caller = createTestCaller(exhibitor);

    const res = await caller.entries.update({
      id: entry.id,
      classIds: [c1.id, c2.id],
    });

    // First entry fee 800 + subsequent 400 = 1200
    expect(res.oldFee).toBe(800);
    expect(res.newFee).toBe(1200);
    expect(res.feeDiff).toBe(400);
    expect(res.requiresPayment).toBe(true);
    expect(res.clientSecret).toBeTruthy();

    // entry_classes should now reflect the new set
    const ecRows = await testDb.query.entryClasses.findMany({
      where: eq(entryClasses.entryId, entry.id),
    });
    expect(ecRows.map((r) => r.showClassId).sort()).toEqual([c1.id, c2.id].sort());

    // Adjustment payment row inserted. payment.amount is the GROSS charge
    // (diff subtotal + £1 + 1% platform fee) so it reconciles with Stripe.
    // 400 diff + (100 + round(400 * 0.01)) = 504.
    const adjPayment = await testDb.query.payments.findFirst({
      where: eq(payments.entryId, entry.id),
    });
    expect(adjPayment?.type).toBe('adjustment');
    expect(adjPayment?.amount).toBe(504);
  });

  it('removes a class — fee goes down, refund issued via Stripe (mocked)', async () => {
    const { exhibitor, entry, c1, c2 } = await entryReadyToEdit();
    // Start with two classes (totalFee = 1200) and a successful original payment.
    await testDb.update(entries).set({ totalFee: 1200 }).where(eq(entries.id, entry.id));
    await testDb.insert(entryClasses).values({
      entryId: entry.id, showClassId: c2.id, fee: 800,
    });
    await makePayment({
      entryId: entry.id,
      stripePaymentId: 'pi_test_original',
      amount: 1200,
      status: 'succeeded',
    });

    const res = await createTestCaller(exhibitor).entries.update({
      id: entry.id, classIds: [c1.id], // back down to one class
    });

    expect(res.oldFee).toBe(1200);
    expect(res.newFee).toBe(800);
    expect(res.feeDiff).toBe(-400);
    expect(res.requiresPayment).toBe(false);

    // Refund payment row inserted
    const refundRow = await testDb.query.payments.findFirst({
      where: eq(payments.type, 'refund'),
    });
    expect(refundRow?.amount).toBe(400);
    expect(refundRow?.status).toBe('succeeded');
  });

  it('rejects update on a show that is no longer accepting entries', async () => {
    const { exhibitor, entry, show, c2 } = await entryReadyToEdit();
    const { setShowStatus } = await import('../helpers/factories');
    await setShowStatus(show.id, 'entries_closed');
    await expect(
      createTestCaller(exhibitor).entries.update({ id: entry.id, classIds: [c2.id] }),
    ).rejects.toThrow(/no longer accepting/);
  });

  it('rejects update on an entry that is not the caller\'s', async () => {
    const { entry, c2 } = await entryReadyToEdit();
    const stranger = await makeUser({ role: 'exhibitor' });
    await expect(
      createTestCaller(stranger).entries.update({ id: entry.id, classIds: [c2.id] }),
    ).rejects.toThrow(/Not your entry/);
  });

  it('rejects update with a class id that doesn\'t belong to the show', async () => {
    const { exhibitor, entry } = await entryReadyToEdit();
    const otherOrg = await makeOrg();
    const otherShow = await makeShow({ organisationId: otherOrg.id, status: 'entries_open' });
    const foreignClass = await makeShowClass({ showId: otherShow.id });
    await expect(
      createTestCaller(exhibitor).entries.update({ id: entry.id, classIds: [foreignClass.id] }),
    ).rejects.toThrow(/invalid/);
  });
});

void inArray;
