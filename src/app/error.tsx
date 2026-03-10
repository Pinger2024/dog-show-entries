'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

// ─── Inlined chunk recovery ──────────────────────────────────────
// Error boundaries are the LAST LINE OF DEFENSE.  They must NEVER
// import from shared chunks that could themselves be stale/missing
// after a deploy.  Every helper is inlined here on purpose.
// ─────────────────────────────────────────────────────────────────

const RELOAD_GUARD_KEY = 'remi-error-reload';

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

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [autoRecovering, setAutoRecovering] = useState(false);

  useEffect(() => {
    console.error('Unhandled error:', error);

    if (isChunkError(error.message || '')) {
      if (!sessionStorage.getItem(RELOAD_GUARD_KEY)) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
        setAutoRecovering(true);
        clearCachesAndReload();
      }
    }
  }, [error]);

  if (autoRecovering) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="font-serif text-3xl font-bold text-primary">Remi</h1>
        <p className="mt-4 text-lg">Updating — one moment...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-6xl font-bold text-primary">500</h1>
      <p className="mt-4 text-xl font-medium">Something went wrong</p>
      <p className="mt-2 max-w-md text-muted-foreground">
        An unexpected error occurred. Please try again or contact support if the
        problem persists.
      </p>
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>Try Again</Button>
        <Button variant="outline" onClick={() => clearCachesAndReload()}>
          Clear Cache &amp; Reload
        </Button>
      </div>
    </div>
  );
}
