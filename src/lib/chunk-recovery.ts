/**
 * Shared chunk error recovery utilities used by:
 * - sw-registration.tsx (window error/rejection handler)
 *
 * NOTE: error.tsx and global-error.tsx INLINE their own copies of
 * these utilities.  Error boundaries must never import shared chunks
 * that could be stale after a deploy.
 */

/** sessionStorage keys used as one-shot guards to prevent infinite reload loops. */
export const RELOAD_GUARD_KEYS = {
  chunk: 'remi-chunk-reload',
  error: 'remi-error-reload',
  globalError: 'remi-global-error-reload',
  react310: 'remi-react-310-retry',
} as const;

/**
 * Hard lifetime cap on AUTOMATIC recovery reloads, plus the localStorage
 * counter that tracks them. The per-key sessionStorage guards above are
 * one-shots, but there are four of them and they used to be re-armed every
 * 30s — so a genuinely persistent error could reload several times in quick
 * succession and trip iOS Safari's "A problem repeatedly occurred" watchdog.
 *
 * This counter is the backstop: it persists across reloads (localStorage, not
 * sessionStorage) and `canAutoReload()` refuses any further automatic reload
 * once the cap is reached, so recovery can never become a storm. After the cap
 * the user falls through to the manual "Clear Cache & Reload" button. The
 * counter is reset on a clean, error-free mount (see resetAutoReloads).
 *
 * Inlined copies of this logic live in error.tsx / global-error.tsx (which must
 * never import shared chunks); keep the key string and cap in sync with them.
 */
export const AUTO_RELOAD_COUNT_KEY = 'remi-auto-reloads-total';
export const AUTO_RELOAD_CAP = 2;

/**
 * How long (ms) a page must stay mounted and error-free before we treat the
 * recovery as successful and clear the per-key one-shot guards + the lifetime
 * auto-reload counter (so a FUTURE deploy in the same session can recover
 * again). This is NOT a blind re-arm: a page that's crash-looping never stays
 * mounted this long (its effect cleanup clears the timer on unmount), so the
 * lifetime cap still bounds any rapid storm.
 */
export const RELOAD_GUARD_CLEAR_DELAY_MS = 30_000;

/** Current automatic-reload count this device has done without a clean mount. */
export function autoReloadCount(): number {
  try {
    return Number(localStorage.getItem(AUTO_RELOAD_COUNT_KEY) || '0') || 0;
  } catch {
    return 0;
  }
}

/** Whether another AUTOMATIC recovery reload is still allowed (under the cap). */
export function canAutoReload(): boolean {
  return autoReloadCount() < AUTO_RELOAD_CAP;
}

/** Clear the reload counter once a page has mounted cleanly — recovery worked. */
export function resetAutoReloads() {
  try {
    localStorage.removeItem(AUTO_RELOAD_COUNT_KEY);
  } catch {
    // private mode — nothing to clear
  }
}

/** Detect chunk/module loading errors from error messages. */
export function isChunkError(msg: string): boolean {
  return (
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  );
}

/** Clear all browser caches, unregister service workers, and hard-reload.
 *  Counts the reload against the lifetime cap and cache-busts the navigation so
 *  iOS Safari can't re-serve a poisoned HTTP/SW cache after the unregister. */
export async function clearCachesAndReload() {
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
  } catch {
    // Best-effort — proceed to reload even if cleanup fails
  }
  try {
    localStorage.setItem(AUTO_RELOAD_COUNT_KEY, String(autoReloadCount() + 1));
  } catch {
    // private mode — counter unavailable, the one-shot guards still bound us
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_r', Date.now().toString());
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}
