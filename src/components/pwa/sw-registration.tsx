'use client';

import { useEffect } from 'react';

function isChunkError(msg: string): boolean {
  return (
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  );
}

function handleChunkRecovery() {
  const reloadedKey = 'remi-chunk-reload';
  if (!sessionStorage.getItem(reloadedKey)) {
    sessionStorage.setItem(reloadedKey, '1');
    // Clear all caches before reloading so the fresh page gets fresh assets
    if ('caches' in window) {
      caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
    }
    window.location.reload();
  }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/serwist/sw.js');
    }

    // Clear the reload guard after a successful page load so future deploys
    // can trigger recovery again.
    sessionStorage.removeItem('remi-chunk-reload');

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
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
