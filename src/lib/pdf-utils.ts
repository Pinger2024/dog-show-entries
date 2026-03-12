import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCurrentUser } from '@/lib/auth-utils';
import { db } from '@/server/db';
import { and, eq } from 'drizzle-orm';
import { memberships } from '@/server/db/schema';

/**
 * Validate a logo URL for use in @react-pdf/renderer.
 * Returns the URL if it's a fetchable raster image, or null otherwise.
 * react-pdf only supports PNG/JPEG — SVG crashes the renderer.
 * Results are cached for 5 minutes (1 minute on failure) to avoid
 * hitting the CDN on every PDF preview.
 */
const logoCache = new Map<string, { result: string | null; expiresAt: number }>();

export async function validateRasterLogoUrl(rawUrl: string | null | undefined): Promise<string | null> {
  if (!rawUrl) return null;

  const now = Date.now();
  const cached = logoCache.get(rawUrl);
  if (cached && cached.expiresAt > now) return cached.result;

  try {
    const res = await fetch(rawUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const ct = res.headers.get('content-type') ?? '';
    const result = res.ok && ct.startsWith('image/') && !ct.includes('svg') ? rawUrl : null;
    logoCache.set(rawUrl, { result, expiresAt: now + 5 * 60_000 });
    return result;
  } catch {
    console.warn('Logo fetch failed, omitting from PDF:', rawUrl);
    logoCache.set(rawUrl, { result: null, expiresAt: now + 60_000 });
    return null;
  }
}

/**
 * Build a PDF Response with correct headers.
 * @param isPreview - true for inline display, false for download
 */
export function makePdfResponse(buffer: Buffer, filename: string, isPreview: boolean): Response {
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${isPreview ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  });
}

/**
 * Authenticate + authorise a user for a show's PDF.
 * Admins bypass the membership check (needed for impersonation).
 * Returns { user, isAdmin } on success, or a NextResponse error.
 */
export async function authenticatePdfRequest(
  organisationId: string
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; isAdmin: boolean } | NextResponse> {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';

  if (!isAdmin && db) {
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, user.id),
        eq(memberships.organisationId, organisationId),
        eq(memberships.status, 'active')
      ),
    });
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return { user, isAdmin };
}
