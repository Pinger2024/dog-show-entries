/**
 * Mandy, 20 Oct 2026: "can we start the catalogue numbering for the current
 * live regional at 141 and can we miss out 197, 212 and 216 as those are
 * missing". The club reuses one set of bibs, numbered from 141, and three are
 * lost. Midland (4 Oct) had the same bibs and was renumbered +140 by hand after
 * the show; while entries are open a hand renumber is undone by the next entry,
 * because every confirmation re-sorts the show. So the show carries the rule
 * and every numbering path follows it.
 */
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
  makeUser,
} from '../helpers/factories';
import { resortCatalogueNumbers, syncCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { buildCatalogueSnapshot } from '@/server/services/catalogue-snapshot';
import { entries, showClasses, shows } from '@/server/db/schema';

const BIBS = { catalogueNumberStart: 141, catalogueNumberSkip: [197, 212, 216] };

async function numbersOf(showId: string): Promise<number[]> {
  const rows = await testDb.query.entries.findMany({ where: eq(entries.showId, showId) });
  return rows
    .filter((r) => r.status === 'confirmed' && r.catalogueNumber != null)
    .map((r) => Number(r.catalogueNumber))
    .sort((a, b) => a - b);
}

/** A show with one class and `count` confirmed, unnumbered dogs in it. */
async function showWithDogs(count: number, showFields: Partial<typeof shows.$inferInsert> = {}) {
  const { user, org } = await makeSecretaryWithOrg();
  const show = await makeShow({ organisationId: org.id, status: 'entries_open', ...showFields });
  const def = await makeClassDef({ type: 'age', name: 'Adult' });
  const cls = await makeShowClass({ showId: show.id, classDefinitionId: def.id });
  await testDb.update(showClasses).set({ classNumber: 1 }).where(eq(showClasses.id, cls.id));
  const add = async () => {
    const dog = await makeDog({ ownerId: user.id });
    const [e] = await testDb
      .insert(entries)
      .values({ showId: show.id, dogId: dog.id, exhibitorId: user.id, status: 'confirmed', totalFee: 2000 })
      .returning();
    await makeEntryClass({ entryId: e.id, showClassId: cls.id });
    return e;
  };
  for (let i = 0; i < count; i++) await add();
  return { user, org, show, cls, add };
}

describe('catalogue numbers follow the show’s start and left-out numbers', () => {
  it('a re-sort starts at 141 and steps over 197, 212 and 216', async () => {
    const { show } = await showWithDogs(78, BIBS);
    await resortCatalogueNumbers(testDb, show.id);

    const numbers = await numbersOf(show.id);
    expect(numbers).toHaveLength(78);
    expect(numbers[0]).toBe(141);
    expect(numbers).not.toContain(197);
    expect(numbers).not.toContain(212);
    expect(numbers).not.toContain(216);
    expect(numbers.at(-1)).toBe(221); // 75 bibs to 218, then 219, 220, 221
  });

  it('a show with nothing set still numbers 1 … N', async () => {
    const { show } = await showWithDogs(3);
    await resortCatalogueNumbers(testDb, show.id);
    expect(await numbersOf(show.id)).toEqual([1, 2, 3]);
  });

  it('a late entry on a locked show is given the next number that is not left out', async () => {
    const { user, show, add } = await showWithDogs(56, BIBS); // 141 … 196
    await resortCatalogueNumbers(testDb, show.id);
    expect((await numbersOf(show.id)).at(-1)).toBe(196);

    await createTestCaller(user as never).secretary.lockCatalogueNumbers({ showId: show.id });
    const late = await add();
    await syncCatalogueNumbers(testDb, show.id);

    const row = await testDb.query.entries.findFirst({ where: eq(entries.id, late.id) });
    expect(row?.catalogueNumber).toBe('198');
  });

  it('the secretary saves the rule on the Catalogue page and the numbers move at once', async () => {
    const { user, show } = await showWithDogs(3);
    await resortCatalogueNumbers(testDb, show.id);
    expect(await numbersOf(show.id)).toEqual([1, 2, 3]);

    const saved = await createTestCaller(user as never).secretary.setCatalogueNumberRule({
      showId: show.id,
      start: '141',
      skip: '142',
    });
    expect(saved.rule).toEqual({ start: 141, skip: [142] });

    const row = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(row?.catalogueNumberStart).toBe(141);
    expect(row?.catalogueNumberSkip).toEqual([142]);
    expect(await numbersOf(show.id)).toEqual([141, 143, 144]);
  });

  it('refuses to change the rule while the numbers are locked for printing', async () => {
    const { user, show } = await showWithDogs(2);
    await resortCatalogueNumbers(testDb, show.id);
    const caller = createTestCaller(user as never);
    await caller.secretary.lockCatalogueNumbers({ showId: show.id });

    await expect(
      caller.secretary.setCatalogueNumberRule({ showId: show.id, start: '141', skip: '' }),
    ).rejects.toThrow(/locked/i);
    expect(await numbersOf(show.id)).toEqual([1, 2]);
  });

  it('refuses a start it cannot number with, and a secretary from another club', async () => {
    const { user, show } = await showWithDogs(1);
    const caller = createTestCaller(user as never);
    await expect(caller.secretary.setCatalogueNumberRule({ showId: show.id, start: '0', skip: '' })).rejects.toThrow();
    await expect(
      caller.secretary.setCatalogueNumberRule({ showId: show.id, start: '141', skip: '197, twelve' }),
    ).rejects.toThrow();

    const other = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(other.user as never).secretary.setCatalogueNumberRule({ showId: show.id, start: '141', skip: '' }),
    ).rejects.toThrow();
    const exhibitor = await makeUser();
    await expect(
      createTestCaller(exhibitor as never).secretary.setCatalogueNumberRule({ showId: show.id, start: '141', skip: '' }),
    ).rejects.toThrow();

    const row = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(row?.catalogueNumberStart).toBe(1);
  });

  it('the catalogue snapshot hands the rule to the print preflight with the numbers it issued', async () => {
    const { show } = await showWithDogs(3, { ...BIBS, status: 'entries_closed' });
    await resortCatalogueNumbers(testDb, show.id);
    const snapshot = await buildCatalogueSnapshot(testDb, show.id);
    expect(snapshot.meta.numberRule).toEqual({ start: 141, skip: [197, 212, 216] });
    expect(snapshot.meta.expectedNumbers).toEqual([141, 142, 143]);
  });
});
