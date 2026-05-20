import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { generatePrizeCardsA3Jpeg } from '@/server/services/pdf-generation';
import { authenticatePdfRequest } from '@/lib/pdf-utils';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ showId: string }> },
) {
  const { showId } = await params;

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true },
  });
  if (!show) return new NextResponse('Show not found', { status: 404 });

  const authResult = await authenticatePdfRequest(show.organisationId, { showId });
  if (authResult instanceof NextResponse) return authResult;

  const jpeg = await generatePrizeCardsA3Jpeg(showId);
  const isPreview = _req.nextUrl.searchParams.has('preview');

  if (isPreview) {
    const b64 = jpeg.toString('base64');
    const html = `<!DOCTYPE html><html><body style="margin:0;background:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="data:image/jpeg;base64,${b64}" style="max-width:100%;display:block"></body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
  }

  return new NextResponse(jpeg as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `attachment; filename="prize-cards-a3-${showId}.jpg"`,
    },
  });
}
