'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
              onClick={() => {
                // Clear service worker cache and hard reload
                if ('caches' in window) {
                  caches.keys().then((names) => {
                    names.forEach((name) => caches.delete(name));
                  });
                }
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then((registrations) => {
                    registrations.forEach((reg) => reg.unregister());
                  });
                }
                window.location.reload();
              }}
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
        </div>
      </body>
    </html>
  );
}
