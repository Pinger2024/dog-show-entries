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
  it('lists absent dogs only — excludes withdrawn and Junior Handling', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const dogA = await makeDog({ ownerId: user.id, registeredName: 'Absent Dog' });
    const dogB = await makeDog({ ownerId: user.id, registeredName: 'Withdrawn Dog' });
    const dogC = await makeDog({ ownerId: user.id, registeredName: 'JH Dog' });

    // (a) confirmed + absent dog → SHOULD appear
    const absent = await makeEntry({ showId: show.id, dogId: dogA.id, exhibitorId: user.id, status: 'confirmed' });
    await testDb.update(entriesTable).set({ absent: true, catalogueNumber: '5' }).where(eq(entriesTable.id, absent.id));
    // (b) withdrawn → should NOT appear
    await makeEntry({ showId: show.id, dogId: dogB.id, exhibitorId: user.id, status: 'withdrawn' });
    // (c) confirmed + absent Junior Handling → should NOT appear
    const jh = await makeEntry({ showId: show.id, dogId: dogC.id, exhibitorId: user.id, status: 'confirmed' });
    await testDb.update(entriesTable).set({ absent: true, entryType: 'junior_handler', catalogueNumber: '85' }).where(eq(entriesTable.id, jh.id));

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
});
