'use client';

import { useEffect, useState } from 'react';

// ─── Inlined chunk recovery ──────────────────────────────────────
// global-error.tsx is the ABSOLUTE last resort.  It renders OUTSIDE
// the root layout (no Tailwind, no providers, no shared chunks).
// Every helper is inlined — zero external imports beyond React.
// ─────────────────────────────────────────────────────────────────

const RELOAD_GUARD_KEY = 'remi-global-error-reload';

function isChunkError(msg: string): boolean {
  return (
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  );
}

async function clearCachesAndReload() {
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

// ─── Component ───────────────────────────────────────────────────

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [autoRecovering, setAutoRecovering] = useState(false);

  useEffect(() => {
    // Report to server so we can see client errors in Render logs
    try {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundary: 'global-error.tsx',
          message: error.message,
          stack: error.stack?.slice(0, 2000),
          digest: error.digest,
          url: window.location.href,
        }),
      }).catch(() => {});
    } catch {
      // Best-effort reporting
    }

    if (isChunkError(error.message || '')) {
      if (!sessionStorage.getItem(RELOAD_GUARD_KEY)) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
        setAutoRecovering(true);
        clearCachesAndReload();
      }
    }

    // React bug #310 "Rendered more hooks than during the previous render"
    // is a known transient error in React's router. Auto-retry silently.
    // https://github.com/facebook/react/issues/33580
    if (error.message?.includes('#310') || error.message?.includes('more hooks')) {
      reset();
    }
  }, [error, reset]);

  if (autoRecovering) {
    return (
      <html lang="en">
        <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '100vh',
              padding: '1rem',
              textAlign: 'center',
            }}
          >
            <h1 style={{ fontSize: '3rem', fontWeight: 700, color: '#2D5F3F', margin: 0 }}>
              Remi
            </h1>
            <p style={{ fontSize: '1.125rem', marginTop: '1rem', color: '#333' }}>
              Updating — one moment...
            </p>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '1rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '3rem', fontWeight: 700, color: '#2D5F3F', margin: 0 }}>
            Remi
          </h1>
          <p style={{ fontSize: '1.125rem', marginTop: '1rem', color: '#333' }}>
            Something went wrong loading this page.
          </p>
          <p style={{ fontSize: '0.875rem', color: '#888', maxWidth: '400px', marginTop: '0.5rem' }}>
            This usually fixes itself with a refresh. If it keeps happening, try clearing your
            browser cache or removing and re-adding the app.
          </p>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={reset}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#2D5F3F',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.9375rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              onClick={clearCachesAndReload}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#fff',
                color: '#333',
                border: '1px solid #ddd',
                borderRadius: '0.5rem',
                fontSize: '0.9375rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Clear Cache &amp; Reload
            </button>
          </div>
          {error.message && (
            <p style={{
              marginTop: '1.5rem',
              maxWidth: '500px',
              padding: '0.5rem 0.75rem',
              background: '#f5f5f5',
              borderRadius: '0.375rem',
              fontFamily: 'monospace',
              fontSize: '0.6875rem',
              color: '#888',
              wordBreak: 'break-all',
            }}>
              {error.message}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
