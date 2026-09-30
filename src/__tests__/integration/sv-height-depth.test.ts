/**
 * Mandy, 30 Sept 2026 — height and depth on the SV results: "both but doesn't
 * need to be on the day, can be afterwards, every dog from junior upwards gets
 * measured". The League's "Results for SV" sheet carries Height and Depth
 * columns (centimetres, to the half — e.g. 61.5 / 25.5); for North Eastern
 * Anne typed them in by hand after Shirley chased, because Remi had nowhere to
 * record them.
 *
 * Recorded on the entry — the dog at this show — from the steward class page,
 * which the secretary also uses ("Record Results"). Junior, Yearling, Adult and
 * Working only; not for an absent dog; allowed after results are published.
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

  const puppy = await addClass('SV Puppy', 3);
  const junior = await addClass('SV Junior', 4);
  const pup = await addDog(puppy.id, 'PUPPY DOG', '5');
  const jun = await addDog(junior.id, 'JUNIOR DOG', '9');
  const jun2 = await addDog(junior.id, 'SECOND JUNIOR', '10');
  return { secretary, steward, show, pup, jun, jun2 };
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

  it('the steward class page offers height and depth through the shared rule', () => {
    const page = readFileSync(
      join(process.cwd(), 'src', 'app', '(steward)', 'steward', 'shows', '[id]', 'classes', '[classId]', 'page.tsx'),
      'utf8',
    );
    expect(page).toMatch(/isSvMeasuredClass\(/);
    expect(page).toMatch(/recordSvMeasurement/);
  });
});
