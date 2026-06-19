import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeClassDef,
  makeShowClass,
  makeDog,
  makeEntryClass,
} from '../helpers/factories';
import { resortCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { entries, showClasses, shows } from '@/server/db/schema';

/** Read one entry's current catalogue number. */
async function catNum(id: string): Promise<string | null> {
  const row = await testDb.query.entries.findFirst({ where: eq(entries.id, id) });
  return row?.catalogueNumber ?? null;
}

describe('catalogue numbering — grouping + provisional/locked', () => {
  it('groups breed → Junior Handlers → NFC, never scattering JH into the breed classes', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_closed' });
    const breedDef = await makeClassDef({ type: 'age', name: 'Minor Puppy' });
    const jhDef = await makeClassDef({ type: 'junior_handler', name: 'JHA Handling (6-11)' });
    const breedClass = await makeShowClass({ showId: show.id, classDefinitionId: breedDef.id });
    const jhClass = await makeShowClass({ showId: show.id, classDefinitionId: jhDef.id });

    const mkEntry = async (classId: string | null, isNfc = false) => {
      const dog = await makeDog({ ownerId: user.id });
      const [entry] = await testDb
        .insert(entries)
        .values({ showId: show.id, dogId: dog.id, exhibitorId: user.id, status: 'confirmed', totalFee: 500, isNfc })
        .returning();
      if (classId) await makeEntryClass({ entryId: entry.id, showClassId: classId });
      return entry;
    };

    const breedA = await mkEntry(breedClass.id);
    const breedB = await mkEntry(breedClass.id);
    const jh = await mkEntry(jhClass.id); // a Junior Handler entry (only a JH class)
    const nfc = await mkEntry(null, true); // NFC, no classes

    await resortCatalogueNumbers(testDb, show.id);

    const breedNums = [Number(await catNum(breedA.id)), Number(await catNum(breedB.id))].sort((a, b) => a - b);
    expect(breedNums).toEqual([1, 2]); // breed dogs take the low numbers
    expect(await catNum(jh.id)).toBe('3'); // JH comes after every breed class
    expect(await catNum(nfc.id)).toBe('4'); // NFC last
  });

  it('locked numbers append late entries; unlocking re-sorts them into class order', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_closed' });
    const caller = createTestCaller(user);

    // Two classes: A is class 1 (sorts first), B is class 2.
    const defA = await makeClassDef({ type: 'age', name: 'Minor Puppy' });
    const defB = await makeClassDef({ type: 'age', name: 'Puppy' });
    const classA = await makeShowClass({ showId: show.id, classDefinitionId: defA.id });
    const classB = await makeShowClass({ showId: show.id, classDefinitionId: defB.id });
    await testDb.update(showClasses).set({ classNumber: 1 }).where(eq(showClasses.id, classA.id));
    await testDb.update(showClasses).set({ classNumber: 2 }).where(eq(showClasses.id, classB.id));

    // Seed two confirmed entries in class B and number them.
    const seed = async () => {
      const dog = await makeDog({ ownerId: user.id });
      const [e] = await testDb
        .insert(entries)
        .values({ showId: show.id, dogId: dog.id, exhibitorId: user.id, status: 'confirmed', totalFee: 500 })
        .returning();
      await makeEntryClass({ entryId: e.id, showClassId: classB.id });
      return e;
    };
    await seed();
    await seed();
    await resortCatalogueNumbers(testDb, show.id); // → class B entries are 1, 2

    // Lock for printing.
    await caller.secretary.lockCatalogueNumbers({ showId: show.id });
    const locked = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(locked?.catalogueNumbersLockedAt).toBeTruthy();

    // A late entry into the EARLIER class A while locked must APPEND (→ 3), not slot to 1.
    const lateDog = await makeDog({ ownerId: user.id });
    const late = await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: lateDog.id,
      classIds: [classA.id],
      exhibitorEmail: 'late@example.com',
    });
    expect(await catNum(late.id)).toBe('3'); // appended, numbers preserved

    // Unlocking re-sorts: the class-A entry drops to 1.
    await caller.secretary.unlockCatalogueNumbers({ showId: show.id });
    expect(await catNum(late.id)).toBe('1');
    const reopened = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(reopened?.catalogueNumbersLockedAt).toBeNull();
  });
});
