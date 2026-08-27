import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrg, makeShow } from '../helpers/factories';
import { documentRenderJobs } from '@/server/db/schema';
import { requestCatalogueJob } from '@/server/services/catalogue-jobs';
import { GET as cronGET } from '@/app/api/cron/route';

/**
 * "Materialise at write time" — after a show closes (or its catalogue-
 * visible data changes post-close), the catalogue re-renders in the
 * background so the secretary's View button finds a `done` job instead of
 * waiting out a cold render. These tests cover the write-side hooks
 * (shows.update, catalogue adverts, the cron sweep) and the
 * error-swallowing contract of the fire-and-forget wrapper.
 *
 * The hooks never await their background refresh (scheduleCatalogueRefresh
 * is deliberately fire-and-forget so a broken render can't fail a
 * secretary's save) — so these tests poll for the job rows to appear
 * rather than asserting immediately after the mutation resolves.
 */

// buildCatalogueSnapshot is wrapped (not replaced) so most tests exercise the
// real build; individual tests override behaviour with
// mockRejectedValueOnce/mockImplementation to prove the error-swallowing and
// per-show-isolation contracts.
vi.mock('@/server/services/catalogue-snapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/services/catalogue-snapshot')>();
  return {
    ...actual,
    buildCatalogueSnapshot: vi.fn(actual.buildCatalogueSnapshot),
  };
});

import { buildCatalogueSnapshot } from '@/server/services/catalogue-snapshot';

async function jobsFor(showId: string) {
  return testDb.query.documentRenderJobs.findMany({
    where: eq(documentRenderJobs.showId, showId),
  });
}

/** Polls a condition until it's true — the hooks under test are
 *  fire-and-forget, so there's no promise to await from the caller's side. */
async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 3000, intervalMs = 20) {
  const start = Date.now();
  for (;;) {
    if (await predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition not met within timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Settle time for background work that we expect NOT to happen — a fixed
 *  wait is the only option for proving a negative. */
async function settle(ms = 150) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// The real implementation, captured once so every test can reset the mock
// back to "just call through" — tests that override it (mockRejectedValueOnce
// / mockImplementation for a specific showId) must not leak that override
// into later tests.
let realBuildCatalogueSnapshot: typeof import('@/server/services/catalogue-snapshot')['buildCatalogueSnapshot'];

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@/server/services/catalogue-snapshot')>(
    '@/server/services/catalogue-snapshot',
  );
  realBuildCatalogueSnapshot = actual.buildCatalogueSnapshot;
});

beforeEach(() => {
  vi.mocked(buildCatalogueSnapshot).mockReset();
  vi.mocked(buildCatalogueSnapshot).mockImplementation(realBuildCatalogueSnapshot);
});

describe('shows.update — catalogue refresh on close', () => {
  it('closing an RKC show enqueues one queued job per Documents-page format (standard, by-class, judging)', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open', showRuleset: 'rkc' });
    const caller = createTestCaller(user);

    await caller.shows.update({ id: show.id, status: 'entries_closed' });

    await waitFor(async () => (await jobsFor(show.id)).length >= 3);
    const jobs = await jobsFor(show.id);
    expect(jobs.map((j) => j.format).sort()).toEqual(['by-class', 'judging', 'standard']);
    for (const job of jobs) {
      expect(job.status).toBe('queued');
      expect(job.documentType).toBe('catalogue');
      expect(job.requestedByUserId).toBeNull();
    }
  });

  it('closing a WUSV show enqueues only the by-class job', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open', showRuleset: 'wusv' });
    const caller = createTestCaller(user);

    await caller.shows.update({ id: show.id, status: 'entries_closed' });

    await waitFor(async () => (await jobsFor(show.id)).length >= 1);
    await settle();
    const jobs = await jobsFor(show.id);
    expect(jobs.map((j) => j.format)).toEqual(['by-class']);
  });

  it('an unrelated field change on an entries_open show does not enqueue a render', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open', showRuleset: 'rkc' });
    const caller = createTestCaller(user);

    await caller.shows.update({ id: show.id, name: 'Renamed While Still Open' });

    await settle();
    expect(await jobsFor(show.id)).toHaveLength(0);
  });

  it('changing a catalogue-visible field (name) on an already-closed show enqueues a fresh render', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_closed', showRuleset: 'wusv' });
    const caller = createTestCaller(user);

    await caller.shows.update({ id: show.id, name: 'Renamed After Close' });

    await waitFor(async () => (await jobsFor(show.id)).length >= 1);
    const jobs = await jobsFor(show.id);
    expect(jobs.map((j) => j.format)).toEqual(['by-class']);
  });
});

