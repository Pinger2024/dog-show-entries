import { requireRole } from '@/lib/auth-utils';
import { SecretaryShell } from '@/components/layout/secretary-shell';

export default async function SecretaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole('secretary');

  return <SecretaryShell user={user}>{children}</SecretaryShell>;
}
