import { requireAnyRole } from '@/lib/auth-utils';
import { StewardShell } from '@/components/layout/steward-shell';

export default async function StewardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAnyRole(['steward', 'secretary']);

  return <StewardShell user={user}>{children}</StewardShell>;
}
