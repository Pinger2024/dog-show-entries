import { NextResponse } from 'next/server';
import { resetPassword } from '@/server/services/password-reset';

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid reset link' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { success: false, error: 'Password must be between 8 and 128 characters' },
        { status: 400 }
      );
    }

    const result = await resetPassword(token, password);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
