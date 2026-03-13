import { NextRequest, NextResponse } from 'next/server';
import { eq, or } from 'drizzle-orm';
import { db } from '@/server/db';
import { shows } from '@/server/db/schema';
import { isUuid, sanitizeFilename } from '@/lib/slugify';
import { generateIcs } from '@/lib/generate-ics';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  const { showId } = await params;

  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  const whereClause = isUuid(showId)
    ? or(eq(shows.id, showId), eq(shows.slug, showId))
    : eq(shows.slug, showId);

  const show = await db.query.shows.findFirst({
    where: whereClause,
    with: {
      organisation: true,
      venue: true,
    },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  // Don't serve calendar files for draft or cancelled shows
  if (show.status === 'draft' || show.status === 'cancelled') {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const showUrl = `https://remishowmanager.co.uk/shows/${show.slug ?? show.id}`;

  const icsContent = generateIcs({
    name: show.name,
    startDate: show.startDate,
    endDate: show.endDate,
    startTime: show.startTime,
    endTime: show.endTime,
    venue: show.venue?.name,
    address: show.venue?.address,
    postcode: show.venue?.postcode,
    description: show.description,
    url: showUrl,
    organizer: show.organisation?.name,
  });

  const filename = `${sanitizeFilename(show.name)}.ics`;

  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
