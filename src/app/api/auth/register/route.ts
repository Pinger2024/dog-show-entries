import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { error: 'Password must be between 8 and 128 characters' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing) {
      // Don't reveal that the account exists — generic error
      return NextResponse.json(
        { error: 'Unable to create account. Try signing in instead.' },
        { status: 409 }
      );
    }

    const passwordHash = await hash(password, 12);

    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        name: name?.trim() || '',
        passwordHash,
        emailVerified: new Date(),
      })
      .returning({ id: users.id, email: users.email });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (err: unknown) {
    // Catch unique constraint violation (concurrent registration with same email)
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json(
        { error: 'Unable to create account. Try signing in instead.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
