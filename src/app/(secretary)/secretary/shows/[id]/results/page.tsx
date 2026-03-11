'use client';

import { useShowId } from '../_lib/show-context';
import Link from 'next/link';
import {
  Trophy,
  Award,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { getPlacementLabel, placementColors } from '@/lib/placements';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

const achievementLabels: Record<string, string> = {
  best_in_show: 'Best in Show',
  reserve_best_in_show: 'Reserve Best in Show',
  best_puppy_in_show: 'Best Puppy in Show',
  best_of_breed: 'Best of Breed',
  best_puppy_in_breed: 'Best Puppy in Breed',
  best_veteran_in_breed: 'Best Veteran in Breed',
  dog_cc: 'Dog CC',
  reserve_dog_cc: 'Reserve Dog CC',
  bitch_cc: 'Bitch CC',
  reserve_bitch_cc: 'Reserve Bitch CC',
  best_puppy_dog: 'Best Puppy Dog',
  best_puppy_bitch: 'Best Puppy Bitch',
  best_long_coat_dog: 'Best Long Coat Dog',
  best_long_coat_bitch: 'Best Long Coat Bitch',
  best_long_coat_in_show: 'Best Long Coat in Show',
  cc: 'CC',
  reserve_cc: 'Reserve CC',
};

export default function SecretaryResultsPage() {
  const showId = useShowId();

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

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary/40" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <Trophy className="size-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">No results data available.</p>
      </div>
    );
  }

  const { show, breedGroups } = data;
  const isLive = show.status === 'in_progress';
  const judged = summary?.judgedClasses ?? 0;
  const total = summary?.totalClasses ?? 0;
  const progress = total > 0 ? Math.round((judged / total) * 100) : 0;

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

  return (
    <div className="space-y-6">
      {/* Header with progress */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-lg font-semibold sm:text-xl">Results</h2>
            {isLive && (
              <Badge className="bg-green-600 text-xs">
                <span className="relative mr-1.5 flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-white" />
                </span>
                Live
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{judged} of {total} classes judged</span>
            {lastUpdated && <span>Updated {lastUpdated}</span>}
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/shows/${showId}/results`}>
            <ExternalLink className="size-3.5" />
            Public Results Page
          </Link>
        </Button>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="mt-1 h-2" />
        </div>
      )}

      {breedGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Trophy className="size-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">
            No results recorded yet.
            {isLive && ' Results will appear here as stewards record them.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Show-level awards */}
          {showAwards.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-gradient-to-b from-amber-50/80 to-amber-50/30 p-3 sm:p-4">
              <div className="mb-3 flex items-center gap-2">
                <Trophy className="size-5 text-amber-600" />
                <h3 className="font-serif text-base font-semibold text-amber-900">
                  Show Awards
                </h3>
              </div>
              <div className="space-y-2">
                {showAwards.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs font-semibold whitespace-nowrap">
                      {achievementLabels[a.type] ?? a.type}
                    </Badge>
                    <span className="font-medium text-sm">
                      {a.dog?.registeredName ?? 'Unknown'}
                    </span>
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

          {/* Results by breed */}
          {breedGroups.map((group) => (
            <div key={group.breedName}>
              <h3 className="mb-2 font-serif text-base font-semibold">
                {group.breedName}
              </h3>

              {/* Breed-level awards */}
              {breedAwardsByBreed.has(group.breedName) && (
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {breedAwardsByBreed.get(group.breedName)!.map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5 text-sm">
                      <Award className="size-4 text-amber-500" />
                      <span className="text-xs font-medium text-muted-foreground">
                        {achievementLabels[a.type] ?? a.type}:
                      </span>
                      <span className="text-xs font-medium">
                        {a.dog?.registeredName ?? 'Unknown'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {group.classes.map((cls) => (
                  <div
                    key={cls.classId}
                    className="rounded-lg border bg-white p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {cls.classNumber != null && (
                        <span className="text-xs font-bold text-muted-foreground">
                          #{cls.classNumber}
                        </span>
                      )}
                      <h4 className="font-semibold text-sm">
                        {cls.className}
                      </h4>
                      {cls.sex && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {cls.sex}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {cls.entriesCount} entered · {cls.dogsForward} forward
                      </span>
                    </div>
                    {cls.results.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No results yet
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {cls.results.map((result, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-sm">
                            {result.placement && (
                              <Badge
                                variant="outline"
                                className={`text-xs font-semibold whitespace-nowrap ${placementColors[result.placement] ?? ''}`}
                              >
                                {getPlacementLabel(result.placement)}
                              </Badge>
                            )}
                            <span className="font-mono text-xs text-muted-foreground">
                              {result.catalogueNumber ?? '—'}
                            </span>
                            <span className="flex-1 truncate font-medium">
                              {result.dogName}
                            </span>
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
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
