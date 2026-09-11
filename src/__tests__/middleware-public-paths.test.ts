import { describe, it, expect } from 'vitest';
import { config, isPublicRoute } from '@/middleware';

/**
 * Regression guard: paths that must reach Next.js untouched by the auth middleware.
 *
 * History:
 * - 2026-04-25 — `.well-known` was being redirected to /login, breaking Apple Pay
 *   domain verification.
 * - 2026-04-27 — `sitemap.xml` and `robots.txt` were being redirected to /login,
 *   leaving Search Console with 1 sitemap error and Googlebot unable to read
 *   robots.txt at all.
 *
 * The matcher uses a negative lookahead — paths matching the lookahead are
 * EXCLUDED from middleware. This test asserts each must-exclude path is in fact
 * excluded by compiling the matcher regex and running it.
 */
describe('middleware matcher excludes SEO/well-known/static paths', () => {
  const matcher = Array.isArray(config.matcher) ? config.matcher[0] : config.matcher;

  // Convert Next.js path-to-regexp syntax into a real RegExp. The matcher uses
  // the form `/((?!a|b|c).*)` which is already valid JS regex.
  const re = new RegExp(`^${matcher}$`);

  // Paths that MUST bypass the middleware (return false from the matcher).
  const mustBypass = [
    '/sitemap.xml',
    '/robots.txt',
    '/.well-known/apple-developer-merchantid-domain-association',
    '/.well-known/security.txt',
    '/favicon.ico',
    '/manifest.json',
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/icons/icon-192.png',
    '/apple-touch-icon.png',
  ];

  // Paths that MUST go through the middleware (so auth redirects keep working).
  const mustMatch = [
    '/',
    '/dashboard',
    '/secretary/shows',
    '/api/trpc/test',
    '/shows/abc-123',
    '/login',
  ];

  for (const p of mustBypass) {
    it(`excludes ${p}`, () => {
      expect(re.test(p)).toBe(false);
    });
  }

  for (const p of mustMatch) {
    it(`runs middleware on ${p}`, () => {
      expect(re.test(p)).toBe(true);
    });
  }
});

/**
 * Judge critique upload (2026-07-31): the judge never logs in — the review
 * page and its upload route are authenticated purely by the magic-link
 * token, so they must be public prefixes, not just excluded from the
 * matcher above. Regression guard for the "results-approval route missing
 * from the allowlist" bug this feature was told not to repeat.
 */
describe('isPublicRoute allows the token-gated critique pages', () => {
  const mustBePublic = [
    '/critiques/11111111-1111-1111-1111-111111111111',
    '/api/critique-upload/11111111-1111-1111-1111-111111111111',
  ];

  for (const p of mustBePublic) {
    it(`treats ${p} as public (no login redirect)`, () => {
      expect(isPublicRoute(p)).toBe(true);
    });
  }

  it('still protects the secretary critiques page', () => {
    expect(isPublicRoute('/secretary/shows/abc-123/critiques')).toBe(false);
  });
});

/**
 * /api/health (2026-08-26): an unauthenticated liveness/readiness probe for
 * the render-job acceptance rehearsal (curl it every second while a worker
 * renders, to prove the web process stays up). Caught live during that
 * rehearsal — without this, the middleware redirected it to /login (a 307,
 * not the 200 the probe needs), which would have made every health check
 * during the rehearsal look like a false failure.
 */
describe('isPublicRoute allows the unauthenticated health probe', () => {
  it('treats /api/health as public (no login redirect)', () => {
    expect(isPublicRoute('/api/health')).toBe(true);
  });
});
