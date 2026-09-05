import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

// A dog entered in more than one class (a breed class + a Special Award
// Class, most commonly) is routine at a real show. Three report loaders
// fetch `entries.entryClasses` via Drizzle's relational query API with NO
// `orderBy` on that relation — and Drizzle/Postgres does not guarantee that
// relation comes back in show running order, or even in a stable order
// across runs (confirmed empirically while building the golden-document
// test: two renders of the identical fixture produced "10, A" and "A, 10"
// for the same dog). report-rows.ts then joins that array straight into a
// comma/semicolon-separated string with no sort of its own, so the bug
// reaches three real documents:
//   - Exhibitor List (report-rows.ts buildCatalogueOrderRows) — this file
//   - Absentee list variants (buildAbsenteeRow) — see the second test below
//   - Financial Statement (buildFinancialStatementRow) — third test below
//
// Fix: src/lib/class-labels.ts's sortEntryClassesByShowClassOrder(), applied
// once at each query site (the reports route's inline entries query, and
// report-queries.ts's loadAbsenteeLikeEntries/loadEntryReportEntries)
// before any row-builder sees the data.
//
// Each test below inserts the entry's classes in the REVERSE of show
// running order (the later-running class first) so a formatter that
// trusts DB/insertion order rather than sorting explicitly is exposed.

vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));

import { auth } from '@/lib/auth';
import { GET as reportsGET } from '@/app/api/reports/[showId]/[type]/route';
import { NextRequest } from 'next/server';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeUser,
  makeOrder,
} from '../helpers/factories';
import { testDb } from '../helpers/db';
import { entries as entriesTable, showClasses as showClassesTable } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

const reportParams = (showId: string, type: string) => ({ params: Promise.resolve({ showId, type }) });
const req = (showId: string) => new NextRequest(`http://localhost/api/reports/${showId}/x`);

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** Two show classes with distinct running order (sortOrder/classNumber),
 *  set up the same way a real single-breed show's age classes are. */
async function makeTwoOrderedClasses(showId: string, breedId: string) {
  const earlyDef = await makeClassDef({ name: 'Minor Puppy', type: 'age', sortOrder: 0 });
  const lateDef = await makeClassDef({ name: 'Open', type: 'age', sortOrder: 9 });
  const early = await makeShowClass({ showId, classDefinitionId: earlyDef.id, breedId });
  await testDb.update(showClassesTable).set({ sortOrder: 0, classNumber: 1 }).where(eq(showClassesTable.id, early.id));
  const late = await makeShowClass({ showId, classDefinitionId: lateDef.id, breedId });
  await testDb.update(showClassesTable).set({ sortOrder: 9, classNumber: 10 }).where(eq(showClassesTable.id, late.id));
  return { early, late };
}

async function readXlsxCell(buf: Buffer, sheetIndex: number, columnHeader: string, dataRow = 2): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[sheetIndex]!;
  const headerRow = sheet.getRow(1).values as unknown[];
  const col = headerRow.findIndex((v) => v === columnHeader);
  const row = sheet.getRow(dataRow).values as unknown[];
  return String(row[col] ?? '');
}

describe('Reports — a multi-class dog prints its classes in show running order, not DB return order', () => {
  it('Exhibitor List (catalogue-order-xlsx) lists classes in running order regardless of insertion order', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });
    const { early, late } = await makeTwoOrderedClasses(show.id, breed.id);

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Multi Class Dog' });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await testDb.update(entriesTable).set({ catalogueNumber: '1' }).where(eq(entriesTable.id, entry.id));

    // Later-running class (Open, classNumber 10) inserted FIRST.
    await makeEntryClass({ entryId: entry.id, showClassId: late.id });
    await makeEntryClass({ entryId: entry.id, showClassId: early.id });

    authedAs(user);
    const res = await reportsGET(req(show.id), reportParams(show.id, 'catalogue-order-xlsx'));
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const classes = await readXlsxCell(buf, 0, 'Classes');

    expect(classes).toBe('1, 10');
  });

  it('Absentee report (absentee-report-xlsx) lists classes in running order regardless of insertion order', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });
    const { early, late } = await makeTwoOrderedClasses(show.id, breed.id);

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Absent Multi Class Dog' });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await testDb.update(entriesTable).set({ catalogueNumber: '2' }).where(eq(entriesTable.id, entry.id));

    // Both classes absent (a withdrawn-style row lists every class) —
    // later class inserted FIRST.
    await makeEntryClass({ entryId: entry.id, showClassId: late.id, absent: true });
    await makeEntryClass({ entryId: entry.id, showClassId: early.id, absent: true });

    authedAs(user);
    const res = await reportsGET(req(show.id), reportParams(show.id, 'absentee-report-xlsx'));
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const classes = await readXlsxCell(buf, 0, 'Classes');

    expect(classes).toBe('1. Minor Puppy; 10. Open');
  });

  it('Financial Statement (financial-statement-xlsx) lists classes in running order regardless of insertion order', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });
    const { early, late } = await makeTwoOrderedClasses(show.id, breed.id);

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Paid Multi Class Dog' });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const entry = await makeEntry({
      showId: show.id,
      dogId: dog.id,
      exhibitorId: exhibitor.id,
      orderId: order.id,
      status: 'confirmed',
    });
    await testDb.update(entriesTable).set({ catalogueNumber: '3' }).where(eq(entriesTable.id, entry.id));

    // Later-running class inserted FIRST.
    await makeEntryClass({ entryId: entry.id, showClassId: late.id });
    await makeEntryClass({ entryId: entry.id, showClassId: early.id });

    authedAs(user);
    const res = await reportsGET(req(show.id), reportParams(show.id, 'financial-statement-xlsx'));
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const classes = await readXlsxCell(buf, 0, 'Classes');

    expect(classes).toBe('Minor Puppy; Open');
  });
});
