/**
 * Mandy, 30 Sept 2026 — height and depth on the SV results: "both but doesn't
 * need to be on the day, can be afterwards, every dog from junior upwards gets
 * measured". The League's "Results for SV" sheet carries Height and Depth
 * columns (centimetres, to the half — e.g. 61.5 / 25.5); for North Eastern
 * Anne typed them in by hand after Shirley chased, because Remi had nowhere to
 * record them.
 *
 * Recorded on the entry — the dog at this show. Two screens, one card: the
 * steward class page (on the day) and the secretary's Height and depth page
 * (afterwards). The secretary's page matters because the steward page only
 * opens for someone added as a steward, and on live the secretary is a steward
 * on 1 of 5 recent shows — Mandy's first demo link failed on exactly that,
 * 30 Sept. Junior, Yearling, Adult and Working only; not for an absent dog;
 * allowed after results are published.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeClassDef,
  makeDog,
  makeUser,
  makeStewardAssignment,
  makeSecretaryWithOrg,
  lockShowResults,
} from '../helpers/factories';
import * as schema from '@/server/db/schema';
import { loadSvResultsData } from '@/server/services/sv-results-data';
import { buildSvResultsXlsxRows } from '@/lib/sv-results';
import { buildSvResultsXlsx } from '@/lib/sv-results-xlsx';

async function regional() {
  const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
  const [steward, exhibitor] = await Promise.all([makeUser({ role: 'steward' }), makeUser({ role: 'exhibitor' })]);
  const show = await makeShow({
    organisationId: org.id,
    showRuleset: 'wusv',
    showScope: 'single_breed',
    breedId: breed.id,
    status: 'in_progress',
    name: 'Regional Show',
    // Show day has come, so the steward sees the entry list (show-day lock).
    startDate: '2026-07-01',
  });
  await makeStewardAssignment({ userId: steward.id, showId: show.id });

  const addClass = async (name: string, sortOrder: number) => {
    const def = await makeClassDef({ name, type: 'sv_age' });
    const [sc] = await testDb
      .insert(schema.showClasses)
      .values({ showId: show.id, classDefinitionId: def.id, sex: 'dog', svCoatType: 'stock', entryFee: 2000, sortOrder })
      .returning();
    return sc!;
  };
  const addDog = async (showClassId: string, name: string, catalogueNumber: string) => {
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: name, sex: 'dog', coatType: 'stock' });
    const [entry] = await testDb
      .insert(schema.entries)
      .values({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed', entryType: 'standard', catalogueNumber, totalFee: 2000 })
      .returning();
    const [ec] = await testDb.insert(schema.entryClasses).values({ entryId: entry!.id, showClassId, fee: 2000 }).returning();
    return { entry: entry!, ec: ec! };
  };

  // Yearling made FIRST but runs after Junior — lists follow the running
  // order, never the order rows were created in.
  const yearling = await addClass('SV Yearling', 5);
  const puppy = await addClass('SV Puppy', 3);
  const junior = await addClass('SV Junior', 4);
  const yr = await addDog(yearling.id, 'YEARLING DOG', '12');
  const pup = await addDog(puppy.id, 'PUPPY DOG', '5');
  const jun = await addDog(junior.id, 'JUNIOR DOG', '9');
  const jun2 = await addDog(junior.id, 'SECOND JUNIOR', '10');
  return { secretary, steward, show, junior, puppy, yr, pup, jun, jun2 };
}

const entryRow = (id: string) => testDb.query.entries.findFirst({ where: eq(schema.entries.id, id) });

describe('SV height and depth — Junior upwards, steward or secretary, any time', () => {
  it('the steward records height and depth, and they come out on the Results for SV sheet', async () => {
    const { steward, show, jun, jun2 } = await regional();
    await createTestCaller(steward).steward.recordSvMeasurement({ entryClassId: jun.ec.id, heightCm: 61.5, depthCm: 25.5 });

    const saved = await entryRow(jun.entry.id);
    expect(Number(saved!.svHeightCm)).toBe(61.5);
    expect(Number(saved!.svDepthCm)).toBe(25.5);

    const rows = buildSvResultsXlsxRows((await loadSvResultsData(testDb, show.id))!.reportInput, { venue: 'V', date: '4 Oct 2026' });
    const measured = rows.find((r) => r.ringNumber === '9')!;
    expect([measured.height, measured.depth]).toEqual(['61.5', '25.5']);
    const unmeasured = rows.find((r) => r.ringNumber === '10')!;
    expect([unmeasured.height, unmeasured.depth]).toEqual(['', '']);

    // …and in the Height / Depth cells of the actual spreadsheet.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildSvResultsXlsx(rows, { showName: 'Regional Show' }));
    const ws = wb.worksheets[0]!;
    const header = (ws.getRow(1).values as unknown[]).map(String);
    const hCol = header.indexOf('Height');
    const dCol = header.indexOf('Depth');
    let found = false;
    ws.eachRow((row, n) => {
      if (n === 1 || String(row.getCell(header.indexOf('Ring Number')).value) !== '9') return;
      found = true;
      expect(String(row.getCell(hCol).value)).toBe('61.5');
      expect(String(row.getCell(dCol).value)).toBe('25.5');
    });
    expect(found).toBe(true);
    void jun2;
  });

  it('the secretary can add them afterwards, even once results are published and locked', async () => {
    const { secretary, show, jun } = await regional();
    await lockShowResults(show.id);
    await createTestCaller(secretary).steward.recordSvMeasurement({ entryClassId: jun.ec.id, heightCm: 63, depthCm: 29 });
    const saved = await entryRow(jun.entry.id);
    expect([Number(saved!.svHeightCm), Number(saved!.svDepthCm)]).toEqual([63, 29]);
  });

  it('a value can be cleared again', async () => {
    const { steward, jun } = await regional();
    const caller = createTestCaller(steward);
    await caller.steward.recordSvMeasurement({ entryClassId: jun.ec.id, heightCm: 61.5, depthCm: 25.5 });
    await caller.steward.recordSvMeasurement({ entryClassId: jun.ec.id, heightCm: null, depthCm: 25.5 });
    const saved = await entryRow(jun.entry.id);
    expect(saved!.svHeightCm).toBeNull();
    expect(Number(saved!.svDepthCm)).toBe(25.5);
  });

  it('refuses a dog in a class that is not measured (below Junior)', async () => {
    const { steward, pup } = await regional();
    await expect(
      createTestCaller(steward).steward.recordSvMeasurement({ entryClassId: pup.ec.id, heightCm: 50, depthCm: 20 }),
    ).rejects.toThrow(/junior/i);
  });

  it('refuses an absent dog', async () => {
    const { steward, jun } = await regional();
    await testDb.update(schema.entryClasses).set({ absent: true }).where(eq(schema.entryClasses.id, jun.ec.id));
    await expect(
      createTestCaller(steward).steward.recordSvMeasurement({ entryClassId: jun.ec.id, heightCm: 61, depthCm: 27 }),
    ).rejects.toThrow(/absent/i);
  });

  it('catches a typo like 615 instead of 61.5', async () => {
    const { steward, jun } = await regional();
    await expect(
      createTestCaller(steward).steward.recordSvMeasurement({ entryClassId: jun.ec.id, heightCm: 615, depthCm: 25 }),
    ).rejects.toThrow(/height/i);
    await expect(
      createTestCaller(steward).steward.recordSvMeasurement({ entryClassId: jun.ec.id, heightCm: 61, depthCm: 255 }),
    ).rejects.toThrow(/depth/i);
  });

  it('the secretary gets every dog to measure on one page, class by class — without being a steward', async () => {
    const { secretary, steward, show, jun, jun2 } = await regional();
    await createTestCaller(steward).steward.recordSvMeasurement({ entryClassId: jun.ec.id, heightCm: 61.5, depthCm: 25.5 });

    const sheet = await createTestCaller(secretary).secretary.getSvMeasurements({ showId: show.id });
    // Junior then Yearling (running order); the Puppy class isn't measured.
    expect(sheet.classes.map((c) => c.entries.map((e) => e.catalogueNumber))).toEqual([['9', '10'], ['12']]);
    expect(sheet.classes[0]!.label).toMatch(/Junior/);
    expect(sheet.classes[0]!.label).toMatch(/Dog/);
    const nine = sheet.classes[0]!.entries[0]!;
    expect([nine.dogName, nine.svHeightCm, nine.svDepthCm]).toEqual(['JUNIOR DOG', '61.5', '25.5']);

    // An absent dog isn't measured, so it drops off the list.
    await testDb.update(schema.entryClasses).set({ absent: true }).where(eq(schema.entryClasses.id, jun2.ec.id));
    const after = await createTestCaller(secretary).secretary.getSvMeasurements({ showId: show.id });
    expect(after.classes.map((c) => c.entries.map((e) => e.catalogueNumber))).toEqual([['9'], ['12']]);
  });

  it('a steward who is a secretary at another club can still save on the show they steward', async () => {
    // North East 2026 had exactly this: a steward whose role is secretary
    // (of their own club), not a member of the host club.
    const { show, jun } = await regional();
    const { user: visitingSteward } = await makeSecretaryWithOrg();
    await makeStewardAssignment({ userId: visitingSteward.id, showId: show.id });
    await createTestCaller(visitingSteward).steward.recordSvMeasurement({ entryClassId: jun.ec.id, heightCm: 60, depthCm: 26 });
    const saved = await entryRow(jun.entry.id);
    expect([Number(saved!.svHeightCm), Number(saved!.svDepthCm)]).toEqual([60, 26]);
  });

  it('refuses someone who neither stewards the show nor runs its club', async () => {
    const { show, jun } = await regional();
    const { user: otherSecretary } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(otherSecretary).steward.recordSvMeasurement({ entryClassId: jun.ec.id, heightCm: 60, depthCm: 26 }),
    ).rejects.toThrow(/own shows/i);
    await expect(createTestCaller(otherSecretary).secretary.getSvMeasurements({ showId: show.id })).rejects.toThrow();
  });

  it('the steward class page is told which dogs to measure by the same rule as the save', async () => {
    const { steward, junior, puppy, jun, jun2 } = await regional();
    await testDb.update(schema.entryClasses).set({ absent: true }).where(eq(schema.entryClasses.id, jun2.ec.id));
    const juniorRows = (await createTestCaller(steward).steward.getClassEntries({ showClassId: junior.id })).entries;
    const measurable = Object.fromEntries(juniorRows.map((r) => [r.entryClassId, r.svMeasurable]));
    expect(measurable).toEqual({ [jun.ec.id]: true, [jun2.ec.id]: false });
    const puppyRows = (await createTestCaller(steward).steward.getClassEntries({ showClassId: puppy.id })).entries;
    expect(puppyRows.every((r) => r.svMeasurable === false)).toBe(true);
  });

  it('the height and depth boxes live in ONE card, used by both the steward and the secretary pages', () => {
    const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
    const steward = read('src', 'app', '(steward)', 'steward', 'shows', '[id]', 'classes', '[classId]', 'page.tsx');
    const secretary = read('src', 'app', '(secretary)', 'secretary', 'shows', '[id]', 'results', 'height-and-depth', 'page.tsx');
    const card = read('src', 'components', 'sv', 'sv-measurements-card.tsx');
    for (const page of [steward, secretary]) {
      expect(page).toMatch(/from '@\/components\/sv\/sv-measurements-card'/);
      expect(page).toMatch(/recordSvMeasurement/);
      // Which dogs get boxes is the server's svMeasurable — never re-decided here.
      expect(page).not.toMatch(/isSvMeasuredClass\(/);
      expect(page).not.toMatch(/Height in cm/);
    }
    expect(card).toMatch(/Height in cm/);
    expect(card).toMatch(/svMeasurementProblem/);
  });
});
