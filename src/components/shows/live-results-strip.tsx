'use client';

import Link from 'next/link';
import { ChevronRight, Trophy } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { showResultsHref } from '@/lib/show-status';
import { cn } from '@/lib/utils';

/**
 * "Live now" — a big red banner for each show running today, straight to its
 * results (Mandy, 5 Oct 2026: people couldn't find the live results, because
 * Find a Show hid a running show unless you chose "In progress").
 *
 * Sits at the top of Find a Show, the dashboard and the home page. With
 * `quietLink`, a day with nothing on shows a small "Looking for results?" link to
 * the Results page instead of nothing.
 */
export function LiveResultsStrip({ quietLink = false, className }: { quietLink?: boolean; className?: string }) {
  const { data } = trpc.shows.results.useQuery(undefined, {
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  if (!data) return null;

  if (data.live.length === 0) {
    if (!quietLink || data.recent.length === 0) return null;
    return (
      <Link
        href="/results"
        className={cn(
          'flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-base transition-colors hover:bg-accent',
          className,
        )}
      >
        <Trophy className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-foreground">
          Looking for results? <span className="font-semibold text-primary">See show results</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Link>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {data.live.map((show) => (
        <LiveShowCard key={show.id} show={show} />
      ))}
    </div>
  );
}

export function LiveShowCard({
  show,
}: {
  show: { id: string; slug: string | null; name: string; clubName: string | null };
}) {
  return (
    <Link
      href={showResultsHref(show)}
      className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-red-600 px-4 py-3.5 text-white shadow-md transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-red-300"
    >
      <span className="relative flex size-3 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex size-3 rounded-full bg-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-[0.18em] opacity-90">Live now</span>
        <span className="block text-base font-bold leading-snug sm:text-lg">{show.clubName ?? show.name}</span>
        {show.clubName && <span className="block text-sm leading-snug opacity-90">{show.name}</span>}
      </span>
      <span className="shrink-0 text-sm font-semibold">
        See results
        <ChevronRight className="ml-0.5 inline size-4" />
      </span>
    </Link>
  );
}
