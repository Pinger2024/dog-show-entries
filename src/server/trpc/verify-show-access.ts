import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { shows, memberships } from '@/server/db/schema';
import type { Database } from '@/server/db';

/**
 * Verify that a user is a member of the organisation that owns the given show.
 * Throws FORBIDDEN if they don't have access. Returns the show record.
 */
export async function verifyShowAccess(
  db: Database,
  userId: string,
  showId: string
) {
  const show = await db.query.shows.findFirst({
    where: eq(shows.id, showId),
    columns: { id: true, organisationId: true },
  });

  if (!show) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
  }

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.organisationId, show.organisationId),
      eq(memberships.status, 'active')
    ),
  });

  if (!membership) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this show',
    });
  }

  return show;
}
