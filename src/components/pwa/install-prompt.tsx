'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show on desktop-sized screens
    if (window.matchMedia('(min-width: 768px)').matches) return;

    // Don't show if already installed as standalone
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Don't show if recently dismissed
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_DURATION_MS) return;

    function handlePrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-3 right-3 z-[60] animate-fade-in-up sm:bottom-6 sm:left-auto sm:right-4 sm:max-w-sm md:bottom-6">
      <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-lg">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Download className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium">Add Remi to your home screen</p>
          <p className="text-xs text-muted-foreground">
            Quick access to shows and entries, even with spotty signal ringside.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleInstall} className="h-8 text-xs">
              Install
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="h-8 text-xs"
            >
              Not now
            </Button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
