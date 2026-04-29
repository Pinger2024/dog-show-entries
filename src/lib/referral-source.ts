/**
 * Referral-source attribution.
 *
 * Share URLs emitted by the ShowShareDropdown carry a ?src=<channel> query
 * param (whatsapp / facebook / instagram). When an exhibitor lands on a
 * show page from one of those shares we stash the channel in sessionStorage
 * keyed by the show slug, then read it back at checkout time so it can be
 * persisted on the order row.
 *
 * sessionStorage (not localStorage) so the attribution dies when the tab
 * closes — matches how session-level attribution works elsewhere and keeps
 * us out of long-lived tracking territory.
 *
 * Keyed per-show so visiting two shows in one session doesn't clobber
 * each other's source.
 */

const STORAGE_PREFIX = 'remi:referral:';
const MAX_LEN = 32;

/** Scrub the raw `?src=` value — keep it alphanumeric + dash/underscore, cap length */
function normaliseSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const clean = trimmed.replace(/[^a-z0-9_-]/g, '');
  if (!clean) return null;
  return clean.slice(0, MAX_LEN);
}

/**
 * Read `?src=` from the current URL and stash it for this show. Call from a
 * client-side effect on the show page. No-op on the server and no-op if the
 * URL has no `src` param.
 */
export function captureReferralSource(showKey: string) {
  if (typeof window === 'undefined') return;
  try {
    const src = normaliseSource(new URL(window.location.href).searchParams.get('src'));
    if (!src) return;
    window.sessionStorage.setItem(STORAGE_PREFIX + showKey, src);
  } catch {
    // sessionStorage can throw in private mode / disabled storage — silent is fine
  }
}

/** Read the stashed source for this show, if any. Call from checkout code. */
export function readReferralSource(showKey: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(STORAGE_PREFIX + showKey);
  } catch {
    return null;
  }
}
