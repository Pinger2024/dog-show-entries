/**
 * ONE owner for "wake the render worker up now" — see catalogue-jobs.ts's
 * requestCatalogueJob, the only call site that should trigger this.
 *
 * Prod's document-render-worker (src/server/workers/document-render-worker.ts)
 * runs as a Render Cron Job (`remi-render-cron`) firing every 5 minutes —
 * see scripts/run-render-worker.ts / scripts/_provision-render-cron.ts. A
 * catalogue requested just after a tick used to wait up to 5 minutes for a
 * ~17s render (Mandy, 21 Sept 2026: queued 296s/render 17s, queued
 * 234s/render 18s). This kicks the cron job's API the moment a job is
 * enqueued so the render usually starts within seconds, keeping the 5-minute
 * tick only as a safety net (a missed kick, a cold start, a restart).
 *
 * Render's "trigger a cron run" endpoint CANCELS ANY ACTIVE RUN of that cron
 * job — so kicking while the worker is already mid-render would kill that
 * render outright. Three guards make that safe:
 *
 *   1. `worker-active` — if any document_render_jobs row is currently
 *      'running', a worker is alive right now and (per runWorkerLoop's
 *      exitWhenIdle loop) will drain the queue — including the job that was
 *      just enqueued — before it exits. Never cancel a live render to chase
 *      a job it's about to pick up anyway.
 *   2. `debounced` — a kick already sent within the last 60s is left to do
 *      its job; this assumes a single prod web instance (true today — see
 *      CLAUDE.md/Infrastructure). A distributed web tier would need a
 *      DB/Redis-backed debounce instead of this module-level one.
 *   3. `unconfigured` — RENDER_API_KEY / RENDER_RENDER_CRON_ID missing (e.g.
 *      dev, demo, or before Michael sets the prod env vars) makes this a
 *      silent no-op, logged once per process rather than once per call.
 *
 * Never throws — enqueuing a render job must never fail or wait on Render's
 * API. Callers fire this without awaiting it (`void kickRenderWorker(...)`).
 */
import { eq } from 'drizzle-orm';
import type { Database } from '@/server/db';
import * as schema from '@/server/db/schema';

export type RenderWorkerKickSkipReason = 'unconfigured' | 'worker-active' | 'debounced' | 'request-failed';

export interface RenderWorkerKickResult {
  kicked: boolean;
  skipped?: RenderWorkerKickSkipReason;
}

const DEBOUNCE_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;

/** Injectable fetch so tests never hit the real Render API. Defaults to the
 *  global fetch. */
type FetchLike = typeof fetch;
let fetchImpl: FetchLike = fetch;
export function setRenderWorkerKickFetch(impl: FetchLike): void {
  fetchImpl = impl;
}
export function resetRenderWorkerKickFetch(): void {
  fetchImpl = fetch;
}

let lastKickAtMs = 0;
/** Test-only: reset the module-level debounce clock between test cases. */
export function resetRenderWorkerKickDebounce(): void {
  lastKickAtMs = 0;
}

let warnedUnconfigured = false;

function getConfig(): { apiKey: string; cronJobId: string } | null {
  const apiKey = process.env.RENDER_API_KEY;
  const cronJobId = process.env.RENDER_RENDER_CRON_ID;
  if (!apiKey || !cronJobId) {
    if (!warnedUnconfigured) {
      console.log(
        '[render-worker-kick] RENDER_API_KEY / RENDER_RENDER_CRON_ID not set — kick is a no-op (cron tick still covers it every 5 minutes)',
      );
      warnedUnconfigured = true;
    }
    return null;
  }
  return { apiKey, cronJobId };
}

/**
 * Kick the render worker's cron job to run immediately. Safe to call
 * speculatively and often — see the guards above. Never throws.
 */
export async function kickRenderWorker(db: Database, reason: string): Promise<RenderWorkerKickResult> {
  const config = getConfig();
  if (!config) {
    return { kicked: false, skipped: 'unconfigured' };
  }

  const runningJob = await db.query.documentRenderJobs.findFirst({
    where: eq(schema.documentRenderJobs.status, 'running'),
    columns: { id: true },
  });
  if (runningJob) {
    return { kicked: false, skipped: 'worker-active' };
  }

  const now = Date.now();
  if (now - lastKickAtMs < DEBOUNCE_MS) {
    return { kicked: false, skipped: 'debounced' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`https://api.render.com/v1/cron-jobs/${config.cronJobId}/runs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`[render-worker-kick] request failed: HTTP ${response.status} (reason: ${reason})`);
      return { kicked: false, skipped: 'request-failed' };
    }
    lastKickAtMs = now;
    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    console.log(`[render-worker-kick] kicked run ${body?.id ?? '(unknown id)'} (reason: ${reason})`);
    return { kicked: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[render-worker-kick] request failed: ${message} (reason: ${reason})`);
    return { kicked: false, skipped: 'request-failed' };
  } finally {
    clearTimeout(timeout);
  }
}
