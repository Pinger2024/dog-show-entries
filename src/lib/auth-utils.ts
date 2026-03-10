import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getImpersonatedUserId } from '@/lib/impersonation';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) return null;

  // When impersonating, return the impersonated user's identity
  const impersonatedUserId = await getImpersonatedUserId();
  const targetUserId = impersonatedUserId || session.user.id;

  // Always read the latest role from DB to avoid stale JWT issues
  // (e.g. after secretary registration the JWT may not have refreshed yet)
  if (targetUserId && db) {
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
