import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

/**
 * Unauthenticated liveness/readiness probe. Added 2026-08-26 alongside the
 * background document-render worker so the web process's health can be
 * checked independently while a heavy render runs in a SEPARATE process —
 * a hammering `SELECT 1` here while a worker renders a large catalogue is
 * exactly the acceptance check that a render can no longer take the web
 * process down with it.
 */
export async function GET() {
  if (!db) {
    return NextResponse.json({ ok: false, db: false, error: 'Database not available' }, { status: 503 });
  }

  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB health check timed out')), 3000)),
    ]);
    return NextResponse.json({ ok: true, db: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, db: false, error: message }, { status: 503 });
  }
}
