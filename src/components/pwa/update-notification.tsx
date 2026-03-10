'use client';

import { useEffect, useState, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Reload when a new SW takes over (after SKIP_WAITING)
    const onControllerChange = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let registration: ServiceWorkerRegistration | null = null;
    let trackedWorker: ServiceWorker | null = null;

    const onStateChange = () => {
      if (
        trackedWorker?.state === 'installed' &&
        navigator.serviceWorker.controller
      ) {
        waitingWorkerRef.current = trackedWorker;
        setShowUpdate(true);
      }
    };

    const onUpdateFound = () => {
      const newWorker = registration?.installing;
      if (!newWorker) return;
      // Clean up previous worker listener if any
      if (trackedWorker) trackedWorker.removeEventListener('statechange', onStateChange);
      trackedWorker = newWorker;
      newWorker.addEventListener('statechange', onStateChange);
    };

    navigator.serviceWorker.ready.then((reg) => {
      registration = reg;

      // Check if there's already a waiting worker (e.g. from a previous visit)
      if (reg.waiting) {
        waitingWorkerRef.current = reg.waiting;
        setShowUpdate(true);
      }

      reg.addEventListener('updatefound', onUpdateFound);
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (registration) registration.removeEventListener('updatefound', onUpdateFound);
      if (trackedWorker) trackedWorker.removeEventListener('statechange', onStateChange);
    };
  }, []);

  function handleUpdate() {
    // Tell the waiting SW to activate, which triggers controllerchange → reload
    waitingWorkerRef.current?.postMessage({ type: 'SKIP_WAITING' });
  }

  if (!showUpdate) return null;

  return (
    <div className="fixed left-3 right-3 top-3 z-[60] animate-fade-in sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-lg">
        <RefreshCw className="size-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm">A new version of Remi is available.</p>
        <Button
          size="sm"
          onClick={handleUpdate}
          className="h-8 shrink-0 text-xs"
        >
          Update
        </Button>
      </div>
    </div>
  );
}
