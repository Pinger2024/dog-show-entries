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

  // Find shows that are entries_open with a close date in the past
  const overdueShows = await db
    .select({ id: shows.id, name: shows.name, entryCloseDate: shows.entryCloseDate })
    .from(shows)
    .where(
      and(
        eq(shows.status, 'entries_open'),
        isNotNull(shows.entryCloseDate),
        lte(shows.entryCloseDate, now),
      ),
    );

  const closed: string[] = [];

  for (const show of overdueShows) {
    await db
      .update(shows)
      .set({ status: 'entries_closed', updatedAt: now })
      .where(eq(shows.id, show.id));
    closed.push(show.name);
  }

  return NextResponse.json({
    ok: true,
    closed: closed.length,
    shows: closed,
    checkedAt: now.toISOString(),
  });
}
