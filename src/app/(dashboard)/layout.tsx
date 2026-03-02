import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth-utils';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Redirect exhibitors who haven't completed onboarding
  if (user.role === 'exhibitor' && db) {
    const [dbUser] = await db
      .select({ onboardingCompletedAt: users.onboardingCompletedAt })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (dbUser && !dbUser.onboardingCompletedAt) {
      redirect('/onboarding');
    }
  }

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
