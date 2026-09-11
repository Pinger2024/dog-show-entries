/**
 * Pure unit tests for the worker's boot-time wait on `document_render_jobs`
 * existing. Uses a FAKE `db` (just `{ execute: vi.fn() }`), never the real
 * database — this is not an integration test and must not touch
 * `remi_test`. See document-render-worker.ts for why the wait exists: the
 * worker can start before the web process's startup migrations
 * (src/instrumentation.ts) have created the table on first deploy.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@/server/db';
import { waitForJobsTable } from '../document-render-worker';

describe('waitForJobsTable', () => {
  it('polls until the table exists, then resolves', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ tbl: null }])
      .mockResolvedValueOnce([{ tbl: 'document_render_jobs' }]);
    const db = { execute } as unknown as Database;

    await waitForJobsTable(db, { pollIntervalMs: 0 });

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('returns early without probing when the signal is already aborted', async () => {
    const execute = vi.fn().mockResolvedValue([{ tbl: null }]);
    const db = { execute } as unknown as Database;
    const controller = new AbortController();
    controller.abort();

    await waitForJobsTable(db, { pollIntervalMs: 0, signal: controller.signal });

    expect(execute).not.toHaveBeenCalled();
  });
});
