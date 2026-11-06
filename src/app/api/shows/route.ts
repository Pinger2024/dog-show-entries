import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { listPublicShowFeed } from '@/server/services/public-show-feed';

/**
 * GET /api/shows — the public show feed. Read-only, unauthenticated, and only
 * ever the shows and columns the public show pages already carry.
 *
 * It exists so nothing outside Remi has to keep its own copy of which shows
 * exist and whether they are open: the GSD Breed Council's static site did,
 * by hand, in a Python dict, and that copy went wrong the day a show closed.
 * Every decision in the payload is made here by Remi's own owners (see
 * `listPublicShowFeed`); a consumer renders what it is given rather than
 * working any of it out again.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  const shows = await listPublicShowFeed(db);

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), count: shows.length, shows },
    {
      headers: {
        // Short enough that a closing date going past is visible within the
        // hour, long enough that a static rebuild loop costs us nothing.
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        // A static site builder fetches this from its own origin.
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
