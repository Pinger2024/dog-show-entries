import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { shows } from '@/server/db/schema';
import { and, eq, lte, isNotNull } from 'drizzle-orm';
import { ensureCatalogueNumbers } from '@/server/services/catalogue-numbering';

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

  if (!db) {
    return NextResponse.json({ error: 'db unavailable' }, { status: 500 });
  }

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

  // Lock in catalogue numbers the moment each show closes. Per Amanda
  // 2026-04-17: the close-entries transition is the natural moment for
  // numbers to become stable. Runs sequentially rather than in parallel
  // to stay gentle on Render's db connection cap for a 15-min cron tick.
  const numberedShows: { id: string; assigned: number }[] = [];
  for (const show of closedShows) {
    try {
      const result = await ensureCatalogueNumbers(db, show.id);
      if (result.assigned > 0) numberedShows.push({ id: show.id, assigned: result.assigned });
    } catch (err) {
      console.error(`[cron] ensureCatalogueNumbers failed for ${show.id}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    closed: closedShows.length,
    shows: closedShows.map((s) => s.name),
    numberedShows,
    checkedAt: now.toISOString(),
  });
}
