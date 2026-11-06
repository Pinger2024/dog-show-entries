/**
 * Where Remi lives — one owner for the site's own origin, so a link in an
 * email, on a password-reset page or in a public API payload can never
 * disagree about it.
 *
 * It was written out three times before this. `server/services/email.ts` and
 * `server/services/password-reset.ts` had the same expression and now read it
 * from here, so nothing about their links changes. The third,
 * `server/trpc/routers/stripe-connect.ts`, reads a DIFFERENT variable with a
 * DIFFERENT default (`NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'`) — a
 * Stripe return URL is not a free edit, so it is deliberately left alone
 * rather than quietly changed here.
 */
export const APP_URL = process.env.NEXTAUTH_URL ?? 'https://remishowmanager.co.uk';

/**
 * An absolute Remi URL for an app-relative path (`/shows/winterfest-2026`).
 * Joins exactly once however the environment variable is written — a
 * trailing slash on `NEXTAUTH_URL` used to produce `https://…//shows/x`.
 */
export function appUrl(path: string): string {
  return join(APP_URL, path);
}

/**
 * The LIVE site, whatever this deployment is — for links a person copies,
 * shares, prints or a search engine indexes. Deliberately not env-driven:
 * a share link or a printed schedule must say remishowmanager.co.uk even
 * when it was produced on demo or localhost, which is what every call site
 * did by hand before this.
 *
 * Use {@link appUrl} instead for a link back into THIS deployment — a
 * password-reset link, an email to a secretary — which must point at demo
 * when it was sent from demo.
 */
export const CANONICAL_ORIGIN = 'https://remishowmanager.co.uk';

/** The bare host, no scheme — for print, where a schedule says "Online entry
 *  at remishowmanager.co.uk/shows/…" rather than showing a URL. */
export const CANONICAL_HOST = 'remishowmanager.co.uk';

/** An absolute live-site URL for an app-relative path. */
export function canonicalUrl(path: string): string {
  return join(CANONICAL_ORIGIN, path);
}

function join(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, '');
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}
