import { NextRequest, NextResponse } from 'next/server';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { authenticatePdfRequest } from '@/lib/pdf-utils';
import { redactWithheldOwnerAddresses } from '@/lib/catalogue-privacy';
import { buildCatalogueSnapshot, materializeCatalogueEntries } from '@/server/services/catalogue-snapshot';
import {
  isCatalogueFormat,
  catalogueShowDayGate,
  requestCatalogueJob,
  getCatalogueJobStatus,
} from '@/server/services/catalogue-jobs';

/**
 * Catalogue PDFs render in a background worker, not on this web request
 * process (2026-08-15 outage: a heavy catalogue render OOM-killed the
 * single prod web instance mid-entries). This route now only:
 *   - serves the `?output=json` data export inline (cheap — no PDF render)
 *   - enqueues (or dedupes onto) a render job and reports its status
 * The actual render lives in src/server/workers/document-render-worker.ts,
 * fed by src/server/services/catalogue-snapshot.ts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string; format: string }> }
) {
  const { showId, format } = await params;

  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  if (!isCatalogueFormat(format)) {
    return NextResponse.json(
      { error: 'Invalid format. Use "standard", "by-class", "judging", "absentees", or "marked".' },
      { status: 400 },
    );
  }

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    columns: { id: true, name: true, organisationId: true, startDate: true },
    with: { organisation: { columns: publicOrgColumns } },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const authResult = await authenticatePdfRequest(show.organisationId, { showId, format });
  if (authResult instanceof NextResponse) return authResult;

  // Catalogues for exhibitors are released on the morning of the show
  // (Amanda 2026-05-28). Host-club secretaries and admins still get
  // pre-show access for proofing and printing.
  const gate = catalogueShowDayGate(authResult.isExhibitorAccess, show);
  if (gate.blocked) {
    return NextResponse.json(
      { error: 'Catalogue not yet available', message: gate.message, availableFrom: gate.availableFrom },
      { status: 403 },
    );
  }

  // JSON data export stays a synchronous 200 — no PDF render involved, so
  // it never touches the web-process-OOM risk this refactor exists to fix.
  const wantsJson = request.nextUrl.searchParams.get('output') === 'json';
  if (wantsJson) {
    const snapshot = await buildCatalogueSnapshot(db, showId);
    const { showInfo, entries } = materializeCatalogueEntries(snapshot, format);
    return NextResponse.json({
      show: showInfo,
      // Suppress withheld owners' home addresses — this export is reachable
      // with exhibitor-level access on show day. Mirrors the PDF render.
      entries: redactWithheldOwnerAddresses(entries),
      format,
      generatedAt: new Date().toISOString(),
    });
  }

  // Everything else: enqueue (or dedupe onto) a background render job.
  // 202 for a fresh/still-running job; 200 with a ready presigned download
  // when a matching job has already finished. Anything hitting this route
  // expecting an inline PDF stream (an old cached link, a stray integration)
  // gets a clear JSON body explaining what changed rather than a broken
  // Content-Type.
  try {
    const result = await requestCatalogueJob(db, {
      showId,
      format,
      requestedByUserId: authResult.user.id,
    });

    if (result.status === 'done') {
      const status = await getCatalogueJobStatus(db, result.jobId, { showName: show.name });
      if (status?.downloadUrl) {
        return NextResponse.json({ jobId: result.jobId, status: 'done', downloadUrl: status.downloadUrl });
      }
    }

    return NextResponse.json(
      {
        jobId: result.jobId,
        status: result.status,
        message:
          'Catalogues now render in the background — poll documentJobs.status (tRPC) with this jobId, or GET this same URL again shortly, for a download link. Large shows can take up to a minute.',
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('Catalogue job enqueue failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to prepare catalogue', detail: message }, { status: 500 });
  }
}
