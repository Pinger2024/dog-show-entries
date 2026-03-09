import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stopImpersonation } from '@/lib/impersonation';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await stopImpersonation();
  return NextResponse.json({ success: true });
}
