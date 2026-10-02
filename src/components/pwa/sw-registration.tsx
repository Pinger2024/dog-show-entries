'use client';

import { useEffect } from 'react';
import {
  isChunkError,
  clearCachesAndReload,
  canAutoReload,
  resetAutoReloads,
  RELOAD_GUARD_KEYS,
  RELOAD_GUARD_CLEAR_DELAY_MS,
} from '@/lib/chunk-recovery';

async function handleChunkRecovery() {
  // Hard lifetime cap: once we've auto-reloaded a couple of times without a
  // clean mount, stop — another reload would only feed iOS Safari's "A problem
  // repeatedly occurred" watchdog. The user falls through to the manual
  // "Clear Cache & Reload" button on the error screen instead.
  if (!canAutoReload()) return;
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

    // We mounted cleanly, so any prior recovery reload worked — clear the
    // per-key one-shot guards AND reset the lifetime auto-reload counter so a
    // FUTURE deploy in this same session can recover again.
    //
    // Crucially this is NOT re-armed on a timer any more: the old 30s
    // setTimeout cleared the guards every 30 seconds, so a genuinely persistent
    // chunk error reloaded → cleared → reloaded forever, which is exactly the
    // reload storm that trips Safari's watchdog. The lifetime cap
    // (canAutoReload) now bounds total reloads regardless; clearing on a clean
    // mount is safe because if the mount weren't clean we'd never reach here.
    const guardClearTimer = setTimeout(() => {
      sessionStorage.removeItem(RELOAD_GUARD_KEYS.chunk);
      sessionStorage.removeItem(RELOAD_GUARD_KEYS.error);
      sessionStorage.removeItem(RELOAD_GUARD_KEYS.globalError);
      sessionStorage.removeItem(RELOAD_GUARD_KEYS.react310);
      resetAutoReloads();
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
      clearTimeout(guardClearTimer);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
