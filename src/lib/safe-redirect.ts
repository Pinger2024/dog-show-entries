/**
 * One owner for "where may we send someone after they sign in".
 *
 * Bug hunt 2026-09-22: the login form read `?callbackUrl=` and, after a
 * password sign-in, did `window.location.href = callbackUrl` unchecked. A link
 * like `/login?callbackUrl=javascript:…` ran script in Remi's origin with the
 * secretary's fresh session; `?callbackUrl=https://evil.example` sent her to a
 * look-alike page straight after a genuine login. (Google and magic-link
 * sign-in were protected by NextAuth's own same-origin check; the password
 * path bypassed it.)
 *
 * Only a same-site path is allowed: it must start with a single "/" (not "//"
 * or "/\", which browsers treat as another host). An absolute URL is accepted
 * only when its origin is our own, and is reduced to its path. Anything else
 * falls back to `fallback`.
 */
export function safeCallbackUrl(
  raw: string | null | undefined,
  { origin, fallback = '/dashboard' }: { origin?: string; fallback?: string } = {},
): string {
  if (!raw) return fallback;
  const value = raw.trim();
  // Control characters (tabs, newlines) are stripped by URL parsers and can
  // smuggle a scheme or a second slash past a prefix check.
  if (/[\u0000-\u001F\u007F]/.test(value)) return fallback;

  if (value.startsWith('/')) {
    if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
    return value;
  }

  if (origin) {
    try {
      const url = new URL(value);
      if (url.origin === origin) return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      // not a URL — fall through
    }
  }
  return fallback;
}
