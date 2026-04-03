import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { shows } from '@/server/db/schema';
import { and, eq, lte, isNotNull } from 'drizzle-orm';

/**
 * Cron endpoint — auto-close entries for shows past their close date.
 *
 * Call via Render Cron Job or external scheduler:
 *   GET /api/cron?secret=<CRON_SECRET>
 *
 * Runs every 15 minutes in production.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Single bulk update — no N+1
  const closedShows = await db
    .update(shows)
    .set({ status: 'entries_closed', updatedAt: now })
    .where(
      and(
        eq(shows.status, 'entries_open'),
        isNotNull(shows.entryCloseDate),
        lte(shows.entryCloseDate, now),
      ),
    )
    .returning({ id: shows.id, name: shows.name });

  return NextResponse.json({
    ok: true,
    closed: closedShows.length,
    shows: closedShows.map((s) => s.name),
    checkedAt: now.toISOString(),
  });
}
