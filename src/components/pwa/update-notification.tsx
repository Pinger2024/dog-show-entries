'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // New content available — show update prompt
            setShowUpdate(true);
          }
        });
      });
    });
  }, []);

  if (!showUpdate) return null;

  return (
    <div className="fixed left-3 right-3 top-3 z-[60] animate-fade-in sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-lg">
        <RefreshCw className="size-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm">A new version of Remi is available.</p>
        <Button
          size="sm"
          onClick={() => window.location.reload()}
          className="h-8 shrink-0 text-xs"
        >
          Update
        </Button>
      </div>
    </div>
  );
}
