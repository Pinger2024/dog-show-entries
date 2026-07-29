import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCurrentUser } from '@/lib/auth-utils';
import { db } from '@/server/db';
import { and, eq } from 'drizzle-orm';
import { memberships } from '@/server/db/schema';
import { hasUserPurchasedCatalogue, SECRETARY_ONLY_FORMATS } from '@/lib/catalogue-utils';

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
 * Exhibitors who purchased an online catalogue can access non-secretary formats.
 * Returns { user, isAdmin, isExhibitorAccess } on success, or a NextResponse error.
 *
 * `requireAdmin: true` restricts the route to admins only — use it wherever the
 * UI hides a document behind an admin check, so the server enforces what the
 * client asserts rather than relying on nobody guessing the URL.
 */
export async function authenticatePdfRequest(
  organisationId: string,
  options?: { showId?: string; format?: string; requireAdmin?: boolean }
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; isAdmin: boolean; isExhibitorAccess: boolean } | NextResponse> {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';

  if (isAdmin) {
    return { user, isAdmin, isExhibitorAccess: false };
  }

  // Admin-only route and the caller is not an admin — stop here. Must come
  // after the isAdmin early-return above and before any membership or
  // catalogue-purchase fallback, both of which would otherwise let a plain
  // org member through.
  if (options?.requireAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (db) {
    // Check org membership (secretary/org member access)
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, user.id),
        eq(memberships.organisationId, organisationId),
        eq(memberships.status, 'active')
      ),
    });
    if (membership) {
      return { user, isAdmin: false, isExhibitorAccess: false };
    }

    // No org membership — check exhibitor catalogue purchase
    if (options?.showId) {
      if (options.format && SECRETARY_ONLY_FORMATS.has(options.format)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const purchased = await hasUserPurchasedCatalogue(db, options.showId, user.id);
      if (purchased) {
        return { user, isAdmin: false, isExhibitorAccess: true };
      }
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // No database handle — we cannot verify org membership, so we cannot
  // authorise. Fail closed: a missing DB must never grant a non-admin access
  // to every organisation's documents. (Every caller currently guards `!db`
  // before reaching here, so this is defence in depth rather than a live path.)
  return NextResponse.json({ error: 'Database not available' }, { status: 500 });
}
