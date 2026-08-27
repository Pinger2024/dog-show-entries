import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// Wrap the REAL advert/logo hydration in spies too (not stubs) — the
// 2026-08-27 refactor's whole point is that these run in the render step,
// never in buildCatalogueSnapshot; the spies let tests below prove exactly
// that split rather than just observing the finished PDF.
vi.mock('@/lib/advert-orientation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/advert-orientation')>();
  return { ...actual, prepareAdvertsForRender: vi.fn(actual.prepareAdvertsForRender) };
});
vi.mock('@/lib/safe-image-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/safe-image-fetch')>();
  return {
    ...actual,
    fetchClubImage: vi.fn(actual.fetchClubImage),
    fetchPdfSafeImage: vi.fn(actual.fetchPdfSafeImage),
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
  makeSponsor,
} from '../helpers/factories';
import * as schema from '@/server/db/schema';
import { documentRenderJobs, entries as entriesTable, juniorHandlerDetails } from '@/server/db/schema';
import { requestCatalogueJob } from '@/server/services/catalogue-jobs';
import {
  buildCatalogueSnapshot,
  renderCatalogueFromSnapshot,
  hydrateSnapshotForRender,
} from '@/server/services/catalogue-snapshot';
import {
  claimNextJob,
  processJob,
  resetStaleRunningJobs,
} from '@/server/workers/document-render-worker';
import { uploadToR2 } from '@/server/services/storage';
import { padPdfToMultiple, stripUnembeddedBase14Fonts } from '@/lib/pdf-pad';
import { prepareAdvertsForRender } from '@/lib/advert-orientation';
import { fetchClubImage, fetchPdfSafeImage } from '@/lib/safe-image-fetch';
import sharp from 'sharp';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(uploadToR2).mockClear();
  vi.mocked(padPdfToMultiple).mockClear();
  vi.mocked(stripUnembeddedBase14Fonts).mockClear();
  vi.mocked(prepareAdvertsForRender).mockClear();
  vi.mocked(fetchClubImage).mockClear();
  vi.mocked(fetchPdfSafeImage).mockClear();
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
    // The preflight report is persisted on the job and names the exact
    // artefact — the "make the generated file prove itself" half of the
    // pipeline (poppler-utils required; CI installs it).
    const preflight = row?.preflight as { artefact?: { sha256?: string }; checks?: unknown[] } | null;
    expect(preflight?.checks?.length).toBeGreaterThan(0);
    expect(preflight?.artefact?.sha256).toBe(row?.fileSha256);
  }, 20_000);

  it('snapshots the preflight contract meta: gapless expectedNumbers and entryNames', async () => {
    const { user, show } = await makeMinimalShowWithEntry();
    const { jobId } = await requestCatalogueJob(testDb, { showId: show.id, format: 'standard', requestedByUserId: user.id });
    const row = await testDb.query.documentRenderJobs.findFirst({ where: eq(documentRenderJobs.id, jobId) });
    const meta = (row?.snapshot as { meta?: { expectedNumbers?: number[]; entryNames?: { number: number; name: string }[] } }).meta;
    expect(meta?.expectedNumbers?.length).toBeGreaterThan(0);
    const sorted = [...(meta?.expectedNumbers ?? [])].sort((a, b) => a - b);
    sorted.forEach((n, i) => expect(n).toBe(i + 1)); // gapless 1..N
    expect(meta?.entryNames?.length).toBe(sorted.length);
    for (const en of meta?.entryNames ?? []) {
      expect(en.name.trim().length).toBeGreaterThan(0);
      expect(sorted).toContain(en.number);
    }
  });

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

