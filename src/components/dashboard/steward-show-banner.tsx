'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { Radio, ChevronRight, X } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

/** Convert string | Date to Date (handles superjson serialisation). */
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * A calm, show-specific nudge for steward-role users: on a phone the header's
 * role switch is easy to miss and the generic quick-switch banner disappears
 * once dismissed, leaving a brand-new steward stranded on /dashboard. This
 * points them straight at the show they're stewarding. Dismissible per show.
 */
export function StewardShowBanner() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  // Being *assigned* as a steward is what matters, not the role label — some
  // stewards hold a secretary account (e.g. a club secretary helping in the
  // ring). getMyShows only returns shows they're actually assigned to, so a
  // secretary/admin with no assignment simply gets an empty list (no banner).
  const canSteward = role === 'steward' || role === 'secretary' || role === 'admin';

  const { data: shows } = trpc.steward.getMyShows.useQuery(undefined, {
    enabled: canSteward,
    staleTime: 60_000,
  });

  const [dismissed, setDismissed] = useState<string | null>(null);

  // Nearest upcoming/live assigned show (getMyShows already drops draft/cancelled).
  const show = (shows ?? [])
    .filter((s) => s.status !== 'completed')
    .sort((a, b) => (toDate(a.startDate)?.getTime() ?? 0) - (toDate(b.startDate)?.getTime() ?? 0))[0];

  useEffect(() => {
    if (!show) return;
    setDismissed(localStorage.getItem(`remi-steward-banner-dismissed-${show.id}`));
  }, [show]);

  if (!canSteward || !show || dismissed === show.id) return null;

  const date = toDate(show.startDate);

  function dismiss() {
    if (!show) return;
    localStorage.setItem(`remi-steward-banner-dismissed-${show.id}`, show.id);
    setDismissed(show.id);
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
          <Radio className="size-5 text-blue-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-900">
            You&apos;re stewarding {show.name}
          </p>
          {date && (
            <p className="text-xs text-blue-700/80">
              {format(date, 'EEEE d MMMM')}
            </p>
          )}
          <Link
            href={`/steward/shows/${show.id}`}
            className="mt-2.5 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Open your steward page
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <button
          onClick={dismiss}
          className="rounded-full p-1 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-700"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
