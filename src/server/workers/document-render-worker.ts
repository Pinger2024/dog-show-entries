/**
 * Background worker for document_render_jobs — runs as a SEPARATE OS
 * process from the web app (see scripts/run-render-worker.ts) so a heavy
 * PDF render that exhausts memory kills the worker, never the process
 * serving exhibitors (2026-08-15 outage: a catalogue render OOM-killed the
 * single prod web instance mid-entries).
 *
 * Claims one queued job at a time via `FOR UPDATE SKIP LOCKED` so multiple
 * worker instances (or a future scale-out) never double-render the same job.
 */
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import type { Database } from '@/server/db';
import * as schema from '@/server/db/schema';
import { uploadToR2, getPublicUrl } from '@/server/services/storage';
import {
  renderCatalogueFromSnapshot,
  type CatalogueSnapshot,
  type CatalogueFormat,
} from '@/server/services/catalogue-snapshot';

const STALE_RUNNING_MINUTES = 15;
const DEFAULT_POLL_INTERVAL_MS = 2000;

/** Raw row shape from the hand-written SQL below — snake_case, as Postgres
 *  returns it, NOT the drizzle-mapped camelCase shape. Claiming via raw SQL
 *  (rather than a drizzle update().returning()) is what makes the
 *  `FOR UPDATE SKIP LOCKED` subquery possible. */
export interface RawDocumentRenderJobRow {
  id: string;
  show_id: string;
  document_type: string;
  format: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error: string | null;
  requested_by_user_id: string | null;
  snapshot: CatalogueSnapshot;
  snapshot_hash: string;
  file_sha256: string | null;
  storage_key: string | null;
  page_count: number | null;
  file_bytes: number | null;
  preflight: unknown;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

/** Reset jobs stuck in 'running' from a worker that crashed or was killed
 *  mid-render — call once at worker start. Returns how many were reset. */
export async function resetStaleRunningJobs(db: Database): Promise<number> {
  const result = await db.execute(sql`
    UPDATE document_render_jobs
    SET status = 'queued'
    WHERE status = 'running'
      AND started_at < now() - make_interval(mins => ${STALE_RUNNING_MINUTES})
    RETURNING id
  `);
  return extractRows<{ id: string }>(result).length;
}

/** Atomically claim the oldest eligible queued job, marking it 'running' and
 *  incrementing its attempt count. Returns null when there's nothing to do. */
export async function claimNextJob(db: Database): Promise<RawDocumentRenderJobRow | null> {
  const result = await db.execute(sql`
    UPDATE document_render_jobs
    SET status = 'running', attempts = attempts + 1, started_at = now()
    WHERE id = (
      SELECT id FROM document_render_jobs
      WHERE status = 'queued' AND attempts < max_attempts
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  const rows = extractRows<RawDocumentRenderJobRow>(result);
  return rows[0] ?? null;
}

// Built as a non-literal string on purpose: another agent is building
// src/lib/catalogue-preflight.ts in a separate worktree, so the module
// doesn't exist in this tree yet. A literal `import('@/lib/catalogue-
// preflight')` fails `tsc --noEmit` with "Cannot find module" even inside a
// try/catch (TS resolves literal specifiers statically); a non-literal
// specifier is resolved only at runtime, so this compiles clean before AND
// after that module lands. Runs as a plain Node script (tsx), never
// webpack-bundled, so there's no bundler cost to this indirection.
const PREFLIGHT_MODULE_SPECIFIER: string = '@/lib/catalogue-preflight';

/** Dynamic-import seam for the preflight module another agent builds
 *  (src/lib/catalogue-preflight.ts) in parallel. No-ops — returns null,
 *  never throws — if the module doesn't exist yet or itself errors, so
 *  landing this worker never depends on that module's timing. */
async function runPreflightIfAvailable(
  job: RawDocumentRenderJobRow,
  buffer: Buffer,
  snapshot: CatalogueSnapshot,
): Promise<unknown> {
  try {
    const mod = (await import(PREFLIGHT_MODULE_SPECIFIER).catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!mod) return null;
    const fn = (mod.runCataloguePreflight ?? mod.runPreflight ?? mod.default) as
      | ((args: { job: RawDocumentRenderJobRow; buffer: Buffer; snapshot: CatalogueSnapshot }) => unknown)
      | undefined;
    if (typeof fn !== 'function') return null;
    return await fn({ job, buffer, snapshot });
  } catch (err) {
    console.error(`[document-render-worker] preflight failed for job ${job.id}:`, err);
    return null;
  }
}

/** Render one claimed job, upload the result, and record the outcome.
 *  Exported (rather than folded into the poll loop) so tests can exercise
 *  the exact render→upload→finalise path without spawning a process. */
export async function processJob(db: Database, job: RawDocumentRenderJobRow): Promise<void> {
  try {
    if (job.document_type !== 'catalogue') {
      throw new Error(`Unsupported document type: ${job.document_type}`);
    }

    const format = job.format as CatalogueFormat;
    const buffer = await renderCatalogueFromSnapshot(job.snapshot, format);

    const storageKey = `document-jobs/${job.show_id}/${job.id}.pdf`;
    await uploadToR2(storageKey, buffer, 'application/pdf');

    const fileSha256 = createHash('sha256').update(buffer).digest('hex');
    // pdf-lib rather than poppler for the page count — poppler may not be
    // present wherever this worker eventually runs in prod.
    const pdfDoc = await PDFDocument.load(buffer);
    const pageCount = pdfDoc.getPageCount();

    const preflight = await runPreflightIfAvailable(job, buffer, job.snapshot);

    await db
      .update(schema.documentRenderJobs)
      .set({
        status: 'done',
        error: null,
        fileSha256,
        storageKey,
        pageCount,
        fileBytes: buffer.byteLength,
        preflight: preflight ?? null,
        finishedAt: new Date(),
      })
      .where(eq(schema.documentRenderJobs.id, job.id));

    // Backfill any print-order item waiting on this job (print-orders.ts
    // enqueues catalogue proofs instead of rendering them synchronously).
    const publicUrl = getPublicUrl(storageKey);
    await db
      .update(schema.printOrderItems)
      .set({ pdfStorageKey: storageKey, pdfPublicUrl: publicUrl, pdfGeneratedAt: new Date() })
      .where(eq(schema.printOrderItems.renderJobId, job.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[document-render-worker] job ${job.id} failed (attempt ${job.attempts}/${job.max_attempts}):`, message);
    const exhausted = job.attempts >= job.max_attempts;
    await db
      .update(schema.documentRenderJobs)
      .set({ status: exhausted ? 'failed' : 'queued', error: message })
      .where(eq(schema.documentRenderJobs.id, job.id));
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Poll-claim-render loop. Runs until `signal` aborts. */
export async function runWorkerLoop(
  db: Database,
  opts: { pollIntervalMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  console.log('[document-render-worker] starting');
  const resetCount = await resetStaleRunningJobs(db);
  if (resetCount > 0) {
    console.log(`[document-render-worker] reset ${resetCount} stale running job(s) back to queued`);
  }

  while (!opts.signal?.aborted) {
    const job = await claimNextJob(db);
    if (!job) {
      await sleep(pollIntervalMs, opts.signal);
      continue;
    }
    console.log(
      `[document-render-worker] claimed job ${job.id} (${job.document_type}/${job.format}, attempt ${job.attempts}/${job.max_attempts})`,
    );
    await processJob(db, job);
  }

  console.log('[document-render-worker] stopped');
}
