'use client';

import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-sm space-y-6">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
          <WifiOff className="size-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-bold text-primary">
            You&apos;re offline
          </h1>
          <p className="text-muted-foreground">
            It looks like you&apos;ve lost your internet connection. Check your
            Wi-Fi or mobile data and try again.
          </p>
        </div>
        <Button
          onClick={() => window.location.reload()}
          className="w-full"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
