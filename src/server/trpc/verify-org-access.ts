import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { memberships } from '@/server/db/schema';
import type { Database } from '@/server/db';

/**
 * Verify that a user is an active member of the organisation.
 * Admins bypass the membership check and can act for any organisation.
 * Throws FORBIDDEN otherwise. Returns the membership (null for an admin
 * who is not a member).
 *
 * `opts.callerIsAdmin` is deliberately REQUIRED, exactly as on
 * `verifyShowAccess`: until 28 Oct 2026 this check had no admin path at
 * all, so an admin setting up a club's show (Mandy, GSD Club of Scotland)
 * could edit the show but was FORBIDDEN from listing or adding its venues.
 * Pass `{ callerIsAdmin: ctx.callerIsAdmin }`; the compile error when you
 * forget is the point.
 */
export async function verifyOrgAccess(
  db: Database,
  userId: string,
  organisationId: string,
  opts: { callerIsAdmin: boolean }
) {
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.organisationId, organisationId),
      eq(memberships.status, 'active')
    ),
  });

  if (membership) return membership;

  // Admins can act for any organisation without membership.
  if (opts.callerIsAdmin) return null;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'You do not have access to this organisation',
  });
}
