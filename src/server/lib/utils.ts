import { randomBytes } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { users, memberships } from '@/server/db/schema';
import type { Database } from '@/server/db';
import { roleAfterGrant, type UserRole } from '@/lib/roles';

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'https://remishowmanager.co.uk'
  );
}

/**
 * Grant a user a role (never lowering the one they hold — see
 * src/lib/roles.ts) and create an org membership (if applicable).
 */
export async function assignRole(
  db: Database,
  userId: string,
  role: UserRole,
  organisationId: string | null,
) {
  const current = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });
  const granted = current ? roleAfterGrant(current.role as UserRole, role) : role;

  const ops: Promise<unknown>[] = [
    db
      .update(users)
      .set({ role: granted, onboardingCompletedAt: new Date() })
      .where(eq(users.id, userId)),
  ];

  if (organisationId) {
    // Only create membership if one doesn't already exist
    ops.push(
      db.query.memberships
        .findFirst({
          where: and(
            eq(memberships.userId, userId),
            eq(memberships.organisationId, organisationId),
          ),
        })
        .then((existing) => {
          if (!existing) {
            return db.insert(memberships).values({
              userId,
              organisationId,
              status: 'active',
            });
          }
        }),
    );
  }

  await Promise.all(ops);
}
