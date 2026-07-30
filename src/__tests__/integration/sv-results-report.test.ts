import { describe, it, expect } from 'vitest';
import { testDb } from '../helpers/db';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeClassDef,
  makeDog,
  makeUser,
  makeJudge,
  makeJudgeAssignment,
  makeAchievement,
} from '../helpers/factories';
import * as schema from '@/server/db/schema';
import { loadSvResultsData } from '@/server/services/sv-results-data';
import { buildSvResultsReport, buildSvResultsXlsxRows } from '@/lib/sv-results';
import { buildSvResultsXlsx } from '@/lib/sv-results-xlsx';

// ── Direct inserts for the SV-specific fields the generic factories don't set ──

async function svShowClass(opts: {
  showId: string;
  classDefinitionId: string;
  sex?: 'dog' | 'bitch' | null;
  svCoatType?: 'stock' | 'long_stock' | null;
  sortOrder?: number;
}) {
  const [row] = await testDb
    .insert(schema.showClasses)
    .values({
      showId: opts.showId,
      classDefinitionId: opts.classDefinitionId,
      sex: opts.sex ?? null,
      svCoatType: opts.svCoatType ?? null,
      entryFee: 2000,
      sortOrder: opts.sortOrder ?? 0,
    })
    .returning();
  return row!;
}

async function svEntry(opts: {
  showId: string;
  exhibitorId: string;
  dogId?: string | null;
  catalogueNumber: string;
  absent?: boolean;
  entryType?: 'standard' | 'junior_handler';
}) {
  const [row] = await testDb
    .insert(schema.entries)
    .values({
      showId: opts.showId,
      dogId: opts.dogId ?? null,
      exhibitorId: opts.exhibitorId,
      status: 'confirmed',
      entryType: opts.entryType ?? 'standard',
      absent: opts.absent ?? false,
      catalogueNumber: opts.catalogueNumber,
      totalFee: 2000,
    })
    .returning();
  return row!;
}

async function svEntryClass(entryId: string, showClassId: string) {
  const [row] = await testDb
    .insert(schema.entryClasses)
    .values({ entryId, showClassId, fee: 2000 })
    .returning();
  return row!;
}

async function svResult(entryClassId: string, svGrade: string | null, placement: number | null) {
  await testDb
    .insert(schema.results)
    .values({ entryClassId, svGrade: svGrade as never, placement });
}

async function addOwner(dogId: string, name: string, address: string) {
  await testDb.insert(schema.dogOwners).values({
    dogId,
    ownerName: name,
    ownerAddress: address,
    ownerEmail: `${name.replace(/\s+/g, '').toLowerCase()}@test.local`,
    isPrimary: true,
    sortOrder: 0,
  });
}

