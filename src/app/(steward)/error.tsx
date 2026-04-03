'use client';

import { useEffect } from 'react';

/**
 * Steward route group error boundary.
 * SELF-CONTAINED — no shared component imports.
 * If the error is caused by stale chunks, shared imports will also fail,
 * creating a cascade. Everything is inlined here on purpose.
 */
export default function StewardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Steward Error Boundary]', error);
    // Report to server for visibility in Render logs
    try {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundary: 'steward/error.tsx',
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
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      {/* Top header — matches StewardShell */}
      <header className="flex h-14 items-center justify-between border-b px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <a
            href="/"
            className="font-serif text-xl font-bold tracking-tight text-primary no-underline"
          >
            Remi
          </a>
          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
            Steward
          </span>
        </div>
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
              href="/steward"
              className="inline-flex min-h-[2.75rem] items-center justify-center rounded-lg border bg-background px-6 text-sm font-medium hover:bg-accent no-underline text-foreground"
            >
              Go to My Shows
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
