/**
 * Shared enqueue/status logic for catalogue render jobs — used by the
 * documentJobs.request/status tRPC procedures, the /api/catalogue route's
 * enqueue branch, and print-orders' catalogue proof generation, so all
 * three call sites dedupe onto exactly the same jobs.
 *
 * Rendering itself happens out-of-process — see
 * src/server/workers/document-render-worker.ts.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { DocumentRenderJobStatus } from '@/server/db/schema';
import { isShowDayReached } from '@/lib/date-utils';
import { sanitizeFilename } from '@/lib/slugify';
import { generatePresignedGetUrl } from '@/server/services/storage';
import {
  buildCatalogueSnapshot,
  computeSnapshotHash,
  CATALOGUE_FORMATS,
  CATALOGUE_FORMAT_LABELS,
  type CatalogueFormat,
} from '@/server/services/catalogue-snapshot';

export function isCatalogueFormat(value: string): value is CatalogueFormat {
  return (CATALOGUE_FORMATS as readonly string[]).includes(value);
}

/** Catalogues are released to exhibitors on the morning of the show
 *  (Amanda 2026-05-28) — secretaries/admins get pre-show access for
 *  proofing and printing. Mirrors the check that used to live inline in
 *  the /api/catalogue route so a tRPC caller gets the identical gate. */
export function catalogueShowDayGate(
  isExhibitorAccess: boolean,
  show: { startDate: string },
): { blocked: true; message: string; availableFrom: string } | { blocked: false } {
  if (isExhibitorAccess && !isShowDayReached(show.startDate)) {
    return {
      blocked: true,
      message: "Your catalogue will be ready on the morning of the show. We'll email you a link as soon as it's live.",
      availableFrom: show.startDate,
    };
  }
  return { blocked: false };
}

const LIVE_STATUSES: DocumentRenderJobStatus[] = ['queued', 'running', 'done'];

export interface RequestCatalogueJobResult {
  jobId: string;
  status: DocumentRenderJobStatus;
  /** True when this call inserted a brand-new row; false when it deduped
   *  onto an existing queued/running/done job for the same snapshot hash.
   *  Additive field — existing callers that only read jobId/status are
   *  unaffected. Used by refreshCatalogueJobs to report enqueued vs deduped. */
  isNew: boolean;
}

/**
 * Enqueue a catalogue render job, deduping onto an existing queued/running/done
 * job for the same (show, format, snapshot-of-current-data). A FAILED job is
 * deliberately excluded from the dedupe match — retrying after a failure must
 * always enqueue a fresh attempt, never keep handing back the dead one.
 */
export async function requestCatalogueJob(
  db: Database,
  opts: { showId: string; format: CatalogueFormat; requestedByUserId: string | null },
): Promise<RequestCatalogueJobResult> {
  const snapshot = await buildCatalogueSnapshot(db, opts.showId);
  const snapshotHash = computeSnapshotHash(snapshot);

  const existing = await db.query.documentRenderJobs.findFirst({
    where: and(
      eq(schema.documentRenderJobs.showId, opts.showId),
      eq(schema.documentRenderJobs.documentType, 'catalogue'),
      eq(schema.documentRenderJobs.format, opts.format),
      eq(schema.documentRenderJobs.snapshotHash, snapshotHash),
      inArray(schema.documentRenderJobs.status, LIVE_STATUSES),
    ),
    orderBy: [desc(schema.documentRenderJobs.createdAt)],
  });
  if (existing) {
    return { jobId: existing.id, status: existing.status as DocumentRenderJobStatus, isNew: false };
  }

  const [row] = await db
    .insert(schema.documentRenderJobs)
    .values({
      showId: opts.showId,
      documentType: 'catalogue',
      format: opts.format,
      status: 'queued',
      requestedByUserId: opts.requestedByUserId,
      snapshot,
      snapshotHash,
    })
    .returning({ id: schema.documentRenderJobs.id });

  return { jobId: row.id, status: 'queued', isNew: true };
}

/** Statuses a catalogue is auto-rendered for. Mirrors the show lifecycle
 *  window where the secretary is actively proofing/printing: numbers lock
 *  at entries_closed (see catalogue-numbering.ts) and stay live through
 *  in_progress (show day corrections); completed shows are done with —
 *  only the post-results 'marked'/'absentees' documents matter there, and
 *  those are never auto-rendered (see autoRenderFormatsFor). */
const AUTO_RENDER_STATUSES: readonly string[] = ['entries_closed', 'in_progress'];

/**
 * The exact catalogue formats a secretary can View from the Documents page
 * for this show's ruleset — deliberately mirrors that list so auto-render
 * never produces a job nobody asked for. Excludes 'marked' and 'absentees':
 * both are post-results documents (Documents page renders them under
 * "After the Show") and must never render ahead of results being published.
 *
 * RKC shows offer By Class + Standard + Steward
 * (documents/page.tsx:380-410, gated 'catalogue-standard'/'catalogue-steward'
 * via document-eligibility.ts). WUSV/SV shows only ever offer By Class —
 * document-eligibility.ts's RKC_ONLY_ROWS hides Standard/Steward for them,
 * and catalogue-snapshot.ts:704-705 collapses standard/judging/absentees
 * onto 'by-class' at render time regardless of what's requested.
 */
