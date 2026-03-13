'use client';

import { useState } from 'react';
import { useShowId } from '../_lib/show-context';
import Link from 'next/link';
import {
  Trophy,
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Send,
  Unlock,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { getPlacementLabel, placementColors } from '@/lib/placements';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
  const [sendNotifications, setSendNotifications] = useState(true);
  const utils = trpc.useUtils();

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

  const { data: pubStatus } =
    trpc.secretary.getResultsPublicationStatus.useQuery({ showId });

  const publishMutation = trpc.secretary.publishResults.useMutation({
    onSuccess: () => {
      utils.secretary.getResultsPublicationStatus.invalidate({ showId });
      toast.success('Results published successfully');
    },
    onError: (err) => toast.error(err.message),
  });

  const unpublishMutation = trpc.secretary.unpublishResults.useMutation({
    onSuccess: () => {
      utils.secretary.getResultsPublicationStatus.invalidate({ showId });
      toast.success('Results unpublished');
    },
    onError: (err) => toast.error(err.message),
  });

  const resendApproval = trpc.secretary.resendJudgeApprovalRequest.useMutation({
    onSuccess: () => {
      utils.secretary.getResultsPublicationStatus.invalidate({ showId });
      toast.success('Approval request sent');
    },
    onError: (err) => toast.error(err.message),
  });

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

  const published = pubStatus?.published ?? false;
  const publishedAt = pubStatus?.publishedAt;
  const canPublish = pubStatus ? ['in_progress', 'completed'].includes(pubStatus.showStatus) : false;

  return (
    <div className="space-y-6">
      {/* Publication Status Banner */}
      {published ? (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <Globe className="mt-0.5 size-5 shrink-0 text-green-600" />
          <div className="flex-1">
            <p className="font-medium text-green-800">Results Published</p>
            {publishedAt && (
              <p className="mt-0.5 text-xs text-green-600">
                Published {new Date(publishedAt).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
            <p className="mt-1 text-xs text-green-700">
              <Lock className="mr-0.5 inline size-3" />
              Stewards cannot edit results while published
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <Unlock className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800">Results Not Published</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Results are only visible to stewards, secretaries, and admins.
            </p>
          </div>
        </div>
      )}

      {/* Judge Approval Summary */}
      {pubStatus && pubStatus.approvals.total > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <Badge variant="secondary" className="gap-1 text-xs">
                <CheckCircle2 className="size-3 text-green-500" />
                {pubStatus.approvals.approved} approved
              </Badge>
              {pubStatus.approvals.pending > 0 && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Clock className="size-3 text-amber-500" />
                  {pubStatus.approvals.pending} pending
                </Badge>
              )}
              {pubStatus.approvals.declined > 0 && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <XCircle className="size-3 text-red-500" />
                  {pubStatus.approvals.declined} queried
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {pubStatus.approvals.approved} of {pubStatus.approvals.total} judges
            </span>
          </div>

          {/* Publish / Unpublish */}
          {published ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-red-200 text-red-700 hover:bg-red-50"
                  disabled={unpublishMutation.isPending}
                >
                  <Unlock className="mr-1 size-3" />
                  Unpublish
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unpublish Results?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Results will be hidden from the public and stewards will be able to edit again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => unpublishMutation.mutate({ showId })}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Unpublish
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 bg-green-700 hover:bg-green-800"
                  disabled={!canPublish || publishMutation.isPending}
                >
                  <Globe className="mr-1 size-3" />
                  Publish Results
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Publish Results?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Publishing will make results public, lock steward editing, and send notification emails.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex items-center gap-2 px-1 py-2">
                  <input
                    type="checkbox"
                    id="send-notifs-results"
                    checked={sendNotifications}
                    onChange={(e) => setSendNotifications(e.target.checked)}
                    className="size-4 rounded border-gray-300"
                  />
                  <label htmlFor="send-notifs-results" className="text-sm">
                    Send notification emails
                  </label>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => publishMutation.mutate({ showId, sendNotifications })}
                    className="bg-green-700 hover:bg-green-800"
                  >
                    Publish
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

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
