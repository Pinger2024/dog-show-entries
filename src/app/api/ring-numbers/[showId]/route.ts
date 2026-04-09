import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { generateRingNumbersPdf } from '@/server/services/pdf-generation';
import type { RingNumberFormat } from '@/components/ring-numbers/ring-numbers';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
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

  const searchParams = request.nextUrl.searchParams;
  const format: RingNumberFormat = searchParams.get('format') === 'single' ? 'single' : 'multi-up';
  const isPreview = searchParams.has('preview');

  try {
    const buffer = await generateRingNumbersPdf(showId, format);
    const formatLabel = format === 'single' ? 'Single' : 'A4-Grid';
    const filename = `${sanitizeFilename(show.name)}-Ring-Numbers-${formatLabel}.pdf`;
    return makePdfResponse(buffer, filename, isPreview);
  } catch (err) {
    console.error('Ring number PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 }
    );
  }
}