export function autoRenderFormatsFor(show: { showRuleset: string | null }): CatalogueFormat[] {
  if (show.showRuleset === 'wusv') return ['by-class'];
  return ['standard', 'by-class', 'judging'];
}

export interface RefreshCatalogueJobsResult {
  /** Set (and enqueued/deduped left empty) when the show doesn't qualify
   *  for auto-render right now — wrong status, or the id doesn't resolve. */
  skipped?: 'status' | 'not_found';
  enqueued: CatalogueFormat[];
  deduped: CatalogueFormat[];
  errors: Array<{ format: CatalogueFormat; error: string }>;
}

/**
 * Re-render every auto-render catalogue format for a show whose
 * catalogue-visible data just changed — "materialise at write time" so the
 * secretary's View button finds a `done` job instead of waiting out a cold
 * render. Safe (and cheap) to call speculatively: requestCatalogueJob
 * dedupes on (show, format, snapshot hash), so a show whose data hasn't
 * actually changed since its last render enqueues nothing — every hook
 * below, plus the hourly sweep, only ever pays for a render when something
 * real changed.
 *
 * One format's failure (e.g. a snapshot-build error) never stops the rest —
 * each is requested independently and failures are collected, not thrown.
 */
export async function refreshCatalogueJobs(
  db: Database,
  showId: string,
  opts: { reason: string },
): Promise<RefreshCatalogueJobsResult> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    columns: { id: true, status: true, showRuleset: true },
  });
  if (!show) {
    return { skipped: 'not_found', enqueued: [], deduped: [], errors: [] };
  }
  if (!AUTO_RENDER_STATUSES.includes(show.status)) {
    return { skipped: 'status', enqueued: [], deduped: [], errors: [] };
  }

  const enqueued: CatalogueFormat[] = [];
  const deduped: CatalogueFormat[] = [];
  const errors: Array<{ format: CatalogueFormat; error: string }> = [];

  for (const format of autoRenderFormatsFor(show)) {
    try {
      const result = await requestCatalogueJob(db, { showId, format, requestedByUserId: null });
      (result.isNew ? enqueued : deduped).push(format);
    } catch (err) {
      errors.push({ format, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (errors.length > 0) {
    console.error(`[catalogue-refresh] show ${showId} (${opts.reason}): ${errors.length} format(s) failed`, errors);
  }

  return { enqueued, deduped, errors };
}

/**
 * Fire-and-forget entry point for mutation call sites. A broken or slow
 * render must never fail — or delay — a secretary's save, so this kicks off
 * refreshCatalogueJobs and does not return its promise to be awaited; the
 * caller invokes it (without `await`) as the very last thing after its own
 * DB work has committed, never from inside a transaction. buildCatalogueSnapshot
 * queries the DB itself (and today also fetches advert images — heavy, see
 * catalogue-snapshot.ts), so starting it inside the caller's own transaction
 * would hold that transaction's connection/locks open for the whole render.
 *
 * `db` is threaded through explicitly (rather than importing the module
 * singleton) so every call site — router mutations, the cron sweep, and
 * tests — passes the exact same connection it already has in scope.
 */
export function scheduleCatalogueRefresh(db: Database, showId: string, reason: string): void {
  void refreshCatalogueJobs(db, showId, { reason }).catch((err) => {
    console.error(`[catalogue-refresh] scheduleCatalogueRefresh failed for show ${showId} (${reason}):`, err);
  });
}

export interface CatalogueJobStatusResult {
  status: DocumentRenderJobStatus;
  error: string | null;
  attempts: number;
  fileSha256: string | null;
  pageCount: number | null;
  /** Short-lived presigned GET — only present once the job is done.
   *  Catalogues carry exhibitor personal data, so this is never a public
   *  URL (reference_prod_db_access / project_public_org_columns_rule house
   *  rules for "never the more-exposed option by default"). */
  downloadUrl?: string;
}

export async function getCatalogueJobStatus(
  db: Database,
  jobId: string,
  opts: { showName?: string } = {},
): Promise<CatalogueJobStatusResult | null> {
  const job = await db.query.documentRenderJobs.findFirst({
    where: eq(schema.documentRenderJobs.id, jobId),
  });
  if (!job) return null;

  let downloadUrl: string | undefined;
  if (job.status === 'done' && job.storageKey) {
    const format = job.format as CatalogueFormat;
    const filename = `${sanitizeFilename(opts.showName ?? 'Catalogue')}-${CATALOGUE_FORMAT_LABELS[format] ?? 'Catalogue'}.pdf`;
    downloadUrl = await generatePresignedGetUrl(job.storageKey, { expiresIn: 900, filename });
  }

  return {
    status: job.status as DocumentRenderJobStatus,
    error: job.error,
    attempts: job.attempts,
    fileSha256: job.fileSha256,
    pageCount: job.pageCount,
    downloadUrl,
  };
}