describe('SV graded results report — end to end', () => {
  it('builds the report tree and spreadsheet from a real WUSV show', async () => {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({
      organisationId: org.id,
      showRuleset: 'wusv',
      showScope: 'single_breed',
      breedId: breed.id,
      status: 'completed',
      startDate: '2026-03-22',
      endDate: '2026-03-22',
    });

    const workingDef = await makeClassDef({ name: 'SV Working', type: 'sv_age' });
    const minorDef = await makeClassDef({ name: 'SV Minor Puppy', type: 'sv_age' });
    const jhDef = await makeClassDef({ name: 'Junior Handling 6-11', type: 'junior_handler' });

    // Working Male (stock), Working Female (stock), Minor Puppy Bitch (stock), Working Male (long)
    const cWorkMaleStock = await svShowClass({ showId: show.id, classDefinitionId: workingDef.id, sex: 'dog', svCoatType: 'stock', sortOrder: 1 });
    const cWorkBitchStock = await svShowClass({ showId: show.id, classDefinitionId: workingDef.id, sex: 'bitch', svCoatType: 'stock', sortOrder: 2 });
    const cMinorBitchStock = await svShowClass({ showId: show.id, classDefinitionId: minorDef.id, sex: 'bitch', svCoatType: 'stock', sortOrder: 3 });
    const cWorkMaleLong = await svShowClass({ showId: show.id, classDefinitionId: workingDef.id, sex: 'dog', svCoatType: 'long_stock', sortOrder: 4 });
    const cJh = await svShowClass({ showId: show.id, classDefinitionId: jhDef.id, sex: null, svCoatType: null, sortOrder: 50 });

    // Dogs
    const anton = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Anton Vom Haus Garyn', sex: 'dog', coatType: 'stock', registrationBody: 'sv', kcRegNumber: 'SZ2386790', sireName: 'Grimm Della Valcuvia', damName: "Rover Du Val D'Anzin", breederName: 'Jocelyn Thiel', breederCity: 'Solingen', breederPostcode: '42699', breederCountry: 'Germany' });
    const tornado = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Tornado', sex: 'dog', coatType: 'stock' });
    const bailey = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Bailey Vom Springberg', sex: 'bitch', coatType: 'stock', sireName: 'Sastor', damName: 'Lorah' });
    const zandamor = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Zandamor Gamba', sex: 'bitch', coatType: 'stock' });
    const kehlani = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Kleehuegel Kehlani', sex: 'bitch', coatType: 'stock' });
    const rommel = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Rommel Vd Tempelhoeve', sex: 'dog', coatType: 'long_stock' });
    await addOwner(anton.id, 'Lianne Roe', 'Preston PR5 4DB');

    // Entries + ring numbers (catalogue numbers)
    const eAnton = await svEntry({ showId: show.id, exhibitorId: exhibitor.id, dogId: anton.id, catalogueNumber: '202' });
    const eTornado = await svEntry({ showId: show.id, exhibitorId: exhibitor.id, dogId: tornado.id, catalogueNumber: '200', absent: true });
    const eBailey = await svEntry({ showId: show.id, exhibitorId: exhibitor.id, dogId: bailey.id, catalogueNumber: '190' });
    const eZandamor = await svEntry({ showId: show.id, exhibitorId: exhibitor.id, dogId: zandamor.id, catalogueNumber: '191' });
    const eKehlani = await svEntry({ showId: show.id, exhibitorId: exhibitor.id, dogId: kehlani.id, catalogueNumber: '141' });
    const eRommel = await svEntry({ showId: show.id, exhibitorId: exhibitor.id, dogId: rommel.id, catalogueNumber: '203' });

    // Entry → class links + graded results
    const ecAnton = await svEntryClass(eAnton.id, cWorkMaleStock.id);
    await svResult(ecAnton.id, 'v', 1);
    const ecTornado = await svEntryClass(eTornado.id, cWorkMaleStock.id); // absent → no grade
    void ecTornado;
    const ecBailey = await svEntryClass(eBailey.id, cWorkBitchStock.id);
    await svResult(ecBailey.id, 'v', 1);
    const ecZandamor = await svEntryClass(eZandamor.id, cWorkBitchStock.id);
    await svResult(ecZandamor.id, 'v', 2);
    const ecKehlani = await svEntryClass(eKehlani.id, cMinorBitchStock.id);
    await svResult(ecKehlani.id, 'vp', 1);
    const ecRommel = await svEntryClass(eRommel.id, cWorkMaleLong.id);
    await svResult(ecRommel.id, 'v', 1);

    // Junior Handling entry + handler details + placing
    const eJh = await svEntry({ showId: show.id, exhibitorId: exhibitor.id, dogId: null, catalogueNumber: '300', entryType: 'junior_handler' });
    await testDb.insert(schema.juniorHandlerDetails).values({ entryId: eJh.id, handlerName: 'Jessica Roe', dateOfBirth: '2016-01-01' });
    const ecJh = await svEntryClass(eJh.id, cJh.id);
    await svResult(ecJh.id, null, 1);

    // Top awards
    await makeAchievement({ showId: show.id, dogId: rommel.id, type: 'best_dog' });
    await makeAchievement({ showId: show.id, dogId: bailey.id, type: 'best_bitch' });

    // Judges — breed judge + JH judge
    const breedJudge = await makeJudge({ name: 'Peter Schorling' });
    await makeJudgeAssignment({ showId: show.id, judgeId: breedJudge.id, breedId: breed.id });
    const jhJudge = await makeJudge({ name: 'Dovile Svegzdaite' });
    await makeJudgeAssignment({ showId: show.id, judgeId: jhJudge.id }); // no breed/sex → JH

    void secretary;

    // ── Load + build ──
    const load = await loadSvResultsData(testDb, show.id);
    expect(load).not.toBeNull();
    expect(load!.show.showRuleset).toBe('wusv');

    const report = buildSvResultsReport(load!.reportInput);

    expect(report.coatSections.map((s) => s.title)).toEqual(['Short Coat', 'Long Coats']);
    expect(report.coatSections[0].classes.map((c) => c.label)).toEqual([
      'Working Male (2 years +)',
      'Working Female (2 years +)',
      'Minor Puppy Bitch (6-9 months)',
    ]);

    const workingMale = report.coatSections[0].classes[0];
    expect(workingMale.rows).toEqual([
      { grade: 'V', placement: '1', name: 'Anton Vom Haus Garyn', sire: 'Grimm Della Valcuvia', dam: "Rover Du Val D'Anzin", absent: false },
      { grade: 'Abs', placement: '90', name: 'Tornado', sire: '', dam: '', absent: true },
    ]);

    expect(report.entered).toBe(6);
    expect(report.absent).toBe(1);
    expect(report.judgeName).toBe('Peter Schorling');
    expect(report.jhJudgeName).toBe('Dovile Svegzdaite');
    expect(report.awards).toEqual([
      { label: 'Best Male', dogName: 'Rommel Vd Tempelhoeve' },
      { label: 'Best Female', dogName: 'Bailey Vom Springberg' },
    ]);
    expect(report.jhGroups[0].rows).toEqual([{ placement: '1', handler: 'Jessica Roe' }]);

    // ── Spreadsheet ──
    const rows = buildSvResultsXlsxRows(load!.reportInput, { venue: 'Armitage, GB', date: '22/03/2026' });
    expect(rows.map((r) => r.ringNumber)).toEqual(['141', '190', '191', '200', '202', '203']);
    // Name is split into given name + affix for the SV sheet (Mandy 2026-07-01).
    const antonRow = rows.find((r) => r.dogName === 'Anton')!;
    expect(antonRow.dogAffix).toBe('Vom Haus Garyn');
    expect(antonRow.grading).toBe('V');
    expect(antonRow.placing).toBe(1);
    expect(antonRow.registrationBody).toBe('SV');
    expect(antonRow.breederFirstName).toBe('Jocelyn');
    expect(antonRow.breederSurname).toBe('Thiel');
    expect(antonRow.ownerFirstName).toBe('Lianne');
    expect(antonRow.ownerCityPostcode).toBe('Preston PR5 4DB');
    expect(antonRow.ownerCountry).toBe('UK');

    const xlsx = await buildSvResultsXlsx(rows, { showName: show.name });
    expect(xlsx.length).toBeGreaterThan(1000);
    // xlsx files are ZIP archives — first two bytes are 'PK'.
    expect(xlsx[0]).toBe(0x50);
    expect(xlsx[1]).toBe(0x4b);
  });

  it('non-WUSV shows still load (the route gate handles ruleset)', async () => {
    const { org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, showRuleset: 'rkc', breedId: breed.id });
    const load = await loadSvResultsData(testDb, show.id);
    expect(load!.show.showRuleset).toBe('rkc');
  });
});
