/**
 * Pure unit tests for `runWorkerLoop`'s two run modes (2026-08-27 —
 * document-render-worker.ts's header explains why: prod switches to a
 * Render Cron Job that reinvokes the process every 5 minutes instead of a
 * 24/7 Background Worker). Like document-render-worker-boot.test.ts, this
 * uses a FAKE `db` (`{ execute, update }`, both vi.fn()s) — never the real
 * database — so it never touches `remi_test`.
 *
 * `renderCatalogueFromSnapshot` and the R2 upload helpers are mocked so a
 * claimed job can run through the REAL `processJob`/`claimNextJob` without
 * a genuine catalogue render or network call — only pdf-lib runs for real,
 * building a minimal one-page PDF so `PDFDocument.load()` inside
 * `processJob` has something valid to parse.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Database } from '@/server/db';
import type { RawDocumentRenderJobRow } from '../document-render-worker';
import { runWorkerLoop } from '../document-render-worker';

vi.mock('@/server/services/catalogue-snapshot', () => ({
  renderCatalogueFromSnapshot: vi.fn(async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage();
    return Buffer.from(await doc.save());
  }),
}));

vi.mock('@/server/services/storage', () => ({
  uploadToR2: vi.fn(async () => undefined),
  getPublicUrl: vi.fn((key: string) => `https://public.r2.test/${key}`),
}));

import { renderCatalogueFromSnapshot } from '@/server/services/catalogue-snapshot';
import { uploadToR2 } from '@/server/services/storage';

beforeEach(() => {
  vi.mocked(renderCatalogueFromSnapshot).mockClear();
  vi.mocked(uploadToR2).mockClear();
});

function makeRawJob(overrides: Partial<RawDocumentRenderJobRow> = {}): RawDocumentRenderJobRow {
  return {
    id: 'job-1',
    show_id: 'show-1',
    document_type: 'catalogue',
    format: 'standard',
    status: 'running',
    attempts: 1,
    max_attempts: 3,
    error: null,
    requested_by_user_id: null,
    // The real catalogue-preflight module runs for real here —
    // renderCatalogueFromSnapshot is mocked, but runPreflight() (a plain
    // static import now, not a dynamic-import seam) still calls it for
    // real against the mocked render's output. Give it a minimal-but-shaped
    // meta (empty, but present, arrays) so it exercises its no-entries path
    // instead of throwing on undefined.length — format comes from the job
    // row (`format: 'standard'` above), not from anything in `snapshot`.
    snapshot: { meta: { expectedNumbers: [], entryNames: [] } } as unknown as RawDocumentRenderJobRow['snapshot'],
    snapshot_hash: 'hash-1',
    file_sha256: null,
    storage_key: null,
    page_count: null,
    file_bytes: null,
    preflight: null,
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    finished_at: null,
    ...overrides,
  };
}

/** A fake `db` that supports both the raw `execute()` calls
 *  (waitForJobsTable / resetStaleRunningJobs / claimNextJob) and the
 *  drizzle `update().set().where()` chain `processJob` uses to record a
 *  job's outcome. `execute` behaviour is supplied per-test; `update` just
 *  records what it was asked to set. */
function makeFakeDb(executeImpl: (...args: unknown[]) => unknown) {
  const execute = vi.fn(executeImpl);
  const updateCalls: Record<string, unknown>[] = [];
  const update = vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      updateCalls.push(values);
      return { where: vi.fn(async () => undefined) };
    }),
  }));
  return { db: { execute, update } as unknown as Database, execute, update, updateCalls };
}

describe('runWorkerLoop — drain-and-exit mode', () => {
  it('exitWhenIdle: true — claims and processes every queued job, then returns', async () => {
    const jobA = makeRawJob({ id: 'job-a' });
    const jobB = makeRawJob({ id: 'job-b' });

    const responses: unknown[] = [
      [{ tbl: 'document_render_jobs' }], // waitForJobsTable probe
      [], // resetStaleRunningJobs — nothing stale
      [jobA], // claimNextJob #1
      [jobB], // claimNextJob #2
      [], // claimNextJob #3 — queue drained
    ];
    const { db, execute, updateCalls } = makeFakeDb(async () => responses.shift());

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runWorkerLoop(db, { exitWhenIdle: true, pollIntervalMs: 0 });

    // Exactly 5 execute() calls — no extra polling once the queue drains.
    expect(execute).toHaveBeenCalledTimes(5);

    // Both jobs actually rendered (processJob ran for real against the
    // mocked render/upload path) and were marked done.
    expect(renderCatalogueFromSnapshot).toHaveBeenCalledTimes(2);
    expect(uploadToR2).toHaveBeenCalledTimes(2);
    const doneUpdates = updateCalls.filter((v) => v.status === 'done');
    expect(doneUpdates.length).toBeGreaterThanOrEqual(2);

    expect(logSpy).toHaveBeenCalledWith('[document-render-worker] queue drained — exiting');
    logSpy.mockRestore();
  });

  it('exitWhenIdle unset — keeps polling past an empty queue until the abort signal fires', async () => {
    const controller = new AbortController();
    let callCount = 0;
    let claimCalls = 0;

    const { db, execute } = makeFakeDb(async () => {
      callCount += 1;
      if (callCount === 1) return [{ tbl: 'document_render_jobs' }]; // waitForJobsTable probe
      if (callCount === 2) return []; // resetStaleRunningJobs — nothing stale
      // Every call from here is claimNextJob polling an empty queue.
      claimCalls += 1;
      if (claimCalls === 3) controller.abort();
      return [];
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runWorkerLoop(db, { exitWhenIdle: false, pollIntervalMs: 0, signal: controller.signal });

    // Table probe + reset + (at least) 3 claim polls before the abort took effect.
    expect(execute).toHaveBeenCalledTimes(callCount);
    expect(callCount).toBeGreaterThanOrEqual(5);
    expect(claimCalls).toBeGreaterThanOrEqual(3);
    // Never took the drain-and-exit path.
    expect(logSpy).not.toHaveBeenCalledWith('[document-render-worker] queue drained — exiting');
    expect(logSpy).toHaveBeenCalledWith('[document-render-worker] stopped');
    logSpy.mockRestore();
  });
});