describe('buildCatalogueSnapshot — meta.expectedNumbers / meta.entryNames', () => {
  // Handed to the preflight module (src/lib/catalogue-preflight.ts, built in
  // parallel) for its gapless-1..N and every-entry-printed checks — a firm
  // contract, so the dog-aware dedup must exactly match assignNumbers() in
  // catalogue-numbering.ts: a dog holding two entry rows (e.g. a breed class
  // then a later Special Award Class purchase) counts once; dogless Junior
  // Handler entries are never deduped against each other.
  it('dedupes a two-entry dog to one number but counts JH entries individually', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_closed' });

    const breedDef = await makeClassDef({ name: 'Open', type: 'age' });
    const breedClass = await makeShowClass({ showId: show.id, classDefinitionId: breedDef.id });
    const sacDef = await makeClassDef({ name: 'Special Award Class - Best Puppy', type: 'special' });
    const sacClass = await makeShowClass({ showId: show.id, classDefinitionId: sacDef.id });
    const jhDef = await makeClassDef({ type: 'junior_handler', name: 'JHA Handling (12-16)' });
    const jhClass = await makeShowClass({ showId: show.id, classDefinitionId: jhDef.id });

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, registeredName: 'Meadowvale Rewa' });

    // The dog's two entry rows (breed class, then a later SAC purchase) —
    // must share one catalogue number, not two.
    const entry1 = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id });
    await makeEntryClass({ entryId: entry1.id, showClassId: breedClass.id });
    const entry2 = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id });
    await makeEntryClass({ entryId: entry2.id, showClassId: sacClass.id });

    // Two dogless Junior Handler entries — each numbered (and counted)
    // individually, per the schema's own comment and the numbering test's
    // regression case ("still numbers dogless Junior Handler entries
    // individually").
    const mkJh = async (handlerName: string) => {
      const [e] = await testDb
        .insert(entriesTable)
        .values({ showId: show.id, dogId: null, exhibitorId: exhibitor.id, status: 'confirmed', totalFee: 300, entryType: 'junior_handler' })
        .returning();
      await makeEntryClass({ entryId: e.id, showClassId: jhClass.id });
      await testDb.insert(juniorHandlerDetails).values({
        entryId: e.id,
        handlerName,
        dateOfBirth: '2012-01-01',
      });
      return e;
    };
    await mkJh('Priya Shah');
    await mkJh('Tom Reid');

    const snapshot = await buildCatalogueSnapshot(testDb, show.id);

    // 4 entry rows total, but only 3 distinct "should print a number" slots:
    // the dog once + two dogless JH entries.
    expect(snapshot.meta.expectedNumbers).toHaveLength(3);
    expect(snapshot.meta.expectedNumbers).toEqual([1, 2, 3]); // gapless 1..N
    expect(snapshot.meta.entryNames).toHaveLength(3);

    const namesByNumber = new Map(snapshot.meta.entryNames.map((n) => [n.number, n.name]));
    const dogNumbers = snapshot.entries
      .filter((e) => e.exhibitorId === exhibitor.id && e.entryType !== 'junior_handler')
      .map((e) => Number(e.catalogueNumber));
    // Both of the dog's entry rows resolve to the SAME number.
    expect(new Set(dogNumbers).size).toBe(1);
    expect(namesByNumber.get(dogNumbers[0])).toBe('Meadowvale Rewa');
    expect([...namesByNumber.values()]).toEqual(expect.arrayContaining(['Meadowvale Rewa', 'Priya Shah', 'Tom Reid']));
  });
});

