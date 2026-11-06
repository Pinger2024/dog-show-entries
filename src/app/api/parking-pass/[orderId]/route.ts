import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCurrentUser } from '@/lib/auth-utils';
import { db } from '@/server/db';
import { and, eq } from 'drizzle-orm';
import { memberships, orders } from '@/server/db/schema';
import { generateParkingPassPdf } from '@/server/services/parking-pass-pdf';
import { makePdfResponse } from '@/lib/pdf-utils';

/**
 * Download a purchased parking pass. Available immediately after purchase —
 * no show-day gating (unlike the catalogue). Auth mirrors
 * authenticatePdfRequest's membership check in pdf-utils.ts: the order's own
 * exhibitor, a platform admin, or a member of the show's host organisation.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true, exhibitorId: true },
    with: { show: { columns: { organisationId: true } } },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Admin bypass is based on the REAL session, not the (possibly
  // impersonated) identity from getCurrentUser() — an admin impersonating a
  // secretary keeps admin powers (see permission-guards.test.ts).
  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';
  const isOwner = order.exhibitorId === user.id;

  if (!isOwner && !isAdmin) {
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, user.id),
        eq(memberships.organisationId, order.show.organisationId),
        eq(memberships.status, 'active'),
      ),
    });
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const generated = await generateParkingPassPdf(orderId);
  if (!generated) {
    return NextResponse.json({ error: 'No parking pass on this order' }, { status: 404 });
  }

  return makePdfResponse(generated.buffer, generated.filename, false);
}
