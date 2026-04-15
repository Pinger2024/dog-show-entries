/**
 * Award Board PDF endpoint.
 *
 * Produces an A4-landscape wipe-clean award board with the show's
 * Club name / Show type / Date pre-filled, and blank write-in
 * areas for 22 class placements + Bests. Designed for bulk-print +
 * lamination via Mixam, or home-print download by club secretaries.
 *
 * Auth: same as other secretary-facing PDFs — caller must be an
 * active member of the show's organisation (or admin).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { AwardBoard } from '@/components/award-board/award-board';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> },
) {
  const { showId } = await params;

  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const authResult = await authenticatePdfRequest(show.organisationId);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const pdfDocument = React.createElement(AwardBoard, {
      show: {
        clubName: show.organisation?.name ?? '',
        showType: show.showType,
        showDate: show.startDate,
      },
    });
    const buffer = await renderToBuffer(pdfDocument);
    const filename = `${sanitizeFilename(show.name)}-Award-Board.pdf`;
    const isPreview = request.nextUrl.searchParams.has('preview');
    return makePdfResponse(buffer, filename, isPreview);
  } catch (err) {
    console.error('Award board PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 },
    );
  }
}
