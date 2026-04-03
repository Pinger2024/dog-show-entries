'use client';

import { use, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Building2,
  Loader2,
  Trophy,
  Award,
  Share2,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { getPlacementLabel, placementColors, achievementLabels } from '@/lib/placements';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Share via native share sheet on mobile, copy to clipboard on desktop */
async function shareOrCopy({ title, text, url }: { title: string; text: string; url: string }) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (e) {
      // User cancelled or share failed — fall through to clipboard
      if ((e as Error).name === 'AbortError') return;
    }
  }
  // Fallback: copy link to clipboard
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast.success('Copied to clipboard — paste into WhatsApp, Facebook, etc.');
  } catch {
    toast.error('Could not copy to clipboard');
  }
}

function ShareButton({
  title,
  text,
  hash,
  className,
  size = 'sm',
}: {
  title: string;
  text: string;
  hash?: string;
  className?: string;
  size?: 'sm' | 'icon';
}) {
  const pathname = usePathname();
  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${pathname}`
    : '';
  const url = hash ? `${baseUrl}#${hash}` : baseUrl;

  return (
    <Button
      variant="ghost"
      size={size}
      className={`min-h-[2.75rem] text-muted-foreground hover:text-primary ${className ?? ''}`}
      onClick={() => shareOrCopy({ title, text, url })}
    >
      <Share2 className="size-4" />
      {size !== 'icon' && <span className="hidden sm:inline">Share</span>}
    </Button>
  );
}

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

  const { data: achievements } =
    trpc.steward.getPublicShowAchievements.useQuery(
      { showId },
      { refetchInterval: 10_000 }
    );

  // Scroll to hash anchor on mount (for deep-linked shares)
  useEffect(() => {
    if (!data || data.breedGroups.length === 0) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    // Small delay to let the DOM render
    const timer = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(timer);
  }, [data]);

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
  const isPublished = !!show.resultsPublishedAt;
  const isUnpublished = 'unpublished' in data && data.unpublished;

  // Group achievements by type for display
  const showLevelTypes = ['best_in_show', 'reserve_best_in_show', 'best_puppy_in_show', 'best_long_coat_in_show'];
  const breedLevelTypes = [
    'best_of_breed', 'best_puppy_in_breed', 'best_veteran_in_breed',
    'dog_cc', 'reserve_dog_cc', 'bitch_cc', 'reserve_bitch_cc',
    'best_puppy_dog', 'best_puppy_bitch',
    'best_long_coat_dog', 'best_long_coat_bitch',
    'cc', 'reserve_cc',
  ];
  const showAwards = (achievements ?? []).filter((a) =>
    showLevelTypes.includes(a.type)
  );
  const breedAwards = (achievements ?? []).filter((a) =>
    breedLevelTypes.includes(a.type)
  );
  const breedAwardsByBreed = new Map<string, typeof breedAwards>();
  for (const a of breedAwards) {
    const breedName = a.dog?.breed?.name ?? 'Unknown';
    if (!breedAwardsByBreed.has(breedName)) breedAwardsByBreed.set(breedName, []);
    breedAwardsByBreed.get(breedName)!.push(a);
  }
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Build share text for show-level awards
  const showAwardsShareText = showAwards.length > 0
    ? showAwards.map((a) => {
        const label = achievementLabels[a.type] ?? a.type;
        const dog = a.dog?.registeredName ?? 'TBC';
        const breed = a.dog?.breed?.name ? ` (${a.dog.breed.name})` : '';
        return `${label}: ${dog}${breed}`;
      }).join('\n')
    : '';

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
              {isPublished && (
                <Badge className="bg-green-600 text-xs">
                  Published Results
                </Badge>
              )}
              {isLive && !isPublished && (
                <Badge className="bg-green-600 text-xs">
                  <span className="relative mr-1.5 flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-white" />
                  </span>
                  Live Results
                </Badge>
              )}
              {isCompleted && !isPublished && (
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
        {isUnpublished ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Trophy className="size-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              {isLive
                ? 'Results are being recorded and will be published after judging is complete.'
                : 'Results are being finalised and will be published shortly.'}
            </p>
          </div>
        ) : breedGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Trophy className="size-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              No results recorded yet.
              {isLive && ' Check back soon — results are being recorded live.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Show-level awards (BIS/RBIS/BPS) */}
            {showAwards.length > 0 && (
              <div id="show-awards" className="rounded-lg border border-amber-200 bg-gradient-to-b from-amber-50/80 to-amber-50/30 p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="size-5 text-amber-600" />
                    <h2 className="font-serif text-lg font-semibold text-amber-900">
                      Show Awards
                    </h2>
                  </div>
                  <ShareButton
                    title={`${show.name} — Show Awards`}
                    text={`Show Awards at ${show.name}\n\n${showAwardsShareText}`}
                    hash="show-awards"
                    size="sm"
                  />
                </div>
                <div className="space-y-2">
                  {showAwards.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                      <Badge className="w-auto sm:w-44 justify-center bg-amber-100 text-amber-800 border-amber-300 text-xs font-semibold whitespace-nowrap">
                        {achievementLabels[a.type] ?? a.type}
                      </Badge>
                      {a.dog ? (
                        <Link
                          href={`/dog/${a.dogId}`}
                          className="font-medium text-sm text-primary hover:underline"
                        >
                          {a.dog.registeredName}
                        </Link>
                      ) : (
                        <span className="font-medium text-sm">Unknown dog</span>
                      )}
                      {a.dog?.breed && (
                        <span className="text-xs text-muted-foreground">
                          ({a.dog.breed.name})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {breedGroups.map((group) => {
              const breedSlug = slugify(group.breedName);
              const breedAwardsForGroup = breedAwardsByBreed.get(group.breedName);

              // Build share text for this breed
              const topResults = group.classes
                .flatMap((cls) =>
                  cls.results
                    .filter((r) => r.placement && r.placement <= 3)
                    .map((r) => `${getPlacementLabel(r.placement!)}: ${r.dogName}${cls.className ? ` (${cls.className})` : ''}`)
                )
                .slice(0, 6);

              const breedShareText = [
                `${group.breedName} results at ${show.name}`,
                '',
                ...(breedAwardsForGroup?.map((a) =>
                  `${achievementLabels[a.type] ?? a.type}: ${a.dog?.registeredName ?? 'TBC'}`
                ) ?? []),
                ...(breedAwardsForGroup?.length ? [''] : []),
                ...topResults,
              ].join('\n');

              return (
                <div key={group.breedName} id={`breed-${breedSlug}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-serif text-lg font-semibold">
                      {group.breedName}
                    </h2>
                    <ShareButton
                      title={`${group.breedName} — ${show.name}`}
                      text={breedShareText}
                      hash={`breed-${breedSlug}`}
                    />
                  </div>

                  {/* Breed-level awards (BOB/BPB/BVB) */}
                  {breedAwardsForGroup && breedAwardsForGroup.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5">
                      {breedAwardsForGroup.map((a) => (
                        <div key={a.id} className="flex items-center gap-1.5 text-sm">
                          <Award className="size-4 text-amber-500" />
                          <span className="text-xs font-medium text-muted-foreground">
                            {achievementLabels[a.type] ?? a.type}:
                          </span>
                          {a.dog ? (
                            <Link
                              href={`/dog/${a.dogId}`}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              {a.dog.registeredName}
                            </Link>
                          ) : (
                            <span className="text-xs font-medium">Unknown</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-4">
                    {group.classes.map((cls) => (
                      <div
                        key={cls.classId}
                        id={`class-${cls.classId}`}
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
                              className="text-xs capitalize"
                            >
                              {cls.sex}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            ({cls.dogsForward} forward)
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {cls.results.map((result) => (
                            <div key={result.entryClassId}>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-sm">
                                {result.placement && (
                                  <Badge
                                    variant="outline"
                                    className={`w-auto sm:w-16 justify-center text-xs font-semibold whitespace-nowrap ${placementColors[result.placement] ?? ''}`}
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
                                    className="shrink-0 text-xs bg-amber-50 text-amber-700"
                                  >
                                    <Award className="mr-0.5 size-3" />
                                    {result.specialAward}
                                  </Badge>
                                )}
                              </div>
                              {result.winnerPhotoUrl && result.placement === 1 && (
                                <div className="mt-1.5 ml-[4.75rem]">
                                  <img
                                    src={result.winnerPhotoUrl}
                                    alt={`${result.dogName} — 1st place`}
                                    className="h-20 w-auto rounded-lg object-cover ring-1 ring-border/40 sm:h-24"
                                  />
                                </div>
                              )}
                              {result.critiqueText && (
                                <div className="ml-[4.75rem] mt-1.5 rounded-lg border-l-2 border-gold/30 bg-muted/50 px-3 py-2">
                                  <p className="text-sm italic leading-relaxed text-muted-foreground">
                                    &ldquo;{result.critiqueText}&rdquo;
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
