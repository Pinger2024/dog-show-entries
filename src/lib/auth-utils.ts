import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getImpersonatedUserId } from '@/lib/impersonation';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) return null;

  // When impersonating, return the impersonated user's identity.
  //
  // The cookie is a RAW, UNSIGNED user id (lib/impersonation.ts) — httpOnly
  // stops JavaScript, not devtools or curl — so the REAL session's role is the
  // only thing that makes it trustworthy. The admin check on
  // /api/admin/impersonate is not that guard: an attacker sets the cookie
  // directly instead of calling the route. Without this condition any
  // logged-in account could act as any user it could name, through every
  // caller below — requireAuth / requireRole / requireAnyRole (the dashboard,
  // secretary and steward layouts) and authenticatePdfRequest, which passes
  // this id to resolvePdfAccessForUser and hands back that user's club's
  // secretary-only documents (found 2026-09-11).
  //
  // server/trpc/init.ts and /api/dog-autosave/[dogId] carry the same check.
  // Three readers, one rule: keep them in step.
  const callerIsAdmin = session.user.role === 'admin';
  const impersonatedUserId = callerIsAdmin ? await getImpersonatedUserId() : null;

  // Read from DB when impersonating, or for exhibitors whose role may be
  // stale in the JWT (e.g. right after secretary registration)
  const needsDbLookup = impersonatedUserId || session.user.role === 'exhibitor';
  const targetUserId = impersonatedUserId || session.user.id;

  if (needsDbLookup && targetUserId && db) {
    const [dbUser] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (dbUser) {
      return dbUser;
    }
  }

  return session.user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}

export async function requireRole(role: string) {
  const user = await requireAuth();
  if (user.role !== role && user.role !== 'admin') {
    redirect('/dashboard');
  }
  return user;
}

export async function requireAnyRole(roles: string[]) {
  const user = await requireAuth();
  if (!roles.includes(user.role) && user.role !== 'admin') {
    redirect('/dashboard');
  }
  return user;
}
