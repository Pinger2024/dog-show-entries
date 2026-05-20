import { describe, it, expect } from 'vitest';
import { config } from '@/middleware';

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