describe('secretary.upsertCatalogueAdvert / deleteCatalogueAdvert — catalogue refresh', () => {
  it('advert upsert on an entries_open show enqueues nothing', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open', showRuleset: 'rkc' });
    const caller = createTestCaller(user);

    await caller.secretary.upsertCatalogueAdvert({ showId: show.id, advertiserName: 'Acme Kibble' });

    await settle();
    expect(await jobsFor(show.id)).toHaveLength(0);
  });

  it('advert upsert on a closed show enqueues a job per auto format; changing its content enqueues a NEW job (hash differs); an identical re-save dedupes (no new job)', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_closed', showRuleset: 'wusv' });
    const caller = createTestCaller(user);

    const advert = await caller.secretary.upsertCatalogueAdvert({
      showId: show.id,
      advertiserName: 'Acme Kibble',
      sortOrder: 0,
    });
    await waitFor(async () => (await jobsFor(show.id)).length >= 1);
    const firstJobs = await jobsFor(show.id);
    expect(firstJobs).toHaveLength(1);
    const firstHash = firstJobs[0]!.snapshotHash;

    // Change the advert's content — the snapshot hash must change, so a
    // second, distinct job is enqueued (the first job is left alone).
    await caller.secretary.upsertCatalogueAdvert({
      id: advert.id,
      showId: show.id,
      advertiserName: 'Beta Bones',
      sortOrder: 0,
    });
    await waitFor(async () => {
      const jobs = await jobsFor(show.id);
      return jobs.some((j) => j.snapshotHash !== firstHash);
    });
    const secondJobs = await jobsFor(show.id);
    expect(secondJobs).toHaveLength(2);
    const secondHash = secondJobs.find((j) => j.snapshotHash !== firstHash)!.snapshotHash;

    // Re-save with IDENTICAL content — same snapshot hash as the last save,
    // so requestCatalogueJob dedupes onto the existing job. No third row.
    await caller.secretary.upsertCatalogueAdvert({
      id: advert.id,
      showId: show.id,
      advertiserName: 'Beta Bones',
      sortOrder: 0,
    });
    await settle();
    const thirdJobs = await jobsFor(show.id);
    expect(thirdJobs).toHaveLength(2);
    expect(thirdJobs.map((j) => j.snapshotHash).sort()).toEqual([firstHash, secondHash].sort());
  });

  it('deleting an advert on a closed show enqueues a fresh render', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_closed', showRuleset: 'wusv' });
    const caller = createTestCaller(user);

    const advert = await caller.secretary.upsertCatalogueAdvert({ showId: show.id, advertiserName: 'Acme Kibble' });
    await waitFor(async () => (await jobsFor(show.id)).length >= 1);
    const firstHash = (await jobsFor(show.id))[0]!.snapshotHash;

    await caller.secretary.deleteCatalogueAdvert({ id: advert.id, showId: show.id });
    await waitFor(async () => (await jobsFor(show.id)).some((j) => j.snapshotHash !== firstHash));
    expect(await jobsFor(show.id)).toHaveLength(2);
  });
});

describe('scheduleCatalogueRefresh — error swallowing', () => {
  it('a thrown buildCatalogueSnapshot error is swallowed — the calling mutation still succeeds', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_closed', showRuleset: 'wusv' });
    const caller = createTestCaller(user);

    vi.mocked(buildCatalogueSnapshot).mockRejectedValue(new Error('boom — snapshot build failed'));

    const result = await caller.secretary.upsertCatalogueAdvert({ showId: show.id, advertiserName: 'Acme Kibble' });
    expect(result.id).toBeTruthy();

    // Prove the background refresh actually ran (and hit the mocked
    // failure) rather than the assertion above passing vacuously because
    // the hook was never wired up.
    await waitFor(() => vi.mocked(buildCatalogueSnapshot).mock.calls.length > 0);
    expect(await jobsFor(show.id)).toHaveLength(0);
  });
});

