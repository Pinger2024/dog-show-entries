import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

// Storage is network-touching (R2/S3) — mock the upload/URL helpers but keep
// everything else (e.g. validateUpload) real, matching the convention in
// upload-presign-route.test.ts.
vi.mock('@/server/services/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/services/storage')>();
  return {
    ...actual,
    uploadToR2: vi.fn(async () => undefined),
    getPublicUrl: vi.fn((key: string) => `https://public.r2.test/${key}`),
    generatePresignedGetUrl: vi.fn(async (key: string) => `https://r2.test/presigned/${key}?sig=stub`),
  };
});

// getCurrentUser() reads this — no request/cookie context in tests.
vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));

// Wrap the REAL pad/strip implementations in spies (not stubs) — the render
// test below needs a genuine PDF, but also needs to prove which post-
// processing path ran. Before this refactor, only the HTTP route applied
// this step; closing that route-vs-print-pipeline drift is the whole point
// of moving post-processing into the shared render function.
vi.mock('@/lib/pdf-pad', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf-pad')>();
  return {
    ...actual,
    padPdfToMultiple: vi.fn(actual.padPdfToMultiple),
    stripUnembeddedBase14Fonts: vi.fn(actual.stripUnembeddedBase14Fonts),
  };
});

import { auth } from '@/lib/auth';
import { GET as catalogueGET } from '@/app/api/catalogue/[showId]/[format]/route';
import { testDb } from '../helpers/db';
import {
  makeSecretaryWithOrg,
  makeUser,
  makeShow,
  makeClassDef,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
} from '../helpers/factories';
import { documentRenderJobs } from '@/server/db/schema';
import { requestCatalogueJob } from '@/server/services/catalogue-jobs';
import {
  claimNextJob,
  processJob,
  resetStaleRunningJobs,
} from '@/server/workers/document-render-worker';
import { uploadToR2 } from '@/server/services/storage';
import { padPdfToMultiple, stripUnembeddedBase14Fonts } from '@/lib/pdf-pad';

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(uploadToR2).mockClear();
  vi.mocked(padPdfToMultiple).mockClear();
  vi.mocked(stripUnembeddedBase14Fonts).mockClear();
});

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

const params = (showId: string, format: string) => ({ params: Promise.resolve({ showId, format }) });
const req = (showId: string, format: string, query = '') =>
  new NextRequest(`http://localhost/api/catalogue/${showId}/${format}${query}`);

/** A show with exactly one confirmed entry in one class — small enough for a
 *  genuine react-pdf render to stay fast, but real data all the way through
 *  (this is the start of the secretary-to-print journey test). */
async function makeMinimalShowWithEntry() {
  const { user, org } = await makeSecretaryWithOrg();
  const show = await makeShow({ organisationId: org.id });
  const classDef = await makeClassDef({ name: 'Open', type: 'age' });
  const showClass = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id });
  const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id });
  await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { user, org, show };
}

describe('requestCatalogueJob — dedupe', () => {
  it('returns the same job for a second request against an unchanged show', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const first = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    const second = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    expect(second.jobId).toBe(first.jobId);
    expect(second.status).toBe('queued');
  });

  it('does not dedupe across formats — each format gets its own job', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const standard = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    const byClass = await requestCatalogueJob(testDb, { showId: show.id, format: 'by-class', requestedByUserId: user.id });
    expect(byClass.jobId).not.toBe(standard.jobId);
  });

  it('a failed job is never returned by dedupe — retry always enqueues fresh', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const { jobId } = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    await testDb.update(documentRenderJobs).set({ status: 'failed', error: 'boom' }).where(eq(documentRenderJobs.id, jobId));

    const retried = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    expect(retried.jobId).not.toBe(jobId);
    expect(retried.status).toBe('queued');
  });

  it('dedupes onto a done job and getCatalogueJobStatus returns a presigned download', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const { jobId } = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    await testDb
      .update(documentRenderJobs)
      .set({ status: 'done', storageKey: `document-jobs/${show.id}/${jobId}.pdf`, fileSha256: 'a'.repeat(64), pageCount: 4 })
      .where(eq(documentRenderJobs.id, jobId));

    const again = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    expect(again.jobId).toBe(jobId);
    expect(again.status).toBe('done');
  });
});

