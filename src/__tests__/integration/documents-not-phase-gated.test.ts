import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reports-merge (2026-07-27): Mandy proofs the catalogue and steward book
// while entries are still open — "as long as we can still generate things
// like the catalogue options, stewards catalogue etc between entries
// opening and closing as I use that to check the formatting etc." Nothing
// on the Documents & Reports page may be gated by show phase, catalogue
// numbers, or results status.
//
// Catalogue formats moved to a background render job (2026-08-26) — the
// route itself now just enqueues, so this locks in that the ENQUEUE isn't
// phase-gated AND that the render it points at actually completes (not
// silently stuck) for a show with no catalogue numbers or published
// results. The judge's book route is untouched by that refactor and still
// renders synchronously, so its case is unchanged below.

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async () => Buffer.from('%PDF-1.4 stub')),
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

vi.mock('@/lib/pdf-pad', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf-pad')>();
  return {
    ...actual,
    stripUnembeddedBase14Fonts: vi.fn(async (buf: Buffer) => buf),
    padPdfToMultiple: vi.fn(async (buf: Buffer) => buf),
  };
});

// The stubbed react-pdf buffer above isn't a real PDF, so pdf-lib can't
// parse it for a page count — stub that lookup too. Only the worker's own
// page-count read is affected; padPdfToMultiple/stripUnembeddedBase14Fonts
// are mocked out entirely above and never touch pdf-lib in this file.
vi.mock('pdf-lib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pdf-lib')>();
  return {
    ...actual,
    PDFDocument: { ...actual.PDFDocument, load: vi.fn(async () => ({ getPageCount: () => 1 })) },
  };
});

vi.mock('@/server/services/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/services/storage')>();
  return {
    ...actual,
    uploadToR2: vi.fn(async () => undefined),
    getPublicUrl: vi.fn((key: string) => `https://public.r2.test/${key}`),
  };
});

import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { GET as catalogueGET } from '@/app/api/catalogue/[showId]/[format]/route';
import { GET as judgesBookGET } from '@/app/api/judges-book/[showId]/route';
import { NextRequest } from 'next/server';
import { testDb } from '../helpers/db';
import { documentRenderJobs } from '@/server/db/schema';
import { claimNextJob, processJob } from '@/server/workers/document-render-worker';
import { makeSecretaryWithOrg, makeShow } from '../helpers/factories';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

const catalogueParams = (showId: string, format: string) => ({
  params: Promise.resolve({ showId, format }),
});
const showParams = (showId: string) => ({ params: Promise.resolve({ showId }) });
const req = (showId: string) => new NextRequest(`http://localhost/api/x/${showId}`);

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('Documents & Reports — nothing gated by show phase', () => {
  it('catalogue standard/by-class/judging (steward) all enqueue and render to completion on an entries_open show with no catalogue numbers', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    authedAs(user);

    for (const format of ['standard', 'by-class', 'judging']) {
      const res = await catalogueGET(req(show.id), catalogueParams(show.id, format));
      expect(res.status, `format=${format} enqueue should not be gated`).toBe(202);
      const body = await res.json();
      expect(body.jobId).toBeTruthy();

      const job = await claimNextJob(testDb);
      await processJob(testDb, job!);
      const row = await testDb.query.documentRenderJobs.findFirst({ where: eq(documentRenderJobs.id, body.jobId) });
      expect(row?.status, `format=${format} render should not be gated`).toBe('done');
    }
  });

  it("judge's book returns a PDF on an entries_open show with no catalogue numbers or results", async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    authedAs(user);

    const res = await judgesBookGET(req(show.id), showParams(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  it('marked catalogue enqueues and renders to completion even before results are finalised', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    authedAs(user);

    const res = await catalogueGET(req(show.id), catalogueParams(show.id, 'marked'));
    expect(res.status).toBe(202);
    const body = await res.json();

    const job = await claimNextJob(testDb);
    await processJob(testDb, job!);
    const row = await testDb.query.documentRenderJobs.findFirst({ where: eq(documentRenderJobs.id, body.jobId) });
    expect(row?.status).toBe('done');
  });
});
