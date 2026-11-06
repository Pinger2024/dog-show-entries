import { NextResponse } from 'next/server';

/**
 * Shared CRON_SECRET check for /api/cron* routes. Accepts the secret as a
 * Bearer token (preferred — query strings end up in access logs) or as a
 * `?secret=` query param while the external scheduler config migrates.
 *
 * Returns a NextResponse to send when the request is NOT authorised, or
 * null when it is — so routes can do:
 *
 *   const denied = requireCronSecret(request);
 *   if (denied) return denied;
 */
export function requireCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed AND loudly distinguishable from a bad caller secret.
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const querySecret = new URL(request.url).searchParams.get('secret') ?? '';

  if (bearer !== secret && querySecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
