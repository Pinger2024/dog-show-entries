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

async function handleChunkRecovery() {
  const reloadedKey = 'remi-chunk-reload';
  if (!sessionStorage.getItem(reloadedKey)) {
    sessionStorage.setItem(reloadedKey, '1');
    // Clear all caches and unregister SW before reloading
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
    window.location.reload();
  }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/serwist/sw.js');
    }

    // Clear all reload guards after a successful page load so future deploys
    // can trigger recovery again.
    sessionStorage.removeItem('remi-chunk-reload');
    sessionStorage.removeItem('remi-error-reload');
    sessionStorage.removeItem('remi-global-error-reload');

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