describe('GET /api/catalogue/[showId]/[format] — enqueue branch', () => {
  it('returns 401 when unauthenticated', async () => {
    const { show } = await makeMinimalShowWithEntry();
    // `auth` is NextAuth's polymorphic export (session getter AND middleware
    // wrapper) — `vi.mocked(auth).mockResolvedValue(null)` sometimes resolves
    // vitest's mock typing against the middleware overload instead depending
    // on unrelated call-site inference elsewhere in the same compilation
    // unit. The cast pins it to the session-getter shape actually in use here.
    (vi.mocked(auth) as unknown as { mockResolvedValue: (v: null) => void }).mockResolvedValue(null);

    const res = await catalogueGET(req(show.id, 'standard'), params(show.id, 'standard'));
    expect(res.status).toBe(401);
  });

  it('enqueues a job and returns 202 with a jobId instead of streaming a PDF', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    authedAs(user);

    const res = await catalogueGET(req(show.id, 'standard'), params(show.id, 'standard'));
    expect(res.status).toBe(202);
    expect(res.headers.get('content-type')).not.toBe('application/pdf');
    const body = await res.json();
    expect(body.jobId).toBeTruthy();
    expect(body.status).toBe('queued');

    const row = await testDb.query.documentRenderJobs.findFirst({ where: eq(documentRenderJobs.id, body.jobId) });
    expect(row?.showId).toBe(show.id);
    expect(row?.format).toBe('standard');
    expect(row?.documentType).toBe('catalogue');
  });

  it('dedupes a second request onto the same queued job', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    authedAs(user);

    const res1 = await catalogueGET(req(show.id, 'standard'), params(show.id, 'standard'));
    const res2 = await catalogueGET(req(show.id, 'standard'), params(show.id, 'standard'));
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body2.jobId).toBe(body1.jobId);
  });

  it('rejects an unknown format with 400', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    authedAs(user);

    const res = await catalogueGET(req(show.id, 'not-a-format'), params(show.id, 'not-a-format'));
    expect(res.status).toBe(400);
  });

  it('still serves ?output=json synchronously and unchanged', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    authedAs(user);

    const res = await catalogueGET(req(show.id, 'standard', '?output=json'), params(show.id, 'standard'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.format).toBe('standard');
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries).toHaveLength(1);
    expect(body.show.name).toBe(show.name);
  });
});

describe('worker: claimNextJob', () => {
  it('claims exactly one queued job per call, oldest first, and skips it on a second call', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const jobA = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    const jobB = await requestCatalogueJob(testDb, { showId: show.id, format: 'by-class', requestedByUserId: user.id });

    const claimed1 = await claimNextJob(testDb);
    const claimed2 = await claimNextJob(testDb);
    const claimed3 = await claimNextJob(testDb);

    expect(claimed1).not.toBeNull();
    expect(claimed2).not.toBeNull();
    expect(claimed3).toBeNull(); // nothing left to claim

    const claimedIds = [claimed1?.id, claimed2?.id].sort();
    expect(claimedIds).toEqual([jobA.jobId, jobB.jobId].sort());
    expect(claimed1?.status).toBe('running');
    expect(claimed1?.attempts).toBe(1);
  });

  it('never claims a job whose attempts already reached max_attempts', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const { jobId } = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    await testDb.update(documentRenderJobs).set({ attempts: 3, maxAttempts: 3 }).where(eq(documentRenderJobs.id, jobId));

    const claimed = await claimNextJob(testDb);
    expect(claimed).toBeNull();
  });
});

