'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  isChunkError,
  clearCachesAndReload,
  RELOAD_GUARD_KEYS,
} from '@/lib/chunk-recovery';

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

    // Auto-recover chunk errors: clear caches + SW and reload.
    // Guard prevents infinite reload loop.
    if (isChunkError(error.message || '')) {
      if (!sessionStorage.getItem(RELOAD_GUARD_KEYS.error)) {
        sessionStorage.setItem(RELOAD_GUARD_KEYS.error, '1');
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
