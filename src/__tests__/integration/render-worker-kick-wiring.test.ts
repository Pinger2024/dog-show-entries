import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, cleanDb } from '../helpers/db';
import { makeSecretaryWithOrg, makeShow } from '../helpers/factories';
import { documentRenderJobs } from '@/server/db/schema';

/**
 * Proves the ONE call site that should kick the render worker on enqueue:
 * requestCatalogueJob (new job, and dedupe onto an existing QUEUED job), and
 * the one that deliberately never does — refreshCatalogueJobs (the
 * auto-render sweep), which the 5-minute cron tick already covers. See
 * render-worker-kick.ts and catalogue-jobs.ts.
 */
vi.mock('@/server/services/render-worker-kick', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/services/render-worker-kick')>();
  return { ...actual, kickRenderWorker: vi.fn(actual.kickRenderWorker) };
});

import { kickRenderWorker } from '@/server/services/render-worker-kick';
import { requestCatalogueJob, refreshCatalogueJobs } from '@/server/services/catalogue-jobs';

beforeEach(async () => {
  await cleanDb();
  vi.mocked(kickRenderWorker).mockClear();
  vi.mocked(kickRenderWorker).mockResolvedValue({ kicked: false, skipped: 'unconfigured' });
});

async function makeShowWithOrg() {
  const { org } = await makeSecretaryWithOrg();
  return makeShow({ organisationId: org.id, status: 'entries_closed' });
}

describe('requestCatalogueJob kicks the render worker', () => {
  it('kicks once when it inserts a brand-new job', async () => {
    const show = await makeShowWithOrg();
    const result = await requestCatalogueJob(testDb, { showId: show.id, format: 'by-class', requestedByUserId: null });

    expect(result.isNew).toBe(true);
    expect(kickRenderWorker).toHaveBeenCalledTimes(1);
    expect(kickRenderWorker).toHaveBeenCalledWith(testDb, 'catalogue:by-class');
  });

  it('kicks again when it dedupes onto an existing QUEUED job', async () => {
    const show = await makeShowWithOrg();
    await requestCatalogueJob(testDb, { showId: show.id, format: 'by-class', requestedByUserId: null });
    vi.mocked(kickRenderWorker).mockClear();

    const second = await requestCatalogueJob(testDb, { showId: show.id, format: 'by-class', requestedByUserId: null });

    expect(second.isNew).toBe(false);
    expect(kickRenderWorker).toHaveBeenCalledTimes(1);
  });

  it('does not kick when it dedupes onto a DONE job', async () => {
    const show = await makeShowWithOrg();
    const first = await requestCatalogueJob(testDb, { showId: show.id, format: 'by-class', requestedByUserId: null });
    await testDb
      .update(documentRenderJobs)
      .set({ status: 'done', storageKey: `document-jobs/${show.id}/${first.jobId}.pdf` })
      .where(eq(documentRenderJobs.id, first.jobId));
    vi.mocked(kickRenderWorker).mockClear();

    const second = await requestCatalogueJob(testDb, { showId: show.id, format: 'by-class', requestedByUserId: null });

    expect(second.isNew).toBe(false);
    expect(second.status).toBe('done');
    expect(kickRenderWorker).not.toHaveBeenCalled();
  });
});

describe('refreshCatalogueJobs never kicks the render worker', () => {
  it('enqueues formats via requestCatalogueJob without kicking — the cron tick already covers the sweep', async () => {
    const show = await makeShowWithOrg();

    const result = await refreshCatalogueJobs(testDb, show.id, { reason: 'test-sweep' });

    expect(result.enqueued.length).toBeGreaterThan(0);
    expect(kickRenderWorker).not.toHaveBeenCalled();
  });
});
