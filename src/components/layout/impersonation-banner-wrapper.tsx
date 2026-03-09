import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import { users } from '@/server/db/schema';
import { getImpersonatedUserId } from '@/lib/impersonation';
import { ImpersonationBanner } from './impersonation-banner';

export async function ImpersonationBannerWrapper() {
  const impersonatedUserId = await getImpersonatedUserId();

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
