'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/serwist/sw.js');
    }

    // Recover from chunk loading failures caused by stale service worker cache
    // after deploys. Detects failed dynamic imports and forces a hard reload.
    const handleError = (event: ErrorEvent) => {
      const msg = event.message || '';
      if (
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module')
      ) {
        const reloadedKey = 'remi-chunk-reload';
        if (!sessionStorage.getItem(reloadedKey)) {
          sessionStorage.setItem(reloadedKey, '1');
          window.location.reload();
        }
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  return null;
}
