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
} as const;

/**
 * How long (ms) to wait after page mount before clearing reload guards.
 * Must be long enough for lazy-loaded chunks to resolve; if we clear
 * too early, a chunk error could re-trigger recovery → infinite loop.
 */
export const RELOAD_GUARD_CLEAR_DELAY_MS = 30_000;

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

/** Clear all browser caches, unregister service workers, and hard-reload. */
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
  window.location.reload();
}
