'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ChevronRight, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { showResultsHref } from '@/lib/show-status';
import { LiveShowCard } from '@/components/shows/live-results-strip';
import { SE_H } from '@/components/show-experience/tokens';
import { cn } from '@/lib/utils';

/**
 * Results (Mandy, 5 Oct 2026): one place to find a show's results, without
 * knowing which filter to choose on Find a Show. Shows running today come first
 * in red, then every show with results to look back at, newest first.
 */
export function ResultsHubClient() {
  const { data, isLoading, isError } = trpc.shows.results.useQuery(undefined, {
    refetchInterval: 2 * 60_000,
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-8 sm:pt-12">
      <h1 className={cn(SE_H, 'font-serif text-3xl text-foreground sm:text-4xl')}>Results</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
        Live results from shows running today, and the results of shows already held. Tap a show to see its
        results.
      </p>

      {isLoading && (
        <div className="mt-10 flex justify-center">
          <Loader2 className="size-8 animate-spin text-primary/40" />
        </div>
      )}

      {isError && <p className="mt-8 text-base text-foreground">Sorry, something went wrong. Please try again.</p>}

      {data && (
        <>
          <section className="mt-8" aria-labelledby="live-now">
            <h2 id="live-now" className="text-lg font-bold text-foreground">
              Live now
            </h2>
            {data.live.length > 0 ? (
              <div className="mt-3 space-y-3">
                {data.live.map((show) => (
                  <LiveShowCard key={show.id} show={show} />
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border bg-muted/40 p-4">
                <p className="text-base text-foreground">There are no shows on Remi today.</p>
                {data.next && (
                  <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
                    Next is <span className="font-semibold text-foreground">{data.next.clubName ?? data.next.name}</span>{' '}
                    on {format(parseISO(data.next.startDate), 'EEEE d MMMM')}. Its results will appear here on the day.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="mt-10" aria-labelledby="recent-results">
            <h2 id="recent-results" className="text-lg font-bold text-foreground">
              Recent results
            </h2>
            {data.recent.length === 0 ? (
              <p className="mt-3 text-base text-muted-foreground">No results yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.recent.map((show) => {
                  const start = parseISO(show.startDate);
                  return (
                    <li key={show.id}>
                      <Link
                        href={showResultsHref(show)}
                        className="flex items-center gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <div className="flex w-[58px] shrink-0 flex-col items-center rounded-xl bg-muted py-2">
                          <span className="text-2xl font-bold leading-none text-foreground">{format(start, 'd')}</span>
                          <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                            {format(start, 'MMM')}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-lg font-semibold leading-snug text-foreground">
                            {show.clubName ?? show.name}
                          </p>
                          {show.clubName && (
                            <p className="mt-0.5 break-words text-base leading-snug text-muted-foreground">{show.name}</p>
                          )}
                        </div>
                        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
