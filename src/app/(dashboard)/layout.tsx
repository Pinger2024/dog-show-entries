import { requireAuth } from '@/lib/auth-utils';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
