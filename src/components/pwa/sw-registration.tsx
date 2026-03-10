'use client';

import { useEffect } from 'react';
import {
  isChunkError,
  clearCachesAndReload,
  RELOAD_GUARD_KEYS,
  RELOAD_GUARD_CLEAR_DELAY_MS,
} from '@/lib/chunk-recovery';

async function handleChunkRecovery() {
  if (!sessionStorage.getItem(RELOAD_GUARD_KEYS.chunk)) {
    sessionStorage.setItem(RELOAD_GUARD_KEYS.chunk, '1');
    await clearCachesAndReload();
  }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/serwist/sw.js');
    }

    // Clear reload guards after the page has been stable for 30 seconds.
    // This delay is critical: if we clear immediately, a chunk error that fires
    // AFTER mount (e.g. during lazy loading) would find the guard cleared and
    // trigger another recovery → reload → clear → loop forever.
    const guardTimer = setTimeout(() => {
      sessionStorage.removeItem(RELOAD_GUARD_KEYS.chunk);
      sessionStorage.removeItem(RELOAD_GUARD_KEYS.error);
      sessionStorage.removeItem(RELOAD_GUARD_KEYS.globalError);
    }, RELOAD_GUARD_CLEAR_DELAY_MS);

    // Recover from chunk loading failures caused by stale service worker cache
    // after deploys. Detects failed dynamic imports and forces a hard reload.
    const handleError = (event: ErrorEvent) => {
      if (isChunkError(event.message || '')) handleChunkRecovery();
    };

    // Dynamic imports reject promises, which may not fire window.error
    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason || '');
      if (isChunkError(msg)) handleChunkRecovery();
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      clearTimeout(guardTimer);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
