/**
 * Beacon-friendly autosave endpoint for the show schedule form.
 *
 * Why this exists alongside `secretary.updateScheduleData` (tRPC):
 * the tRPC mutation is fine for normal in-flight saves, but when the
 * Schedule form unmounts (user clicks away to Sponsors), the React
 * Query mutation observer is destroyed and any in-flight fetch gets
 * aborted by tRPC's per-request AbortController. Result: data loss.
 *
 * The browser's `navigator.sendBeacon()` bypasses that — it's
 * designed to deliver requests during page unload / navigation and
 * is independent of any AbortController. Sends a fire-and-forget
 * POST whose response we never read. This route receives that POST
 * and writes the same data the tRPC mutation would.
 *
 * Auth: same as the tRPC procedure — caller must be a member of the
 * show's organisation (or admin).
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { shows, memberships } from '@/server/db/schema';
import { and } from 'drizzle-orm';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  const { showId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const show = await db.query.shows.findFirst({
    where: eq(shows.id, showId),
    columns: { id: true, organisationId: true, scheduleData: true },
  });
  if (!show) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Membership check (admins also pass via the role check below)
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== 'admin') {
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, session.user.id),
        eq(memberships.organisationId, show.organisationId),
        eq(memberships.status, 'active')
      ),
      columns: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  let body: {
    showOpenTime?: string;
    judgingStartTime?: string;
    onCallVet?: string;
    scheduleData?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Defence in depth against wipe-on-mount bugs: if the incoming
  // payload is the default-form shape (no showManager, no officers,
  // no user-entered text fields) AND the show already has meaningful
  // content, refuse the write. The only legitimate way to land here
  // is a freshly-opened form that the user never edited before
  // navigating away — in which case the current DB is also blank and
  // this guard is a no-op.
  if (body.scheduleData && isLikelyUnintentionalWipe(body.scheduleData, show.scheduleData)) {
    console.warn(
      `[schedule-autosave] Refused suspicious wipe for show ${showId} ` +
      `(incoming payload looks like unhydrated form defaults)`
    );
    return NextResponse.json({ ok: true, skipped: 'suspicious-wipe' });
  }

  const updates: Record<string, unknown> = {};
  if (body.scheduleData !== undefined) {
    // MERGE semantics rather than REPLACE. The beacon path is
    // inherently partial-snapshot prone: the client's React Query
    // cache may be stale, or an older tab may fire with an
    // incomplete form state. By merging the incoming object with
    // the current DB value, any field the client omits stays
    // intact. This avoids cascade-wipes where one field goes
    // missing and drags unrelated fields out with it.
    //
    // Trade-off: clearing a field via beacon now requires sending
    // it as an explicit empty value (e.g. `welcomeNote: ''`)
    // rather than omitting it. All current client sites on this
    // route already send every field from loaded state, so this
    // matches actual usage.
    const existing = (show.scheduleData ?? {}) as Record<string, unknown>;
    updates.scheduleData = { ...existing, ...body.scheduleData };
  }
  if (body.showOpenTime !== undefined) updates.showOpenTime = body.showOpenTime || null;
  if (body.judgingStartTime !== undefined) updates.startTime = body.judgingStartTime || null;
  if (body.onCallVet !== undefined) updates.onCallVet = body.onCallVet || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  await db.update(shows).set(updates).where(eq(shows.id, showId));
  return NextResponse.json({ ok: true });
}

/**
 * True when `incoming` looks like an unhydrated-form snapshot (no
 * user-entered content) AND `existing` has meaningful content that
 * the write would erase. Used to block the pre-load beacon path.
 */
function isLikelyUnintentionalWipe(
  incoming: Record<string, unknown>,
  existing: unknown,
): boolean {
  const incomingOfficers = Array.isArray(incoming.officers) ? incoming.officers : [];
  const incomingGuarantors = Array.isArray(incoming.guarantors) ? incoming.guarantors : [];
  const textFields = [
    'showManager', 'awardsDescription', 'prizeMoney', 'what3words',
    'directions', 'catering', 'futureShowDates', 'additionalNotes',
    'welcomeNote', 'benchingRemovalTime', 'latestArrivalTime',
  ];
  const incomingHasText = textFields.some((k) => {
    const v = incoming[k];
    return typeof v === 'string' && v.trim().length > 0;
  });
  const incomingIsBlank =
    !incomingHasText &&
    incomingOfficers.length === 0 &&
    incomingGuarantors.length === 0;
  if (!incomingIsBlank) return false;

  const ex = (existing ?? {}) as Record<string, unknown>;
  const existingOfficers = Array.isArray(ex.officers) ? ex.officers : [];
  const existingGuarantors = Array.isArray(ex.guarantors) ? ex.guarantors : [];
  const existingHasText = textFields.some((k) => {
    const v = ex[k];
    return typeof v === 'string' && v.trim().length > 0;
  });
  return existingHasText || existingOfficers.length > 0 || existingGuarantors.length > 0;
}
