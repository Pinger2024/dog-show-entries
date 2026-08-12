import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock React-PDF to skip expensive rendering. Tests assert on auth/access
// and response shape; the rendering itself is React-PDF's responsibility.
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async () => Buffer.from('%PDF-1.4 stub')),
  // The library exports React-PDF primitives; stub them as plain components.
  Document: ({ children }: { children?: unknown }) => children,
  Page: ({ children }: { children?: unknown }) => children,
  View: ({ children }: { children?: unknown }) => children,
  Text: ({ children }: { children?: unknown }) => children,
  Image: () => null,
  StyleSheet: { create: <T>(s: T) => s },
  Font: {
    register: vi.fn(),
    registerHyphenationCallback: vi.fn(),
    registerEmojiSource: vi.fn(),
  },
}));

vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));

// The schedule/judges-book routes post-process their rendered buffer through
// pdf-lib (stripUnembeddedBase14Fonts) to strip react-pdf's unembedded
// base-14 font refs before print. pdf-lib expects a real, well-formed PDF —
// the react-pdf mock above only returns a text stub ("%PDF-1.4 stub"), which
// isn't parseable. Pass the buffer through unchanged here; the real
// stripping logic is exercised directly against real react-pdf output
// elsewhere, not through this auth/response-shape test.
vi.mock('@/lib/pdf-pad', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf-pad')>();
  return {
    ...actual,
    stripUnembeddedBase14Fonts: vi.fn(async (buf: Buffer) => buf),
  };
});

// Mock the higher-level PDF generation helpers so they don't pull in
// renderToBuffer themselves and so we don't depend on their data assembly.
vi.mock('@/server/services/pdf-generation', () => ({
  generateRingNumbersPdf: vi.fn(async () => Buffer.from('%PDF-1.4 ring-numbers')),
  generatePrizeCardsPdf: vi.fn(async () => Buffer.from('%PDF-1.4 prize-cards')),
  generateJudgesBookPdf: vi.fn(async () => Buffer.from('%PDF-1.4 judges-book')),
  generateRingBoardPdf: vi.fn(async () => Buffer.from('%PDF-1.4 ring-board')),
  generateCataloguePdf: vi.fn(async () => Buffer.from('%PDF-1.4 catalogue')),
  generatePrizeCardOverprintPdf: vi.fn(async () => Buffer.from('%PDF-1.4 overprint')),
}));

import { auth } from '@/lib/auth';
import { GET as scheduleGET } from '@/app/api/schedule/[showId]/route';
import { GET as ringNumbersGET } from '@/app/api/ring-numbers/[showId]/route';
import { GET as judgesBookGET } from '@/app/api/judges-book/[showId]/route';
import { GET as prizeCardsGET } from '@/app/api/prize-cards/[showId]/route';
import { GET as ringBoardGET } from '@/app/api/ring-board/[showId]/route';
import { GET as absenteeReportGET } from '@/app/api/absentee-report/[showId]/route';
import { NextRequest } from 'next/server';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeUser,
  makeDog,
  makeEntry,
  makeShowClass,
  makeEntryClass,
} from '../helpers/factories';
import { testDb } from '../helpers/db';
import { entries as entriesTable } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

