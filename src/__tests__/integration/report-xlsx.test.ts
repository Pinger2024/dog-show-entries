import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

// Phase 2 of the reports merge (2026-07-28): every PDF/CSV report on the
// Documents & Reports page grows an Excel twin, built from the SAME
// row-builder or DB query its PDF/CSV sibling uses (report-rows.ts,
// report-queries.ts) — see documents-not-phase-gated.test.ts for the
// phase-gating invariant these routes must also honour (none of them may
// be gated by show phase, catalogue numbers, or results status).

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
  makeDog,
  makeEntry,
  makeEntryClass,
  makeUser,
} from '../helpers/factories';

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

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('Documents & Reports — Excel (.xlsx) twins', () => {
  it('Exhibitor List xlsx returns a real, re-openable spreadsheet on an entries_open show with no catalogue numbers', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Anton' });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    authedAs(user);

    const res = await reportsGET(req(show.id), reportParams(show.id, 'catalogue-order-xlsx'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(XLSX_CONTENT_TYPE);

    // Round-trip: exceljs must actually be able to re-open what we wrote.
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0x50); // xlsx files are ZIP archives — 'PK'
    expect(buf[1]).toBe(0x4b);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Exhibitor List');
    expect(ws).toBeTruthy();
    const headerRow = ws!.getRow(1).values as unknown[];
    expect(headerRow).toContain('Dog');
    // Header + the one confirmed entry.
    expect(ws!.rowCount).toBeGreaterThanOrEqual(2);
    const dogNames = [];
    for (let r = 2; r <= ws!.rowCount; r++) dogNames.push(ws!.getRow(r).getCell(2).value);
    expect(dogNames).toContain('Anton');
  });

  it('Class Breakdown, Pre-booked Catalogues, SH01 and the three absentee xlsx types all return 200 + xlsx on an entries_open show', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open', showType: 'championship' });
    authedAs(user);

    for (const type of [
      'class-breakdown-xlsx',
      'catalogue-orders-xlsx',
      'sh01-xlsx',
      'absentee-catalogue-xlsx',
      'absentee-report-xlsx',
      'withdrawn-absent-xlsx',
      'financial-statement-xlsx',
    ]) {
      const res = await reportsGET(req(show.id), reportParams(show.id, type));
      expect(res.status, `type=${type}`).toBe(200);
      expect(res.headers.get('content-type'), `type=${type}`).toBe(XLSX_CONTENT_TYPE);
    }
  });

  it('rejects an unknown report type with 400', async () => {
    const { user, org } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    authedAs(user);

    const res = await reportsGET(req(show.id), reportParams(show.id, 'not-a-real-type'));
    expect(res.status).toBe(400);
  });
});
