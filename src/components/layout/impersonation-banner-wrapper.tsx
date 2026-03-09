import { cookies } from 'next/headers';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import { users } from '@/server/db/schema';
import { ImpersonationBanner } from './impersonation-banner';

export async function ImpersonationBannerWrapper() {
  const cookieStore = await cookies();
  const impersonatedUserId = cookieStore.get('remi_impersonate_user')?.value;

  if (!impersonatedUserId) return null;

  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, impersonatedUserId))
    .limit(1);

  if (!user) return null;

  return (
    <ImpersonationBanner
      userName={user.name ?? ''}
      userEmail={user.email ?? ''}
      userRole={user.role}
    />
  );
}
