import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { startImpersonation } from '@/lib/impersonation';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import { users } from '@/server/db/schema';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  // Verify target user exists
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await startImpersonation(userId);
  return NextResponse.json({ success: true });
}