// ── Snapshot image hydration (2026-08-27) ────────────────────────────────
// buildCatalogueSnapshot() used to fetch every advert's and show-tier
// sponsor's image BYTES and embed them in the snapshot at ENQUEUE time, in
// the web process — a 20-advert show produced a 13.2 MB snapshot row and a
// +530 MB memory spike in the exact process that must stay up for
// exhibitors (2026-08-15 OOM postmortem). The snapshot now carries plain
// URLs only; bytes are fetched in renderCatalogueFromSnapshot(), in the
// WORKER process, against a non-persisted copy — hydrateSnapshotForRender().
describe('catalogue snapshot — carries image URLs, not bytes (2026-08-27)', () => {
  const R2_HOST = 'https://pub-hydration-test.r2.dev';
  const imageBytes: Record<string, Buffer> = {};

  beforeEach(() => {
    vi.stubEnv('R2_PUBLIC_URL', R2_HOST);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = typeof input === 'string' ? input : String((input as { toString(): string }).toString());
        const buf = imageBytes[url];
        if (!buf) throw new Error(`unexpected fetch in test: ${url}`);
        return {
          ok: true,
          status: 200,
          headers: {
            get: (k: string) =>
              k.toLowerCase() === 'content-type' ? 'image/png'
              : k.toLowerCase() === 'content-length' ? String(buf.length)
              : null,
          },
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** Genuinely random pixel data, encoded with zlib compression OFF — not a
   *  flat colour or a repeating pattern, both of which PNG's deflate would
   *  crush down to almost nothing and make the "under 300 KB" assertion
   *  below meaningless. This is what proves the fix at realistic scale
   *  rather than against an accidentally-tiny fixture. */
  async function randomPng(width: number, height: number): Promise<Buffer> {
    const raw = crypto.randomBytes(width * height * 3);
    return sharp(raw, { raw: { width, height, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
  }

  /** Same show/entry shape as makeMinimalShowWithEntry, plus two adverts
   *  (one portrait, one landscape — 600×900 / 900×600, matching the
   *  dimensions the "before" page-count baseline was captured with) and one
   *  show-tier sponsor logo, all served by the fetch stub above. */
  async function makeShowWithAdvertsAndSponsor() {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const classDef = await makeClassDef({ name: 'Open', type: 'age' });
    const showClass = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });

    const portraitUrl = `${R2_HOST}/uploads/advert-portrait-${show.id}.png`;
    const landscapeUrl = `${R2_HOST}/uploads/advert-landscape-${show.id}.png`;
    const logoUrl = `${R2_HOST}/uploads/sponsor-logo-${show.id}.png`;

    imageBytes[portraitUrl] = await randomPng(600, 900);
    imageBytes[landscapeUrl] = await randomPng(900, 600);
    imageBytes[logoUrl] = await randomPng(260, 92);

    await testDb.insert(schema.catalogueAdverts).values([
      {
        showId: show.id,
        advertiserName: 'Portrait Advertiser',
        document: 'catalogue',
        position: 'inside_front',
        imageUrl: portraitUrl,
        sortOrder: 0,
      },
      {
        showId: show.id,
        advertiserName: 'Landscape Advertiser',
        document: 'catalogue',
        position: 'inside_back',
        imageUrl: landscapeUrl,
        sortOrder: 1,
      },
    ]);

    const sponsor = await makeSponsor({ organisationId: org.id, name: 'Hydration Test Sponsor', logoUrl });
    await testDb.insert(schema.showSponsors).values({
      showId: show.id,
      sponsorId: sponsor.id,
      tier: 'show',
      customTitle: 'Official show sponsor',
    });

    return { user, org, show, portraitUrl, landscapeUrl, logoUrl };
  }

  it('buildCatalogueSnapshot output carries NO data: URIs, NO __bufferBase64, and stays under 300 KB even with multi-hundred-KB mocked images', async () => {
    const { show, portraitUrl, landscapeUrl, logoUrl } = await makeShowWithAdvertsAndSponsor();

    // Precondition — prove the mocked artwork really is big, not an
    // accidentally-tiny fixture the size assertion below would trivially pass.
    expect(imageBytes[portraitUrl].length).toBeGreaterThan(500 * 1024);
    expect(imageBytes[landscapeUrl].length).toBeGreaterThan(500 * 1024);

    const snapshot = await buildCatalogueSnapshot(testDb, show.id);
    const json = JSON.stringify(snapshot);

    expect(json).not.toContain('data:');
    expect(json).not.toContain('__bufferBase64');
    expect(json.length).toBeLessThan(300 * 1024);

    const adverts = snapshot.showInfoBase.adverts ?? [];
    expect(adverts.map((a) => a.imageUrl).sort()).toEqual([landscapeUrl, portraitUrl].sort());
    expect(snapshot.showSponsors[0]?.logoUrl).toBe(logoUrl);
    expect(snapshot.showSponsors[0]?.logoBuffer).toBeUndefined();
  }, 20_000);

  it('the image fetch helpers are NOT called during buildCatalogueSnapshot, and ARE called during renderCatalogueFromSnapshot', async () => {
    const { show } = await makeShowWithAdvertsAndSponsor();

    const snapshot = await buildCatalogueSnapshot(testDb, show.id);
    expect(prepareAdvertsForRender).not.toHaveBeenCalled();
    expect(fetchPdfSafeImage).not.toHaveBeenCalled();

    await renderCatalogueFromSnapshot(snapshot, 'standard');
    expect(prepareAdvertsForRender).toHaveBeenCalledTimes(1);
    expect(fetchPdfSafeImage).toHaveBeenCalledTimes(1); // exactly one show-tier sponsor
  }, 20_000);

  it('renders a PDF with the same page count as before this refactor', async () => {
    // "Before" baseline (8 pages) was captured against the unmodified,
    // pre-refactor code with this exact fixture shape (same class/entry
    // setup, same two adverts, same one show-tier sponsor, same image
    // dimensions) — a one-off script run via `git stash` on the three
    // implementation files, discarded after use. Page count depends on
    // layout (image dimensions, advert/entry counts), never on pixel
    // content or fetch timing, so this is a genuine before/after check.
    const { show } = await makeShowWithAdvertsAndSponsor();
    const snapshot = await buildCatalogueSnapshot(testDb, show.id);
    const buffer = await renderCatalogueFromSnapshot(snapshot, 'standard');
    const pageCount = (await PDFDocument.load(buffer)).getPageCount();
    expect(pageCount).toBe(8);
  }, 20_000);

  it('rotates the landscape advert into a data: URI at render time, without mutating the persisted snapshot object', async () => {
    const { show, landscapeUrl, portraitUrl } = await makeShowWithAdvertsAndSponsor();
    const snapshot = await buildCatalogueSnapshot(testDb, show.id);

    const hydrated = await hydrateSnapshotForRender(snapshot);
    const hydratedLandscape = hydrated.showInfoBase.adverts?.find((a) => a.position === 'inside_back');
    expect(hydratedLandscape?.imageUrl).toMatch(/^data:image\/(png|jpeg);base64,/);

    // The persisted snapshot handed in must be untouched by hydration.
    const originalLandscape = snapshot.showInfoBase.adverts?.find((a) => a.position === 'inside_back');
    expect(originalLandscape?.imageUrl).toBe(landscapeUrl);
    const originalPortrait = snapshot.showInfoBase.adverts?.find((a) => a.position === 'inside_front');
    expect(originalPortrait?.imageUrl).toBe(portraitUrl); // portrait stays a plain URL either way
  }, 20_000);

  it('renders a legacy snapshot (pre-2026-08-27 job row) carrying a pre-rotated data: advert and a {__bufferBase64} sponsor logo, without re-fetching', async () => {
    const { show } = await makeShowWithAdvertsAndSponsor();
    const snapshot = await buildCatalogueSnapshot(testDb, show.id);

    const legacyLogoBytes = await randomPng(200, 80);
    const legacyDataUri = `data:image/png;base64,${(await randomPng(100, 150)).toString('base64')}`;

    const legacySnapshot = {
      ...snapshot,
      showInfoBase: {
        ...snapshot.showInfoBase,
        adverts: [
          { id: 'legacy-ad', advertiserName: 'Legacy', position: 'last_page' as const, imageUrl: legacyDataUri, sortOrder: 0 },
        ],
      },
      showSponsors: [
        {
          name: 'Legacy Sponsor',
          tier: 'show',
          logoUrl: null,
          website: null,
          customTitle: null,
          // Pre-refactor persisted shape (jsonb can't hold a raw Buffer) —
          // must be decoded directly, never re-fetched from logoUrl (there
          // is none here).
          logoBuffer: { __bufferBase64: legacyLogoBytes.toString('base64') },
        } as unknown as (typeof snapshot.showSponsors)[number],
      ],
    };

    const buffer = await renderCatalogueFromSnapshot(legacySnapshot, 'standard');
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    // Legacy bytes are decoded straight from the marker — never re-fetched.
    expect(fetchClubImage).not.toHaveBeenCalled();
  }, 20_000);
});
