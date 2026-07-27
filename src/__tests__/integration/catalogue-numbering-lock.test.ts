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
import { resortCatalogueNumbers, syncCatalogueNumbers } from '@/server/services/catalogue-numbering';
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

/**
 * South Western GSD, 2026-07-26: the show closed with 93 confirmed entries and
 * only 55 catalogue numbers. A report render had numbered the first 55; the
 * close-time pass was first-time-only, saw entry #1 already numbered, and
 * no-op'd — so 38 paid entries would have printed with a blank number.
 */
describe('catalogue numbering — no confirmed entry is left unnumbered', () => {
  /** A show with `numbered` entries already numbered and `blank` entries not. */
  async function showWithPartialNumbering(numbered: number, blank: number) {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    const def = await makeClassDef({ type: 'age', name: 'Minor Puppy' });
    const showClass = await makeShowClass({ showId: show.id, classDefinitionId: def.id });

    const add = async () => {
      const dog = await makeDog({ ownerId: user.id });
      const [e] = await testDb
        .insert(entries)
        .values({ showId: show.id, dogId: dog.id, exhibitorId: user.id, status: 'confirmed', totalFee: 500 })
        .returning();
      await makeEntryClass({ entryId: e.id, showClassId: showClass.id });
      return e;
    };

    const early = [];
    for (let i = 0; i < numbered; i++) early.push(await add());
    await resortCatalogueNumbers(testDb, show.id); // an early render numbers these

    const late = [];
    for (let i = 0; i < blank; i++) late.push(await add()); // entries that arrive afterwards
    return { show, early, late, secretary: user };
  }

  it('numbers entries that arrived after an earlier render numbered the rest', async () => {
    const { show, late } = await showWithPartialNumbering(3, 2);

    // Before: the late pair have no number at all.
    expect(await catNum(late[0].id)).toBeNull();
    expect(await catNum(late[1].id)).toBeNull();

    await syncCatalogueNumbers(testDb, show.id);

    const all = await testDb.query.entries.findMany({ where: eq(entries.showId, show.id) });
    expect(all).toHaveLength(5);
    expect(all.every((e) => e.catalogueNumber != null)).toBe(true);
    // 1..5, no gaps, no duplicates.
    expect(all.map((e) => Number(e.catalogueNumber)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('lets the catalogue page repair a part-numbered show', async () => {
    // The page fires assignCatalogueNumbers whenever an entry is missing a
    // number. Until 2026-07-27 it only fired when NO entry had one, so a
    // part-numbered show had no route back to correct from the UI at all.
    const { show, late, secretary } = await showWithPartialNumbering(3, 2);

    await createTestCaller(secretary).secretary.assignCatalogueNumbers({ showId: show.id });

    expect(await catNum(late[0].id)).not.toBeNull();
    expect(await catNum(late[1].id)).not.toBeNull();
  });

  it('fills blanks without shifting existing numbers when the show is locked', async () => {
    const { show, early, late } = await showWithPartialNumbering(3, 2);
    await testDb.update(shows).set({ catalogueNumbersLockedAt: new Date() }).where(eq(shows.id, show.id));

    const before = await Promise.all(early.map((e) => catNum(e.id)));
    const result = await syncCatalogueNumbers(testDb, show.id);

    expect(result.assigned).toBe(2);
    expect(await Promise.all(early.map((e) => catNum(e.id)))).toEqual(before); // untouched
    const appended = [Number(await catNum(late[0].id)), Number(await catNum(late[1].id))].sort((a, b) => a - b);
    expect(appended).toEqual([4, 5]); // appended at max+1
  });

  it('never renumbers a show on a render pass — it only fills blanks', async () => {
    // Two classes, entries seeded into the LATER class first so a re-sort would
    // visibly move them. A render must not do that.
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    const defA = await makeClassDef({ type: 'age', name: 'Minor Puppy' });
    const defB = await makeClassDef({ type: 'age', name: 'Puppy' });
    const classA = await makeShowClass({ showId: show.id, classDefinitionId: defA.id });
    const classB = await makeShowClass({ showId: show.id, classDefinitionId: defB.id });
    await testDb.update(showClasses).set({ classNumber: 1 }).where(eq(showClasses.id, classA.id));
    await testDb.update(showClasses).set({ classNumber: 2 }).where(eq(showClasses.id, classB.id));

    const add = async (classId: string) => {
      const dog = await makeDog({ ownerId: user.id });
      const [e] = await testDb
        .insert(entries)
        .values({ showId: show.id, dogId: dog.id, exhibitorId: user.id, status: 'confirmed', totalFee: 500 })
        .returning();
      await makeEntryClass({ entryId: e.id, showClassId: classId });
      return e;
    };

    const seeded = await add(classB.id);
    await resortCatalogueNumbers(testDb, show.id);
    expect(await catNum(seeded.id)).toBe('1');

    const lateInEarlierClass = await add(classA.id);
    await syncCatalogueNumbers(testDb, show.id, { allowResort: false });

    expect(await catNum(seeded.id)).toBe('1'); // did NOT shift to 2
    expect(await catNum(lateInEarlierClass.id)).toBe('2'); // appended, not slotted in

    // The authoritative re-sort at close then puts it in class order.
    await syncCatalogueNumbers(testDb, show.id);
    expect(await catNum(lateInEarlierClass.id)).toBe('1');
    expect(await catNum(seeded.id)).toBe('2');
  });
});