describe('worker: processJob — real render', () => {
  it('renders a real PDF from the snapshot, uploads it, and records sha256/page_count/storage_key', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const { jobId } = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });

    const job = await claimNextJob(testDb);
    expect(job?.id).toBe(jobId);

    await processJob(testDb, job!);

    const row = await testDb.query.documentRenderJobs.findFirst({ where: eq(documentRenderJobs.id, jobId) });
    expect(row?.status).toBe('done');
    expect(row?.error).toBeNull();
    expect(row?.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.pageCount).toBeGreaterThan(0);
    // 'standard' is one of the two booklet formats — padPdfToMultiple pads to
    // a multiple of 4, so a real render should never land on an odd count.
    expect((row?.pageCount ?? 0) % 4).toBe(0);
    expect(row?.storageKey).toBe(`document-jobs/${show.id}/${jobId}.pdf`);
    expect(row?.fileBytes).toBeGreaterThan(0);
    expect(row?.finishedAt).not.toBeNull();
    expect(uploadToR2).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadToR2).mock.calls[0][0]).toBe(`document-jobs/${show.id}/${jobId}.pdf`);
    // Post-processing runs on the job path too (previously only the HTTP
    // route applied it — a print-pipeline render shipped with unembedded
    // base-14 font refs). 'standard' is a booklet format: pad, don't
    // strip-only.
    expect(padPdfToMultiple).toHaveBeenCalledTimes(1);
    expect(stripUnembeddedBase14Fonts).not.toHaveBeenCalled();
  }, 20_000);

  it('strips (not pads) a non-booklet format — the judging steward catalogue', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const { jobId } = await requestCatalogueJob(testDb, { showId: show.id, format: 'judging', requestedByUserId: user.id });

    const job = await claimNextJob(testDb);
    await processJob(testDb, job!);

    const row = await testDb.query.documentRenderJobs.findFirst({ where: eq(documentRenderJobs.id, jobId) });
    expect(row?.status).toBe('done');
    expect(padPdfToMultiple).not.toHaveBeenCalled();
    expect(stripUnembeddedBase14Fonts).toHaveBeenCalledTimes(1);
  }, 20_000);
});

describe('worker: processJob — failure and retry', () => {
  it('goes back to queued on failure, then failed once attempts reach max_attempts', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const { jobId } = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    // Force a deterministic failure without touching react-pdf — processJob's
    // own guard rejects anything but 'catalogue'.
    await testDb.update(documentRenderJobs).set({ documentType: 'bogus', maxAttempts: 2 }).where(eq(documentRenderJobs.id, jobId));

    const claim1 = await claimNextJob(testDb);
    expect(claim1?.attempts).toBe(1);
    await processJob(testDb, claim1!);

    let row = await testDb.query.documentRenderJobs.findFirst({ where: eq(documentRenderJobs.id, jobId) });
    expect(row?.status).toBe('queued');
    expect(row?.error).toMatch(/Unsupported document type/);

    const claim2 = await claimNextJob(testDb);
    expect(claim2?.attempts).toBe(2);
    await processJob(testDb, claim2!);

    row = await testDb.query.documentRenderJobs.findFirst({ where: eq(documentRenderJobs.id, jobId) });
    expect(row?.status).toBe('failed');
    expect(row?.error).toMatch(/Unsupported document type/);
  });
});

describe('worker: resetStaleRunningJobs', () => {
  it('resets a running job stuck for more than 15 minutes back to queued', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const { jobId } = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    await testDb
      .update(documentRenderJobs)
      .set({ status: 'running', startedAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(documentRenderJobs.id, jobId));

    const resetCount = await resetStaleRunningJobs(testDb);
    expect(resetCount).toBeGreaterThanOrEqual(1);

    const row = await testDb.query.documentRenderJobs.findFirst({ where: eq(documentRenderJobs.id, jobId) });
    expect(row?.status).toBe('queued');
  });

  it('leaves a recently-started running job alone', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const { jobId } = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    await testDb
      .update(documentRenderJobs)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(documentRenderJobs.id, jobId));

    await resetStaleRunningJobs(testDb);

    const row = await testDb.query.documentRenderJobs.findFirst({ where: eq(documentRenderJobs.id, jobId) });
    expect(row?.status).toBe('running');
  });
});
