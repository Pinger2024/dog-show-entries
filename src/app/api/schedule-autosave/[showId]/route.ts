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
    columns: { id: true, organisationId: true },
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

  const updates: Record<string, unknown> = {};
  if (body.scheduleData !== undefined) updates.scheduleData = body.scheduleData;
  if (body.showOpenTime !== undefined) updates.showOpenTime = body.showOpenTime || null;
  if (body.judgingStartTime !== undefined) updates.startTime = body.judgingStartTime || null;
  if (body.onCallVet !== undefined) updates.onCallVet = body.onCallVet || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  await db.update(shows).set(updates).where(eq(shows.id, showId));
  return NextResponse.json({ ok: true });
}