const params = (showId: string) => ({ params: Promise.resolve({ showId }) });
const req = (showId: string) =>
  new NextRequest(`http://localhost/api/x/${showId}`);

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('GET /api/schedule/[showId]', () => {
  it('returns 404 for unknown show', async () => {
    const res = await scheduleGET(req('00000000-0000-0000-0000-000000000000'), params('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(404);
  });

  it('returns 401 for draft show without auth', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    vi.mocked(auth).mockResolvedValue(null);
    const res = await scheduleGET(req(show.id), params(show.id));
    expect(res.status).toBe(401);
  });

  it('returns 200 PDF for an org member on a draft show', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    authedAs(user);
    const res = await scheduleGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});

describe('GET /api/ring-numbers/[showId]', () => {
  it('returns 200 PDF for an authed org member', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    authedAs(user);
    const res = await ringNumbersGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  it('returns 403 for an authed user without org membership', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const stranger = await makeUser({ role: 'exhibitor' });
    authedAs(stranger);
    const res = await ringNumbersGET(req(show.id), params(show.id));
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown show', async () => {
    const res = await ringNumbersGET(
      req('00000000-0000-0000-0000-000000000000'),
      params('00000000-0000-0000-0000-000000000000'),
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/judges-book/[showId]', () => {
  it('returns 200 PDF for an authed org member', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    authedAs(user);
    const res = await judgesBookGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});

describe('GET /api/prize-cards/[showId]', () => {
  // Org-member access — the Documents page shows this row to every secretary
  // of an RKC show (documentRowVisible gates by ruleset, not role). The full
  // access matrix lives in pdf-routes-authz.test.ts.
  it('returns 200 PDF for an authed org member', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    authedAs(user);
    const res = await prizeCardsGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});

describe('GET /api/ring-board/[showId]', () => {
  it('returns 200 PDF for an authed org member', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    authedAs(user);
    const res = await ringBoardGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});

describe('GET /api/absentee-report/[showId]', () => {
  it('returns CSV for an authed org member', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    authedAs(user);
    const res = await absenteeReportGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    // Default format is CSV
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toMatch(/text\/csv|csv/);
  });

  it('returns 401 unauthenticated', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    vi.mocked(auth).mockResolvedValue(null);
    const res = await absenteeReportGET(req(show.id), params(show.id));
    expect(res.status).toBe(401);
  });

  it('returns 403 for authed non-member', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const stranger = await makeUser({ role: 'exhibitor' });
    authedAs(stranger);
    const res = await absenteeReportGET(req(show.id), params(show.id));
    expect(res.status).toBe(403);
  });

  // Mandy 2026-07-06: withdrawn entries aren't absentees, and Junior Handling
  // entries don't belong on the absentee report — only absent dogs.
  //
  // Attendance is per CLASS (Mandy 2026-08-12): a "confirmed + absent" dog
  // here means an entry with at least one entry_classes.absent row, which is
  // what makes her appear on this report at all — not the whole-entry
  // entries.absent roll-up (that stays false if she's still present in
  // another class).
  it('lists absent dogs only — excludes withdrawn and Junior Handling', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const showClass = await makeShowClass({ showId: show.id });
    const dogA = await makeDog({ ownerId: user.id, registeredName: 'Absent Dog' });
    const dogB = await makeDog({ ownerId: user.id, registeredName: 'Withdrawn Dog' });
    const dogC = await makeDog({ ownerId: user.id, registeredName: 'JH Dog' });

    // (a) confirmed, absent from her one class → SHOULD appear
    const absent = await makeEntry({ showId: show.id, dogId: dogA.id, exhibitorId: user.id, status: 'confirmed' });
    await testDb.update(entriesTable).set({ catalogueNumber: '5' }).where(eq(entriesTable.id, absent.id));
    await makeEntryClass({ entryId: absent.id, showClassId: showClass.id, absent: true });
    // (b) withdrawn → should NOT appear
    await makeEntry({ showId: show.id, dogId: dogB.id, exhibitorId: user.id, status: 'withdrawn' });
    // (c) confirmed + absent Junior Handling → should NOT appear
    const jh = await makeEntry({ showId: show.id, dogId: dogC.id, exhibitorId: user.id, status: 'confirmed', entryType: 'junior_handler' });
    await testDb.update(entriesTable).set({ catalogueNumber: '85' }).where(eq(entriesTable.id, jh.id));
    await makeEntryClass({ entryId: jh.id, showClassId: showClass.id, absent: true });

    authedAs(user);
    const jsonReq = new NextRequest(`http://localhost/api/x/${show.id}?format=json`);
    const res = await absenteeReportGET(jsonReq, params(show.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalAbsentees).toBe(1);
    expect(body.absentees[0].catalogueNumber).toBe('5');
    expect(body.absentees.some((a: { status: string }) => a.status === 'Withdrawn')).toBe(false);
    expect(body.absentees.some((a: { catalogueNumber: string }) => a.catalogueNumber === '85')).toBe(false);
  });

  // Real incident (Mandy 2026-08-12): a dog absent from her breed class was
  // shown in a Special Award class at the same show — she must still appear
  // on the absentee report (per-class absence, not the whole-entry
  // roll-up), listing only the class she was actually absent from.
  it('lists a dog absent from one of two classes with only that class shown', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const breedClass = await makeShowClass({ showId: show.id });
    const specialAwardClass = await makeShowClass({ showId: show.id });
    const dog = await makeDog({ ownerId: user.id, registeredName: 'Partial Absentee' });

    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: user.id, status: 'confirmed' });
    await testDb.update(entriesTable).set({ catalogueNumber: '7' }).where(eq(entriesTable.id, entry.id));
    await makeEntryClass({ entryId: entry.id, showClassId: breedClass.id, absent: true });
    await makeEntryClass({ entryId: entry.id, showClassId: specialAwardClass.id, absent: false });

    // The whole-entry roll-up stays false — she's still present in one class.
    const stillEntry = await testDb.query.entries.findFirst({ where: eq(entriesTable.id, entry.id) });
    expect(stillEntry?.absent).toBe(false);

    authedAs(user);
    const jsonReq = new NextRequest(`http://localhost/api/x/${show.id}?format=json`);
    const res = await absenteeReportGET(jsonReq, params(show.id));
    const body = await res.json();

    expect(body.totalAbsentees).toBe(1);
    const row = body.absentees[0];
    expect(row.catalogueNumber).toBe('7');
    // Only the class she was actually absent from is listed — not both.
    expect(row.classes.split('; ')).toHaveLength(1);
  });
});
