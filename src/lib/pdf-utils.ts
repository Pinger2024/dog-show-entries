import { NextResponse } from 'next/server';
import { TRPCError } from '@trpc/server';
import { auth } from '@/lib/auth';
import { getCurrentUser } from '@/lib/auth-utils';
import { db } from '@/server/db';
import { and, eq } from 'drizzle-orm';
import { memberships } from '@/server/db/schema';
import { hasUserPurchasedCatalogue, SECRETARY_ONLY_FORMATS } from '@/lib/catalogue-utils';
import { BoundedCache } from '@/lib/bounded-cache';

/**
 * Validate a logo URL for use in @react-pdf/renderer.
 * Returns the URL if it's a fetchable raster image, or null otherwise.
 * react-pdf only supports PNG/JPEG — SVG crashes the renderer.
 * Results are cached for 5 minutes (1 minute on failure) to avoid
 * hitting the CDN on every PDF preview.
 *
 * Bounded: the key is a club-supplied logo URL, so a plain Map would grow one
 * entry per distinct URL ever seen and never shrink — expiry marks an entry
 * stale but nothing was removing it.
 */
const logoCache = new BoundedCache<string, { result: string | null; expiresAt: number }>(256);

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

type PdfAccessSuccess = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  isAdmin: boolean;
  isExhibitorAccess: boolean;
};

type PdfAccessResult =
  | { ok: true; isAdmin: boolean; isExhibitorAccess: boolean }
  | { ok: false; status: 401 | 403 | 500; error: string };

/**
 * Core authorise-a-user-for-a-show's-PDF logic, framework-agnostic and
 * identity-agnostic — takes an already-resolved `{id}` + admin flag rather
 * than reading cookies itself, so it works identically whether the caller
 * derived that identity from `getCurrentUser()`/`auth()` (plain `/api/*`
 * routes — see `authenticatePdfRequest`) or from an already-authenticated
 * tRPC `ctx.session` (documentJobs.request/status — see
 * `resolvePdfAccessForSession`, which also makes this testable via
 * `createTestCaller` without a real cookie session). Both wrap this so the
 * two call shapes can never drift apart.
 */
async function resolvePdfAccessForUser(
  userId: string,
  isAdmin: boolean,
  organisationId: string,
  options?: { showId?: string; format?: string; requireAdmin?: boolean },
): Promise<PdfAccessResult> {
  if (isAdmin) {
    return { ok: true, isAdmin, isExhibitorAccess: false };
  }

  // Admin-only route and the caller is not an admin — stop here. Must come
  // after the isAdmin early-return above and before any membership or
  // catalogue-purchase fallback, both of which would otherwise let a plain
  // org member through.
  if (options?.requireAdmin) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  if (db) {
    // Check org membership (secretary/org member access)
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, userId),
        eq(memberships.organisationId, organisationId),
        eq(memberships.status, 'active')
      ),
    });
    if (membership) {
      return { ok: true, isAdmin: false, isExhibitorAccess: false };
    }

    // No org membership — check exhibitor catalogue purchase
    if (options?.showId) {
      if (options.format && SECRETARY_ONLY_FORMATS.has(options.format)) {
        return { ok: false, status: 403, error: 'Forbidden' };
      }

      const purchased = await hasUserPurchasedCatalogue(db, options.showId, userId);
      if (purchased) {
        return { ok: true, isAdmin: false, isExhibitorAccess: true };
      }
    }

    return { ok: false, status: 403, error: 'Forbidden' };
  }

  // No database handle — we cannot verify org membership, so we cannot
  // authorise. Fail closed: a missing DB must never grant a non-admin access
  // to every organisation's documents. (Every caller currently guards `!db`
  // before reaching here, so this is defence in depth rather than a live path.)
  return { ok: false, status: 500, error: 'Database not available' };
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
): Promise<PdfAccessSuccess | NextResponse> {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';

  const result = await resolvePdfAccessForUser(user.id, isAdmin, organisationId, options);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return { user, isAdmin: result.isAdmin, isExhibitorAccess: result.isExhibitorAccess };
}

/**
 * Same authorisation rules as {@link authenticatePdfRequest}, for tRPC
 * procedures that already have an authenticated `ctx.session` — used by
 * documentJobs.request/status so a catalogue job requested via tRPC is
 * gated identically to one downloaded via the plain /api/catalogue route.
 * `isAdmin` should be `ctx.callerIsAdmin` (the REAL, non-impersonated
 * caller's admin flag — mirrors the route reading the real cookie session's
 * role even while impersonating), and `userId` should be
 * `ctx.session.user.id` (the effective/possibly-impersonated identity —
 * mirrors `getCurrentUser()`). Throws TRPCError instead of returning a
 * NextResponse.
 */
export async function resolvePdfAccessForSession(
  userId: string,
  isAdmin: boolean,
  organisationId: string,
  options?: { showId?: string; format?: string; requireAdmin?: boolean },
): Promise<{ isAdmin: boolean; isExhibitorAccess: boolean }> {
  const result = await resolvePdfAccessForUser(userId, isAdmin, organisationId, options);
  if (!result.ok) {
    const code = result.status === 401 ? 'UNAUTHORIZED' : result.status === 403 ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR';
    throw new TRPCError({ code, message: result.error });
  }
  return { isAdmin: result.isAdmin, isExhibitorAccess: result.isExhibitorAccess };
}
