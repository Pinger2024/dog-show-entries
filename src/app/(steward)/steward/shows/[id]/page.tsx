'use client';

import { use } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Trophy,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function StewardShowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);
  const { data: classes, isLoading } =
    trpc.steward.getShowClasses.useQuery({ showId });
  const { data: summary } =
    trpc.steward.getResultsSummary.useQuery({ showId });
  const { data: showData } =
    trpc.shows.getById.useQuery({ id: showId });
  const { data: existingAchievements } =
    trpc.steward.getShowAchievements.useQuery({ showId });
  const { data: liveResults } =
    trpc.steward.getLiveResults.useQuery({ showId });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!classes) {
    return (
      <div className="text-center text-muted-foreground">
        Show not found or not accessible.
      </div>
    );
  }

  const judged = summary?.judgedClasses ?? 0;
  const total = summary?.totalClasses ?? classes.length;
  const progress = total > 0 ? Math.round((judged / total) * 100) : 0;

  // Group by breed
  const breedMap = new Map<
    string,
    typeof classes
  >();
  for (const sc of classes) {
    const breedName = sc.breed?.name ?? 'Any Breed';
    if (!breedMap.has(breedName)) breedMap.set(breedName, []);
    breedMap.get(breedName)!.push(sc);
  }
  const breeds = Array.from(breedMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div>
      <Link
        href="/steward"
        className="inline-flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 sm:size-4" />
        My Shows
      </Link>

      {/* Progress section */}
      <div className="mt-3 sm:mt-4">
        <div className="flex items-center justify-between text-xs sm:text-sm">
          <span className="font-medium">
            {judged} of {total} classes judged
          </span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="mt-2 h-2" />
      </div>

      {/* Classes grouped by breed */}
      <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-6">
        {breeds.map(([breedName, breedClasses]) => (
          <div key={breedName}>
            <h2 className="mb-2 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {breedName}
            </h2>
            <div className="space-y-1">
              {breedClasses.map((sc) => (
                <Link
                  key={sc.id}
                  href={`/steward/shows/${showId}/classes/${sc.id}`}
                  className="flex items-center gap-2 sm:gap-3 rounded-lg border p-2.5 sm:p-3 transition-colors hover:bg-muted/30 active:bg-muted/50"
                >
                  {sc.hasResults ? (
                    <CheckCircle2 className="size-5 shrink-0 text-green-500" />
                  ) : (
                    <div className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/20" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {sc.classNumber != null && (
                        <span className="text-xs font-bold text-muted-foreground">
                          #{sc.classNumber}
                        </span>
                      )}
                      <span className="font-medium text-xs sm:text-sm">
                        {sc.classDefinition.name}
                      </span>
                      {sc.sex && (
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize"
                        >
                          {sc.sex}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {sc.entryCount} {sc.entryCount === 1 ? 'entry' : 'entries'}
                      {sc.absentCount > 0 && (
                        <span className="ml-1 text-amber-600">
                          ({sc.absentCount} abs)
                        </span>
                      )}
                      {sc.resultsCount > 0 && (
                        <span className="ml-1 text-green-600">
                          ({sc.resultsCount} placed)
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Best of Breed / BIS Section */}
      {judged > 0 && showData && (
        <BestOfBreedSection
          showId={showId}
          showDate={showData.startDate}
          liveResults={liveResults}
          existingAchievements={existingAchievements ?? []}
        />
      )}
    </div>
  );
}

// ── Best of Breed / BIS Component ─────────────────────────

type AchievementType =
  | 'best_of_breed'
  | 'best_puppy_in_breed'
  | 'best_veteran_in_breed'
  | 'group_placement'
  | 'best_in_show'
  | 'reserve_best_in_show'
  | 'best_puppy_in_show';

const BOB_AWARDS: { type: AchievementType; label: string }[] = [
  { type: 'best_of_breed', label: 'Best of Breed' },
  { type: 'best_puppy_in_breed', label: 'Best Puppy in Breed' },
  { type: 'best_veteran_in_breed', label: 'Best Veteran in Breed' },
];

const BIS_AWARDS: { type: AchievementType; label: string }[] = [
  { type: 'best_in_show', label: 'Best in Show' },
  { type: 'reserve_best_in_show', label: 'Reserve Best in Show' },
  { type: 'best_puppy_in_show', label: 'Best Puppy in Show' },
];

interface BestOfBreedSectionProps {
  showId: string;
  showDate: string;
  liveResults?: {
    breedGroups: {
      breedName: string;
      classes: {
        results: {
          placement: number | null;
          dogId: string | null;
          dogName: string;
          exhibitorName: string;
          catalogueNumber: string | null;
        }[];
      }[];
    }[];
  };
  existingAchievements: {
    id: string;
    dogId: string;
    type: string;
    dog?: { id: string; registeredName: string; breed?: { name: string } | null } | null;
  }[];
}

function BestOfBreedSection({
  showId,
  showDate,
  liveResults,
  existingAchievements,
}: BestOfBreedSectionProps) {
  const utils = trpc.useUtils();

  const recordAchievement = trpc.steward.recordAchievement.useMutation({
    onSuccess: () => {
      utils.steward.getShowAchievements.invalidate({ showId });
      toast.success('Achievement recorded');
    },
    onError: (err) => toast.error(err.message),
  });

  const removeAchievement = trpc.steward.removeAchievement.useMutation({
    onSuccess: () => {
      utils.steward.getShowAchievements.invalidate({ showId });
      toast.success('Achievement removed');
    },
    onError: (err) => toast.error(err.message),
  });

  // Build a list of 1st-placed dogs per breed from live results (class winners)
  const classWinnersByBreed = new Map<string, { dogId: string; dogName: string; exhibitorName: string; catalogueNumber: string | null }[]>();

  if (liveResults) {
    for (const bg of liveResults.breedGroups) {
      const winners: typeof classWinnersByBreed extends Map<string, infer V> ? V : never = [];
      for (const cls of bg.classes) {
        const firstPlaced = cls.results.find((r) => r.placement === 1);
        if (firstPlaced?.dogId && !winners.some((w) => w.dogId === firstPlaced.dogId)) {
          winners.push({
            dogId: firstPlaced.dogId,
            dogName: firstPlaced.dogName,
            exhibitorName: firstPlaced.exhibitorName,
            catalogueNumber: firstPlaced.catalogueNumber,
          });
        }
      }
      if (winners.length > 0) {
        classWinnersByBreed.set(bg.breedName, winners);
      }
    }
  }

  // All unique class winners across all breeds (for BIS selection)
  const allWinners: { dogId: string; dogName: string; breedName: string }[] = [];
  for (const [breedName, winners] of classWinnersByBreed) {
    for (const w of winners) {
      if (!allWinners.some((aw) => aw.dogId === w.dogId)) {
        allWinners.push({ dogId: w.dogId, dogName: w.dogName, breedName });
      }
    }
  }

  function getExistingAchievement(type: string, dogId?: string) {
    return existingAchievements.find(
      (a) => a.type === type && (dogId ? a.dogId === dogId : true)
    );
  }

  function handleAward(type: AchievementType, dogId: string) {
    const existing = getExistingAchievement(type, dogId);
    if (existing) {
      removeAchievement.mutate({ showId, dogId, type });
    } else {
      recordAchievement.mutate({ showId, dogId, type, date: showDate });
    }
  }

  if (classWinnersByBreed.size === 0) return null;

  return (
    <div className="mt-6 sm:mt-8 space-y-6">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-amber-500" />
        <h2 className="text-sm sm:text-base font-semibold">Best of Breed & Show Awards</h2>
      </div>

      {/* Per-breed awards */}
      {Array.from(classWinnersByBreed.entries()).map(([breedName, winners]) => (
        <div key={breedName} className="rounded-lg border p-3 sm:p-4 space-y-3">
          <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {breedName}
          </h3>
          {BOB_AWARDS.map((award) => {
            const existing = existingAchievements.find(
              (a) => a.type === award.type && winners.some((w) => w.dogId === a.dogId)
            );
            return (
              <div key={award.type} className="flex items-center gap-2 sm:gap-3">
                <span className="text-xs sm:text-sm font-medium w-36 sm:w-44 shrink-0">
                  {award.label}
                </span>
                <Select
                  value={existing?.dogId ?? 'none'}
                  onValueChange={(dogId) => {
                    if (dogId === 'none') {
                      if (existing) {
                        removeAchievement.mutate({
                          showId,
                          dogId: existing.dogId,
                          type: award.type,
                        });
                      }
                    } else {
                      // Remove old if exists
                      if (existing && existing.dogId !== dogId) {
                        removeAchievement.mutate({
                          showId,
                          dogId: existing.dogId,
                          type: award.type,
                        });
                      }
                      recordAchievement.mutate({
                        showId,
                        dogId,
                        type: award.type,
                        date: showDate,
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-9 flex-1 text-xs sm:text-sm">
                    <SelectValue placeholder="Select winner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {winners.map((w) => (
                      <SelectItem key={w.dogId} value={w.dogId}>
                        {w.catalogueNumber ? `#${w.catalogueNumber} ` : ''}{w.dogName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      ))}

      {/* Show-level awards (BIS) */}
      {allWinners.length > 1 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 sm:p-4 space-y-3">
          <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-amber-700">
            Show Awards
          </h3>
          {BIS_AWARDS.map((award) => {
            const existing = existingAchievements.find((a) => a.type === award.type);
            return (
              <div key={award.type} className="flex items-center gap-2 sm:gap-3">
                <span className="text-xs sm:text-sm font-medium w-36 sm:w-44 shrink-0">
                  {award.label}
                </span>
                <Select
                  value={existing?.dogId ?? 'none'}
                  onValueChange={(dogId) => {
                    if (dogId === 'none') {
                      if (existing) {
                        removeAchievement.mutate({
                          showId,
                          dogId: existing.dogId,
                          type: award.type,
                        });
                      }
                    } else {
                      if (existing && existing.dogId !== dogId) {
                        removeAchievement.mutate({
                          showId,
                          dogId: existing.dogId,
                          type: award.type,
                        });
                      }
                      recordAchievement.mutate({
                        showId,
                        dogId,
                        type: award.type,
                        date: showDate,
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-9 flex-1 text-xs sm:text-sm">
                    <SelectValue placeholder="Select winner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {allWinners.map((w) => (
                      <SelectItem key={w.dogId} value={w.dogId}>
                        {w.dogName} ({w.breedName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
