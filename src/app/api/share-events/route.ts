import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { shareEvents } from '@/server/db/schema';

const bodySchema = z.object({
  showId: z.string().uuid(),
  channel: z
    .string()
    .regex(/^[a-z0-9_-]+$/i)
    .max(32),
});

/**
 * Logs a share-button tap. Called fire-and-forget from the client. Must
 * never block the share UX — we return quickly and swallow most errors so
 * a failed log never breaks a working share.
 *
 * No auth requirement: anyone can share a show, logged in or not. userId
 * is captured opportunistically when a session exists.
 */
export async function POST(request: Request) {
  if (!db) return NextResponse.json({ ok: false }, { status: 500 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    const json = await request.json();
    parsed = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }

  // Grab the session if present, but don't block on it — users who aren't
  // logged in can still share. Swallow auth errors so a broken auth call
  // never stops attribution writes.
  let userId: string | null = null;
  try {
    const session = await auth();
    userId = session?.user?.id ?? null;
  } catch {
    // ignore
  }

  try {
    await db.insert(shareEvents).values({
      showId: parsed.showId,
      channel: parsed.channel.toLowerCase(),
      userId,
    });
  } catch (err) {
    // Write failures shouldn't surface to the user — they've already shared.
    console.error('share-events insert failed:', err);
  }

  return NextResponse.json({ ok: true });
}
