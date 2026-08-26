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
    return { jobId: existing.id, status: existing.status as DocumentRenderJobStatus };
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

  return { jobId: row.id, status: 'queued' };
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
