'use client';

import { useEffect } from 'react';

/**
 * Secretary route group error boundary.
 * SELF-CONTAINED — no shared component imports.
 * If the error is caused by stale chunks, shared imports will also fail,
 * creating a cascade. Everything is inlined here on purpose.
 */
export default function SecretaryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Secretary Error Boundary]', error);
    // Report to server for visibility in Render logs
    try {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundary: 'secretary/error.tsx',
          message: error.message,
          stack: error.stack?.slice(0, 2000),
          digest: error.digest,
          url: window.location.href,
        }),
      }).catch(() => {});
    } catch {
      // Best-effort reporting
    }
  }, [error.message, error.digest]);

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {/* Desktop sidebar placeholder — matches SecretaryShell */}
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:flex md:flex-col">
        <div className="flex h-[4.5rem] items-center border-b px-5">
          <a
            href="/"
            className="font-serif text-[1.375rem] font-bold tracking-tight text-primary no-underline"
          >
            Remi
          </a>
        </div>
        <div className="flex-1" />
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-16 items-center border-b px-3 sm:px-4 md:hidden">
          <a
            href="/"
            className="font-serif text-xl font-bold tracking-tight text-primary no-underline"
          >
            Remi
          </a>
        </header>

        {/* Error content */}
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            <div className="text-5xl font-bold text-muted-foreground/30">!</div>
            <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              An unexpected error occurred. Try again, or go back to your shows.
            </p>
            {error.message && (
              <p className="mt-4 break-all rounded bg-muted px-3 py-2 font-mono text-[0.6875rem] text-muted-foreground">
                {error.message}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                onClick={reset}
                className="inline-flex min-h-[2.75rem] items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Try Again
              </button>
              <a
                href="/secretary/shows"
                className="inline-flex min-h-[2.75rem] items-center justify-center rounded-lg border bg-background px-6 text-sm font-medium hover:bg-accent no-underline text-foreground"
              >
                Go to Shows
              </a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
