import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { memberships } from '@/server/db/schema';
import type { Database } from '@/server/db';

/**
 * Verify that a user is an active member of the given organisation.
 * Throws FORBIDDEN if they don't have access. Returns the membership record.
 */
export async function verifyOrgAccess(
  db: Database,
  userId: string,
  organisationId: string
) {
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.organisationId, organisationId),
      eq(memberships.status, 'active')
    ),
  });

  if (!membership) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this organisation',
    });
  }

  return membership;
}
