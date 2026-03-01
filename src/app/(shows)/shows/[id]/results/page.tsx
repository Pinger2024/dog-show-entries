'use client';

import { use } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Building2,
  Loader2,
  Trophy,
  Award,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { getPlacementLabel } from '@/lib/placements';
import { Badge } from '@/components/ui/badge';

const placementColors: Record<number, string> = {
  1: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  2: 'bg-gray-100 text-gray-700 border-gray-200',
  3: 'bg-amber-100 text-amber-800 border-amber-200',
  4: 'bg-blue-50 text-blue-700 border-blue-200',
  5: 'bg-purple-50 text-purple-700 border-purple-200',
  6: 'bg-teal-50 text-teal-700 border-teal-200',
  7: 'bg-slate-50 text-slate-600 border-slate-200',
};

export default function LiveResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);

  const { data, isLoading, dataUpdatedAt } =
    trpc.steward.getLiveResults.useQuery(
      { showId },
      { refetchInterval: 10_000 }
    );

  const { data: summary } = trpc.steward.getResultsSummary.useQuery(
    { showId },
    { refetchInterval: 10_000 }
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary/40" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <Trophy className="size-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">Show not found.</p>
        <Link
          href="/shows"
          className="text-sm text-primary underline hover:no-underline"
        >
          Back to shows
        </Link>
      </div>
    );
  }

  const { show, breedGroups } = data;
  const isLive = show.status === 'in_progress';
  const isCompleted = show.status === 'completed';
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="min-h-screen">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.04] to-transparent">
        <div className="relative mx-auto max-w-4xl px-4 pb-6 pt-6 sm:px-6">
          <Link
            href={`/shows/${showId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Show Details
          </Link>

          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              {isLive && (
                <Badge className="bg-green-600 text-xs">
                  <span className="relative mr-1.5 flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-white" />
                  </span>
                  Live Results
                </Badge>
              )}
              {isCompleted && (
                <Badge variant="secondary" className="text-xs">
                  <Trophy className="mr-1 size-3" />
                  Final Results
                </Badge>
              )}
            </div>

            <h1 className="mt-2 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              {show.name} — Results
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-muted-foreground/60" />
                {format(parseISO(show.startDate), 'EEEE d MMMM yyyy')}
              </span>
              {show.venue && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-muted-foreground/60" />
                  {show.venue.name}
                </span>
              )}
              {show.organisation && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-4 text-muted-foreground/60" />
                  {show.organisation.name}
                </span>
              )}
            </div>

            {/* Progress + last updated */}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {summary && (
                <span>
                  {summary.judgedClasses} of {summary.totalClasses} classes
                  judged
                </span>
              )}
              {lastUpdated && (
                <span>Last updated {lastUpdated}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Results content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {breedGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Trophy className="size-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              No results recorded yet.
              {isLive && ' Check back soon — results are being recorded live.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {breedGroups.map((group) => (
              <div key={group.breedName}>
                <h2 className="mb-3 font-serif text-lg font-semibold">
                  {group.breedName}
                </h2>
                <div className="space-y-4">
                  {group.classes.map((cls) => (
                    <div
                      key={cls.classId}
                      className="rounded-lg border bg-white p-4"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        {cls.classNumber != null && (
                          <span className="text-xs font-bold text-muted-foreground">
                            #{cls.classNumber}
                          </span>
                        )}
                        <h3 className="font-semibold text-sm">
                          {cls.className}
                        </h3>
                        {cls.sex && (
                          <Badge
                            variant="outline"
                            className="text-[10px] capitalize"
                          >
                            {cls.sex}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {cls.results.map((result, i) => (
                          <div key={i}>
                            <div className="flex items-center gap-3 text-sm">
                              {result.placement && (
                                <Badge
                                  variant="outline"
                                  className={`w-16 justify-center text-xs font-semibold ${placementColors[result.placement] ?? ''}`}
                                >
                                  {getPlacementLabel(result.placement)}
                                </Badge>
                              )}
                              <span className="font-mono text-xs text-muted-foreground">
                                {result.catalogueNumber ?? '—'}
                              </span>
                              {result.dogId ? (
                                <Link
                                  href={`/dog/${result.dogId}`}
                                  className="flex-1 truncate font-medium text-primary hover:underline"
                                >
                                  {result.dogName}
                                </Link>
                              ) : (
                                <span className="flex-1 truncate font-medium">
                                  {result.dogName}
                                </span>
                              )}
                              {result.specialAward && (
                                <Badge
                                  variant="secondary"
                                  className="shrink-0 text-[10px] bg-amber-50 text-amber-700"
                                >
                                  <Award className="mr-0.5 size-3" />
                                  {result.specialAward}
                                </Badge>
                              )}
                            </div>
                            {result.critiqueText && (
                              <p className="ml-[4.75rem] mt-0.5 text-xs italic text-muted-foreground">
                                {result.critiqueText}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