describe('cron sweep — hourly catalogue refresh', () => {
  const FROZEN_NOW = '2026-06-15T10:00:00.000Z';
  const NEAR_FUTURE = '2026-06-20';

  process.env.CRON_SECRET = 'test-cron-secret';
  const cronReq = () => new Request('http://localhost/api/cron?secret=test-cron-secret');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(FROZEN_NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('an unchanged closed show is deduped (no new job); a stale hash gets a fresh job; a completed show is ignored; one show failing does not block another', async () => {
    const { org } = await makeSecretaryWithOrg();

    // Show A: already has a DONE job matching the CURRENT snapshot hash —
    // the sweep must find nothing new to do.
    const showA = await makeShow({
      organisationId: org.id,
      status: 'entries_closed',
      showRuleset: 'wusv',
      startDate: NEAR_FUTURE,
      endDate: NEAR_FUTURE,
    });
    const { jobId: doneJobId } = await requestCatalogueJob(testDb, {
      showId: showA.id,
      format: 'by-class',
      requestedByUserId: null,
    });
    await testDb.update(documentRenderJobs).set({ status: 'done' }).where(eq(documentRenderJobs.id, doneJobId));

    // Show B: has a job row, but with a STALE hash (data has drifted since
    // it was rendered) — the sweep must enqueue a fresh one.
    const showB = await makeShow({
      organisationId: org.id,
      status: 'entries_closed',
      showRuleset: 'wusv',
      startDate: NEAR_FUTURE,
      endDate: NEAR_FUTURE,
    });
    await testDb.insert(documentRenderJobs).values({
      showId: showB.id,
      documentType: 'catalogue',
      format: 'by-class',
      status: 'done',
      snapshot: { stale: true },
      snapshotHash: 'stale-hash-does-not-match-current-data',
    });

    // Show C: completed — must be ignored entirely by the sweep.
    const showC = await makeShow({
      organisationId: org.id,
      status: 'completed',
      showRuleset: 'wusv',
      startDate: NEAR_FUTURE,
      endDate: NEAR_FUTURE,
    });

    // Show D: sweep hits a hard failure building its snapshot — must not
    // stop show B's (or any other show's) refresh from happening.
    const showD = await makeShow({
      organisationId: org.id,
      status: 'entries_closed',
      showRuleset: 'wusv',
      startDate: NEAR_FUTURE,
      endDate: NEAR_FUTURE,
    });

    const actualSnapshot = await vi.importActual<typeof import('@/server/services/catalogue-snapshot')>(
      '@/server/services/catalogue-snapshot',
    );
    vi.mocked(buildCatalogueSnapshot).mockImplementation(async (db, showId: string) => {
      if (showId === showD.id) throw new Error('boom — show D snapshot build failed');
      return actualSnapshot.buildCatalogueSnapshot(db, showId);
    });

    const res = await cronGET(cronReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Show A: still exactly the one done job — deduped, nothing new.
    const jobsA = await jobsFor(showA.id);
    expect(jobsA).toHaveLength(1);
    expect(jobsA[0]!.id).toBe(doneJobId);

    // Show B: the stale row is untouched, plus one fresh queued job with a
    // different hash.
    const jobsB = await jobsFor(showB.id);
    expect(jobsB).toHaveLength(2);
    const freshB = jobsB.find((j) => j.snapshotHash !== 'stale-hash-does-not-match-current-data');
    expect(freshB).toBeTruthy();
    expect(freshB!.status).toBe('queued');

    // Show C: completed shows are never touched by the sweep.
    expect(await jobsFor(showC.id)).toHaveLength(0);

    // Show D: the mocked failure means no job was created for it, but the
    // sweep as a whole still succeeded and covered every other show — the
    // failure was recorded, not left silent.
    expect(await jobsFor(showD.id)).toHaveLength(0);
    expect(body.catalogueRefreshErrors).toContain(showD.id);
    // Show C (completed) is filtered out of the sweep query entirely —
    // only A, B, D (all entries_closed) are checked.
    expect(body.catalogueRefreshChecked).toBe(3);
  });

  it('a show outside the sweep window (start date far in the future) is not touched', async () => {
    const { org } = await makeSecretaryWithOrg();
    const farFutureShow = await makeShow({
      organisationId: org.id,
      status: 'entries_closed',
      showRuleset: 'wusv',
      startDate: '2027-01-01',
      endDate: '2027-01-01',
    });

    await cronGET(cronReq());

    expect(await jobsFor(farFutureShow.id)).toHaveLength(0);
  });
});
