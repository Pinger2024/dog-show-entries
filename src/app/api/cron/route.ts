import { NextResponse } from 'next/server';
import { requireCronSecret } from '@/server/lib/cron-auth';
import { db } from '@/server/db';
import { shows, orders, orderSundryItems, sundryItems } from '@/server/db/schema';
import { and, eq, ne, or, ilike, isNull, lte, gte, lt, isNotNull, sql } from 'drizzle-orm';
import { syncCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { refreshCatalogueJobs, scheduleCatalogueRefresh } from '@/server/services/catalogue-jobs';
import { sendCatalogueReadyEmail, sendParkingPassEmail } from '@/server/services/email';
import { CATALOGUE_NAME_PATTERN } from '@/lib/catalogue-utils';
import { PARKING_NAME_PATTERNS } from '@/lib/parking-utils';
import { todayInLondon, londonDateOffset } from '@/lib/date-utils';

/** Wall-clock hour:minute in Europe/London — used to gate the catalogue-ready
 *  email to "morning of the show, on or after 8:30 am". The cron ticks hourly
 *  on the hour, so in practice the 09:00 London tick is the one that sends. */
function londonHourMinute(): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

/**
 * Cron endpoint — auto-close entries for shows past their close date.
 *
 * Call via Render Cron Job or external scheduler:
 *   GET /api/cron?secret=<CRON_SECRET>
 *
 * Render cron `remi-daily-cron` runs this hourly (`0 * * * *`).
 */
export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

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
  // numbers to become stable. A full re-sort, not a first-time-only pass —
  // entries that arrived after the secretary last opened the catalogue
  // would otherwise close with no number at all. Runs sequentially rather
  // than in parallel to stay gentle on Render's db connection cap.
  const numberedShows: { id: string; assigned: number }[] = [];
  for (const show of closedShows) {
    try {
      const result = await syncCatalogueNumbers(db, show.id);
      if (result.assigned > 0) numberedShows.push({ id: show.id, assigned: result.assigned });
    } catch (err) {
      console.error(`[cron] syncCatalogueNumbers failed for ${show.id}:`, err);
    }
    scheduleCatalogueRefresh(db, show.id, 'auto-close'); // numbers just locked in — render the catalogue now, not on the secretary's first View
  }

  // Start of today in server-local time, expressed as a date string —
  // `shows.start_date` and `shows.end_date` are stored as DATE columns,
  // so we compare against the calendar day, not a wall-clock timestamp.
  const today = now.toISOString().slice(0, 10);

  // entries_closed → in_progress on the morning of the show. Catches the
  // common case of a show still showing "entries closed" at the gate.
  const startedShows = await db
    .update(shows)
    .set({ status: 'in_progress', updatedAt: now })
    .where(
      and(
        eq(shows.status, 'entries_closed'),
        lte(shows.startDate, today),
      ),
    )
    .returning({ id: shows.id, name: shows.name });

  // in_progress → completed at midnight after the show's last day.
  // Uses end_date if set, otherwise start_date (single-day shows).
  const finishedShows = await db
    .update(shows)
    .set({ status: 'completed', updatedAt: now })
    .where(
      and(
        eq(shows.status, 'in_progress'),
        lt(sql`COALESCE(${shows.endDate}, ${shows.startDate})`, today),
      ),
    )
    .returning({ id: shows.id, name: shows.name });

  // Hourly catalogue-refresh sweep — for every show still in its
  // proofing/printing window (entries_closed/in_progress), re-render any
  // auto-format catalogue whose data has drifted since it was last
  // rendered. This is the safety net for the scattered non-hooked call
  // sites (judges, class sponsorship, dog edits, manual entries,
  // withdrawals) — refreshCatalogueJobs dedupes on snapshot hash, so a show
  // with no real change enqueues nothing and costs one cheap lookup.
  // Capped to shows starting within the next 60 days or the last 7 so old
  // stragglers that never progressed past entries_closed don't get
  // re-rendered forever.
  let catalogueRefreshEnqueued = 0;
  let catalogueRefreshUnchanged = 0;
  const catalogueRefreshErrors: string[] = [];
  const sweepShows = await db.query.shows.findMany({
    where: and(
      or(eq(shows.status, 'entries_closed'), eq(shows.status, 'in_progress')),
      gte(shows.startDate, londonDateOffset(-7)),
      lte(shows.startDate, londonDateOffset(60)),
    ),
    columns: { id: true },
  });
  for (const show of sweepShows) {
    try {
      const result = await refreshCatalogueJobs(db, show.id, { reason: 'hourly-sweep' });
      // refreshCatalogueJobs never throws for a single format's failure — it
      // collects per-format errors and keeps going — so a show with any
      // failed format is recorded as an error here too, not just a hard
      // throw from the call itself.
      if (result.errors.length > 0) {
        catalogueRefreshErrors.push(show.id);
      }
      if (result.enqueued.length > 0) {
        catalogueRefreshEnqueued += 1;
      } else if (!result.skipped && result.errors.length === 0) {
        catalogueRefreshUnchanged += 1;
      }
    } catch (err) {
      console.error(`[cron] catalogue refresh sweep failed for show ${show.id}:`, err);
      catalogueRefreshErrors.push(show.id);
    }
  }
  console.log(
    `[cron] refreshed ${sweepShows.length} shows: ${catalogueRefreshEnqueued} enqueued, ${catalogueRefreshUnchanged} unchanged`,
  );

  // Show-morning catalogue-ready emails (Amanda 2026-05-28). After 8:30 am
  // London on the show's start date, email every exhibitor who paid for a
  // catalogue and hasn't been notified yet. The 8:30 floor matches her ask
  // — early enough that exhibitors have the link in hand before judging,
  // late enough that we're not pinging anyone at 5 am.
  let catalogueEmailsSent = 0;
  const catalogueEmailErrors: string[] = [];
  const londonNow = londonHourMinute();
  const isAfter830London = londonNow.hour > 8 || (londonNow.hour === 8 && londonNow.minute >= 30);
  const todayStr = todayInLondon();

  if (isAfter830London) {
    const pendingOrders = await db
      .selectDistinct({ orderId: orders.id })
      .from(orders)
      .innerJoin(shows, eq(orders.showId, shows.id))
      .innerJoin(orderSundryItems, eq(orderSundryItems.orderId, orders.id))
      .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
      .where(
        and(
          eq(orders.status, 'paid'),
          lte(shows.startDate, todayStr),
          // Don't pester exhibitors about a show that ended yesterday — only
          // shows whose run includes today qualify.
          sql`COALESCE(${shows.endDate}, ${shows.startDate}) >= ${todayStr}`,
          isNull(orders.catalogueReadyEmailedAt),
          ilike(sundryItems.name, CATALOGUE_NAME_PATTERN),
        ),
      );

    for (const { orderId } of pendingOrders) {
      try {
        await sendCatalogueReadyEmail(orderId);
        await db
          .update(orders)
          .set({ catalogueReadyEmailedAt: new Date(), updatedAt: new Date() })
          .where(eq(orders.id, orderId));
        catalogueEmailsSent += 1;
      } catch (err) {
        console.error(`[cron] catalogue-ready email failed for order ${orderId}:`, err);
        catalogueEmailErrors.push(orderId);
      }
    }
  }

  // Pre-paid parking pass emails — one week before the show, and on the next
  // hourly tick for anyone who bought it late inside that window (Mandy
  // 2026-08-04). Same idempotent stamp-after-send shape as the
  // catalogue-ready branch above, gated on the same 8:30am wall-clock floor.
  // Window is inclusive of the show morning itself: today <= startDate <=
  // today + 7 days — nothing sends once startDate has passed.
  let parkingPassEmailsSent = 0;
  const parkingPassEmailErrors: string[] = [];

  if (isAfter830London) {
    const windowEnd = londonDateOffset(7);

    // The ILIKE patterns are a coarse DB-level pre-filter only — they have
    // no word-boundary support, so a club's "Sparking Wine" sundry could
    // slip through here. sendParkingPassEmail re-derives the genuine
    // parking quantity via isParkingSundry() (the authoritative matcher)
    // before ever sending, so a false-positive candidate is a safe no-op:
    // it's simply skipped below, not stamped, not counted.
    const pendingParkingOrders = await db
      .selectDistinct({ orderId: orders.id })
      .from(orders)
      .innerJoin(shows, eq(orders.showId, shows.id))
      .innerJoin(orderSundryItems, eq(orderSundryItems.orderId, orders.id))
      .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
      .where(
        and(
          eq(orders.status, 'paid'),
          // A cancelled show must never email parking passes, however the
          // order was paid before cancellation.
          ne(shows.status, 'cancelled'),
          gte(shows.startDate, todayStr),
          lte(shows.startDate, windowEnd),
          isNull(orders.parkingPassEmailedAt),
          or(...PARKING_NAME_PATTERNS.map((pattern) => ilike(sundryItems.name, pattern))),
        ),
      );

    for (const { orderId } of pendingParkingOrders) {
      try {
        const sent = await sendParkingPassEmail(orderId);
        if (sent) {
          await db
            .update(orders)
            .set({ parkingPassEmailedAt: new Date(), updatedAt: new Date() })
            .where(eq(orders.id, orderId));
          parkingPassEmailsSent += 1;
        }
      } catch (err) {
        console.error(`[cron] parking-pass email failed for order ${orderId}:`, err);
        parkingPassEmailErrors.push(orderId);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    closed: closedShows.length,
    started: startedShows.length,
    finished: finishedShows.length,
    shows: closedShows.map((s) => s.name),
    startedShows: startedShows.map((s) => s.name),
    finishedShows: finishedShows.map((s) => s.name),
    numberedShows,
    catalogueRefreshChecked: sweepShows.length,
    catalogueRefreshEnqueued,
    catalogueRefreshUnchanged,
    catalogueRefreshErrors,
    catalogueEmailsSent,
    catalogueEmailErrors,
    parkingPassEmailsSent,
    parkingPassEmailErrors,
    checkedAt: now.toISOString(),
  });
}
