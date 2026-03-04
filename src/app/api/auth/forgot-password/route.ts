import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/server/services/password-reset';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      // Still return 200 to prevent enumeration
      return NextResponse.json({ ok: true });
    }

    await requestPasswordReset(email);

    return NextResponse.json({ ok: true });
  } catch {
    // Always return success to prevent enumeration
    return NextResponse.json({ ok: true });
  }
}
