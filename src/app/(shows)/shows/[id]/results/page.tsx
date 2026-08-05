'use client';

import { use, useCallback, useEffect, useState } from 'react';
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
  Quote,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { getPlacementLabel, placementColors, achievementLabels } from '@/lib/placements';
import { computeSvClassRatings } from '@/lib/sv-grading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SE_H } from '@/components/show-experience/tokens';
import { cn } from '@/lib/utils';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const CRITIQUE_OVERVIEW_COLLAPSE_LENGTH = 320;

/** A published judge's opening remarks — collapsed by default when long so
 *  it doesn't push the actual results below the fold. */
function JudgeCritiqueOverview({ judgeName, overviewText }: { judgeName: string; overviewText: string }) {
  const isLong = overviewText.length > CRITIQUE_OVERVIEW_COLLAPSE_LENGTH;
  const [expanded, setExpanded] = useState(!isLong);

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <Quote className="size-4 text-primary/60" />
        <h2 className={cn(SE_H, 'text-base sm:text-lg')}>Judge&apos;s Critique — {judgeName}</h2>
      </div>
      <p className={cn('whitespace-pre-line text-sm leading-relaxed text-muted-foreground', !expanded && 'line-clamp-4')}>
        {overviewText}
      </p>
      {isLong && (
        <button
          type="button"
          className="mt-2 flex min-h-[2.75rem] items-center gap-1 text-sm text-primary hover:underline sm:min-h-0"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
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

  const { show, breedGroups, critiqueOverviews } = data;
  const isLive = show.status === 'in_progress';
  const isCompleted = show.status === 'completed';
  const isPublished = !!show.resultsPublishedAt;
  const isUnpublished = 'unpublished' in data && data.unpublished;
  // SV/WUSV regionals show a grade+rank rating (V1, SG2, VP1) instead of
  // plain placements (Amanda 2026-05-28).
  const isWusv = (show as { showRuleset?: string }).showRuleset === 'wusv';

  // SV/WUSV regionals have only 4 top awards (no BoB/CC/BIS). Show those
  // in their own block and suppress the shared Best Awards block — their four
  // types aren't in NAME_TO_TYPE, so routing them through the secretary's
  // configured order would drop them (Amanda 2026-05-28).
  const svAwardOrder = ['most_promising_young_dog', 'most_promising_young_bitch', 'best_dog', 'best_bitch'];
  const svAwards = isWusv
    ? svAwardOrder
        .map((t) => (achievements ?? []).find((a) => a.type === t))
        .filter((a): a is NonNullable<typeof a> => !!a)
    : [];
  // Best Awards, in the secretary's configured order (server-sorted) — every
  // achievement the show recorded, never gated by a hardcoded type list.
  const bestAwards = isWusv ? [] : (achievements ?? []);
  // Per-breed strips only make sense on genuine all-breed shows — for the
  // single-breed shows this page mostly serves, the top block IS the story.
  const breedAwardsByBreed = new Map<string, typeof bestAwards>();
  if (breedGroups.length > 1) {
    for (const a of bestAwards) {
      const breedName = a.dog?.breed?.name ?? 'Unknown';
      if (!breedAwardsByBreed.has(breedName)) breedAwardsByBreed.set(breedName, []);
      breedAwardsByBreed.get(breedName)!.push(a);
    }
  }
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Build share text for the Best Awards block
  const bestAwardsShareText = bestAwards.length > 0
    ? bestAwards.map((a) => {
        const label = a.awardName ?? achievementLabels[a.type] ?? a.type;
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
                <Badge className="bg-primary text-xs">
                  Published Results
                </Badge>
              )}
              {isLive && !isPublished && (
                <Badge className="bg-primary text-xs">
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

            <h1 className={cn(SE_H, 'mt-2 text-2xl sm:text-3xl')}>
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
            {/* Judge's opening remarks — only for critique documents the
                secretary has explicitly published (see critiques.publish).
                Shown above the class results per the design. */}
            {critiqueOverviews.length > 0 && (
              <div className="space-y-4">
                {critiqueOverviews.map((c, i) => (
                  <JudgeCritiqueOverview key={`${c.judgeName}-${i}`} judgeName={c.judgeName} overviewText={c.overviewText} />
                ))}
              </div>
            )}

            {/* SV/WUSV regional top awards — the only 4 (no BoB/CC/BIS) */}
            {svAwards.length > 0 && (
              <div id="top-awards" className="rounded-lg border border-se-honey-line bg-se-honey-soft p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Trophy className="size-5 text-se-honey-deep" />
                  <h2 className="font-serif text-lg font-semibold text-se-honey-deep">
                    Top Awards
                  </h2>
                </div>
                <div className="space-y-2">
                  {svAwards.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                      <Badge className="w-auto sm:w-52 justify-center bg-se-honey-soft text-se-honey-deep border-se-honey-line text-xs font-semibold whitespace-nowrap">
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
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Best Awards — every achievement the show recorded, in the
                secretary's configured order (server-sorted via resolveTopAwards),
                labelled with her configured name. Never gated by a hardcoded
                type list — an award type outside that list still shows, just
                sorted after the configured ones. */}
            {bestAwards.length > 0 && (
              <div>
                <span id="top-awards" />
                <div id="show-awards" className="rounded-lg border border-se-honey-line bg-se-honey-soft p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className="size-5 text-se-honey-deep" />
                      <h2 className="font-serif text-lg font-semibold text-se-honey-deep">
                        Best Awards
                      </h2>
                    </div>
                    <ShareButton
                      title={`${show.name} — Best Awards`}
                      text={`Best Awards at ${show.name}\n\n${bestAwardsShareText}`}
                      hash="show-awards"
                      size="sm"
                    />
                  </div>
                  <div className="space-y-2">
                    {bestAwards.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                        {/* min-w, never a fixed w: a configured name runs as
                            long as "Reserve Bitch Challenge Certificate", and
                            whitespace-nowrap would push it out of a fixed box. */}
                        <Badge className="w-auto sm:min-w-44 justify-center bg-se-honey-soft text-se-honey-deep border-se-honey-line text-xs font-semibold whitespace-nowrap">
                          {a.awardName ?? achievementLabels[a.type] ?? a.type}
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
                        {/* On a single-breed show the breed is the same on
                            every line — printing it 13 times is noise that
                            pushes each award onto two rows. Only worth the
                            space when there is more than one breed to tell
                            apart. */}
                        {a.dog?.breed && breedGroups.length > 1 && (
                          <span className="text-xs text-muted-foreground">
                            ({a.dog.breed.name})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
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
                          <Award className="size-4 text-se-honey-deep" />
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
                    {group.classes.map((cls) => {
                      // SV ratings restart per grade (SG1, SG2, G1, G2…) — so
                      // compute the within-grade rank across the whole class
                      // rather than per result (Amanda 2026-05-28).
                      const svRatings = isWusv ? computeSvClassRatings(cls.results) : null;
                      return (
                      <div
                        key={cls.classId}
                        id={`class-${cls.classId}`}
                        className="rounded-lg border bg-card p-4"
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
                                {isWusv && svRatings?.get(result.entryClassId) ? (
                                  <Badge
                                    variant="outline"
                                    className={`w-auto sm:w-16 justify-center text-xs font-semibold whitespace-nowrap ${result.placement ? placementColors[result.placement] ?? '' : ''}`}
                                  >
                                    {svRatings.get(result.entryClassId)}
                                  </Badge>
                                ) : !isWusv && result.placement ? (
                                  <Badge
                                    variant="outline"
                                    className={`w-auto sm:w-16 justify-center text-xs font-semibold whitespace-nowrap ${placementColors[result.placement] ?? ''}`}
                                  >
                                    {getPlacementLabel(result.placement)}
                                  </Badge>
                                ) : result.placementStatus === 'withheld' ? (
                                  <Badge
                                    variant="outline"
                                    className="w-auto sm:w-16 justify-center text-xs font-semibold whitespace-nowrap text-muted-foreground"
                                  >
                                    W/H
                                  </Badge>
                                ) : null}
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
                                    className="shrink-0 text-xs bg-se-honey-soft text-se-honey-deep"
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
                                <div className="ml-[4.75rem] mt-1.5 rounded-lg border-l-2 border-se-honey/30 bg-muted/50 px-3 py-2">
                                  <p className="text-sm italic leading-relaxed text-muted-foreground">
                                    &ldquo;{result.critiqueText}&rdquo;
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      );
                    })}
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
