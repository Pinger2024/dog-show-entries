'use client';

import { useEffect } from 'react';

/**
 * Auth route group error boundary.
 * SELF-CONTAINED — no shared component imports.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Auth Error Boundary]', error);
    try {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundary: '(auth)/error.tsx',
          message: error.message,
          stack: error.stack?.slice(0, 2000),
          digest: error.digest,
          url: window.location.href,
        }),
      }).catch(() => {});
    } catch {
      // Best-effort reporting
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <a
          href="/"
          className="font-serif text-2xl font-bold tracking-tight text-primary no-underline"
        >
          Remi
        </a>
        <div className="mt-8 text-5xl font-bold text-muted-foreground/30">!</div>
        <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          There was a problem loading this page. Please try again.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={reset}
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-lg border bg-background px-6 text-sm font-medium hover:bg-accent no-underline text-foreground"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
