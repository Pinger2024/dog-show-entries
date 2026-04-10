'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useShowId } from '../_lib/show-context';
import Link from 'next/link';
import {
  Trophy,
  Award,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardEdit,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Unlock,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { uploadImage } from '@/lib/upload';
import {
  getPlacementLabel,
  placementColors,
  achievementLabels,
  type AchievementType,
} from '@/lib/placements';
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

// ── Achievement award groupings ──────────────────────────

const SHOW_LEVEL_AWARDS: { type: AchievementType; label: string }[] = [
  { type: 'best_in_show', label: 'Best in Show' },
  { type: 'reserve_best_in_show', label: 'Reserve Best in Show' },
  { type: 'best_puppy_in_show', label: 'Best Puppy in Show' },
  // New 2026 — RKC F(1).27 Best Veteran in Show progression
  { type: 'best_veteran_in_show', label: 'Best Veteran in Show' },
  { type: 'reserve_best_veteran_in_show', label: 'Reserve Best Veteran in Show' },
  { type: 'best_long_coat_in_show', label: 'Best Long Coat in Show' },
];

const BREED_LEVEL_AWARDS: { type: AchievementType; label: string }[] = [
  { type: 'best_of_breed', label: 'Best of Breed' },
  { type: 'best_puppy_in_breed', label: 'Best Puppy in Breed' },
  { type: 'best_veteran_in_breed', label: 'Best Veteran in Breed' },
];

const CHAMPIONSHIP_AWARDS: { type: AchievementType; label: string }[] = [
  { type: 'dog_cc', label: 'Dog CC' },
  { type: 'reserve_dog_cc', label: 'Reserve Dog CC' },
  { type: 'best_puppy_dog', label: 'Best Puppy Dog' },
  { type: 'best_long_coat_dog', label: 'Best Long Coat Dog' },
  { type: 'bitch_cc', label: 'Bitch CC' },
  { type: 'reserve_bitch_cc', label: 'Reserve Bitch CC' },
  { type: 'best_puppy_bitch', label: 'Best Puppy Bitch' },
  { type: 'best_long_coat_bitch', label: 'Best Long Coat Bitch' },
];

/** Returns the required sex for a sex-specific award, or null if open */
function requiredSexForAward(type: AchievementType): 'dog' | 'bitch' | null {
  if (['dog_cc', 'reserve_dog_cc', 'best_puppy_dog', 'best_long_coat_dog'].includes(type)) return 'dog';
  if (['bitch_cc', 'reserve_bitch_cc', 'best_puppy_bitch', 'best_long_coat_bitch'].includes(type)) return 'bitch';
  return null;
}

/**
 * Show-level awards cascade from breed-level awards:
 * - Best in Show → Dog CC + Bitch CC winners
 * - Reserve Best in Show → Dog CC + Reserve Dog CC + Bitch CC + Reserve Bitch CC
 * - Best Puppy in Show → Best Puppy Dog + Best Puppy Bitch
 * - Best Long Coat in Show → Best Long Coat Dog + Best Long Coat Bitch
 */
function getShowAwardCandidateIds(
  type: AchievementType,
  achievements: { type: string; dogId: string | null }[],
): string[] {
  const sourceTypes: Record<string, string[]> = {
    best_in_show: ['dog_cc', 'bitch_cc', 'best_of_breed'],
    reserve_best_in_show: ['dog_cc', 'reserve_dog_cc', 'bitch_cc', 'reserve_bitch_cc', 'best_of_breed'],
    best_puppy_in_show: ['best_puppy_dog', 'best_puppy_bitch', 'best_puppy_in_breed'],
    best_long_coat_in_show: ['best_long_coat_dog', 'best_long_coat_bitch'],
  };
  const sources = sourceTypes[type];
  if (!sources) return [];
  return achievements
    .filter((a) => sources.includes(a.type) && a.dogId)
    .map((a) => a.dogId!);
}

// ── Sub-components ────────────────────────────────────────

function WinnerPhotoButton({
  entryClassId,
  currentPhotoUrl,
  dogName,
  showId,
}: {
  entryClassId: string;
  currentPhotoUrl: string | null;
  dogName: string;
  showId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const updatePhoto = trpc.steward.updateWinnerPhoto.useMutation({
    onSuccess: () => {
      utils.steward.getLiveResults.invalidate({ showId });
      toast.success('Winner photo updated');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const publicUrl = await uploadImage(file);
      updatePhoto.mutate({
        entryClassId,
        winnerPhotoUrl: publicUrl,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  }, [entryClassId, updatePhoto]);

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />
      {currentPhotoUrl ? (
        <div className="mt-1.5 flex items-center gap-2">
          <img src={currentPhotoUrl} alt={dogName} className="size-10 rounded-full object-cover ring-1 ring-border/40" />
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-primary hover:underline min-h-[2rem] px-2"
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Replace'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title={`Add winner photo for ${dogName}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary min-h-[2.75rem]"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
          <span className="hidden sm:inline">Add Photo</span>
        </button>
      )}
    </>
  );
}

function ClassPublishButton({
  showId,
  showClassId,
  results,
}: {
  showId: string;
  showClassId: string;
  results: { entryClassId: string; placement: number | null }[];
}) {
  const utils = trpc.useUtils();
  const publishMut = trpc.secretary.publishClassResults.useMutation({
    onSuccess: () => {
      utils.steward.getLiveResults.invalidate();
      toast.success('Class results published');
    },
    onError: (err) => toast.error(err.message),
  });
  const unpublishMut = trpc.secretary.unpublishClassResults.useMutation({
    onSuccess: () => {
      utils.steward.getLiveResults.invalidate();
      toast.success('Class results unpublished');
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending = publishMut.isPending || unpublishMut.isPending;

  return (
    <Button
      variant="outline"
      size="sm"
      className="ml-auto h-7 gap-1 px-2 text-xs"
      disabled={isPending}
      onClick={() => {
        publishMut.mutate({ showId, showClassId });
      }}
    >
      {isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Globe className="size-3" />
      )}
      Publish
    </Button>
  );
}

// ── Best Awards Section ───────────────────────────────────

function BestAwardsSection({
  showId,
  showDate,
  showType,
  confirmedDogs,
  existingAchievements,
  classResults,
}: {
  showId: string;
  showDate: string;
  showType: string;
  classResults?: { breedName: string; classes: { className: string; sex: string | null; results: { dogId: string | null; placement: number | null }[] }[] }[];
  confirmedDogs: {
    dogId: string;
    registeredName: string;
    sex: string | null;
    breedName: string | null;
    catalogueNumber: string | null;
  }[];
  existingAchievements: {
    id: string;
    dogId: string;
    type: string;
    dog?: {
      id: string;
      registeredName: string;
      sex: string | null;
      breed?: { name: string } | null;
    } | null;
  }[];
}) {
  const [expanded, setExpanded] = useState(true);
  const utils = trpc.useUtils();
  const isChampionship = showType === 'championship';

  // Derive puppy/veteran class winner dogIds from live results for filtering
  const puppyClassWinnerIds = useMemo(() => {
    if (!classResults) return new Set<string>();
    const ids = new Set<string>();
    for (const group of classResults) {
      for (const cls of group.classes) {
        const name = cls.className.toLowerCase();
        const isPuppy = (name.includes('puppy') || name.includes('minor')) && !name.includes('post');
        if (isPuppy) {
          for (const r of cls.results) {
            if (r.dogId) ids.add(r.dogId);
          }
        }
      }
    }
    return ids;
  }, [classResults]);

  const recordMut = trpc.secretary.recordAchievement.useMutation({
    onSuccess: () => {
      utils.secretary.getShowAchievements.invalidate({ showId });
      utils.steward.getPublicShowAchievements.invalidate({ showId });
      utils.steward.getLiveResults.invalidate({ showId });
      toast.success('Award recorded');
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMut = trpc.secretary.removeAchievement.useMutation({
    onSuccess: () => {
      utils.secretary.getShowAchievements.invalidate({ showId });
      utils.steward.getPublicShowAchievements.invalidate({ showId });
      utils.steward.getLiveResults.invalidate({ showId });
      toast.success('Award removed');
    },
    onError: (err) => toast.error(err.message),
  });

  // Group dogs by breed for breed-level awards
  const breedNames = [...new Set(confirmedDogs.map((d) => d.breedName).filter(Boolean))] as string[];
  breedNames.sort((a, b) => a.localeCompare(b));

  function getExisting(type: string) {
    return existingAchievements.find((a) => a.type === type);
  }

  function handleAwardChange(type: AchievementType, dogId: string) {
    const existing = getExisting(type);
    if (dogId === 'none') {
      if (existing) {
        removeMut.mutate({ showId, achievementId: existing.id });
      }
    } else {
      // If there was a previous winner, the server will replace it
      recordMut.mutate({ showId, dogId, type, date: showDate });
    }
  }

  const isPending = recordMut.isPending || removeMut.isPending;
  const hasAnyAwards = existingAchievements.length > 0;

  return (
    <div className="rounded-lg border border-amber-200 bg-gradient-to-b from-amber-50/80 to-amber-50/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 p-3 sm:p-4 min-h-[2.75rem]"
      >
        <Trophy className="size-5 text-amber-600" />
        <h3 className="flex-1 text-left font-serif text-base font-semibold text-amber-900">
          Best Awards
        </h3>
        {hasAnyAwards && (
          <Badge variant="secondary" className="text-xs mr-2">
            {existingAchievements.length} recorded
          </Badge>
        )}
        {expanded ? (
          <ChevronUp className="size-4 text-amber-600" />
        ) : (
          <ChevronDown className="size-4 text-amber-600" />
        )}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-amber-200 p-3 sm:p-4">
          {/* Show-level awards — candidates cascade from breed-level achievements */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Show Awards
            </h4>
            {SHOW_LEVEL_AWARDS
              .filter((award) => award.type !== 'best_long_coat_in_show' || isChampionship)
              .map((award) => {
                // Cascade: show awards only from relevant breed-level award winners
                const sourceDogIds = getShowAwardCandidateIds(award.type, existingAchievements);
                const candidates = sourceDogIds.length > 0
                  ? confirmedDogs.filter((d) => sourceDogIds.includes(d.dogId))
                  : confirmedDogs; // fallback to all if no breed awards recorded yet
                return (
                  <AwardRow
                    key={award.type}
                    label={award.label}
                    type={award.type}
                    existing={getExisting(award.type)}
                    candidates={candidates}
                    isPending={isPending}
                    onSelect={(dogId) => handleAwardChange(award.type, dogId)}
                  />
                );
              })}
          </div>

          {/* Breed-level awards per breed */}
          {breedNames.map((breedName) => {
            const breedDogs = confirmedDogs.filter((d) => d.breedName === breedName);
            // For breed-level awards, we need to filter by breed
            // But achievements are global — find the one matching this breed
            const breedAchievements = existingAchievements.filter(
              (a) => a.dog?.breed?.name === breedName
            );

            return (
              <div key={breedName} className="space-y-2 border-t border-amber-100 pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {breedName}
                </h4>
                {BREED_LEVEL_AWARDS.map((award) => {
                  const existing = breedAchievements.find((a) => a.type === award.type);
                  return (
                    <AwardRow
                      key={`${breedName}-${award.type}`}
                      label={award.label}
                      type={award.type}
                      existing={existing}
                      candidates={breedDogs}
                      isPending={isPending}
                      onSelect={(dogId) => handleAwardChange(award.type, dogId)}
                    />
                  );
                })}
                {isChampionship && (
                  <>
                    {CHAMPIONSHIP_AWARDS.map((award) => {
                      const sexFilter = requiredSexForAward(award.type);
                      let filtered = sexFilter
                        ? breedDogs.filter((d) => d.sex === sexFilter)
                        : breedDogs;
                      // Best Puppy awards: only show dogs from puppy-age classes
                      if (award.type === 'best_puppy_dog' || award.type === 'best_puppy_bitch') {
                        const puppyFiltered = filtered.filter((d) => puppyClassWinnerIds.has(d.dogId));
                        if (puppyFiltered.length > 0) filtered = puppyFiltered;
                      }
                      const existing = breedAchievements.find((a) => a.type === award.type);
                      return (
                        <AwardRow
                          key={`${breedName}-${award.type}`}
                          label={award.label}
                          type={award.type}
                          existing={existing}
                          candidates={filtered}
                          isPending={isPending}
                          onSelect={(dogId) => handleAwardChange(award.type, dogId)}
                        />
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Single award row with label + select dropdown */
function AwardRow({
  label,
  type,
  existing,
  candidates,
  isPending,
  onSelect,
}: {
  label: string;
  type: AchievementType;
  existing?: {
    id: string;
    dogId: string;
    dog?: { id: string; registeredName: string } | null;
  };
  candidates: {
    dogId: string;
    registeredName: string;
    catalogueNumber: string | null;
  }[];
  isPending: boolean;
  onSelect: (dogId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-xs sm:text-sm font-medium w-full sm:w-44 shrink-0 truncate" title={label}>
        {label}
      </span>
      <Select
        value={existing?.dogId ?? 'none'}
        onValueChange={onSelect}
        disabled={isPending}
      >
        <SelectTrigger className="h-11 flex-1 text-xs sm:text-sm">
          <SelectValue placeholder="Select winner..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">-- None --</SelectItem>
          {candidates.map((d) => (
            <SelectItem key={d.dogId} value={d.dogId}>
              {d.catalogueNumber ? `#${d.catalogueNumber} ` : ''}{d.registeredName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────

export default function SecretaryResultsPage() {
  const showId = useShowId();
  const [sendNotifications, setSendNotifications] = useState(true);
  const utils = trpc.useUtils();

  // All hooks must be called before any early returns (React Rules of Hooks)
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

  const { data: showData } =
    trpc.shows.getById.useQuery({ id: showId });

  const { data: confirmedDogs } =
    trpc.secretary.getConfirmedDogs.useQuery({ showId });

  const { data: secAchievements } =
    trpc.secretary.getShowAchievements.useQuery(
      { showId },
      { refetchInterval: 10_000 }
    );

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

  // Gate: results only make sense from entries_closed onwards
  const tooEarly = ['draft', 'published', 'entries_open'].includes(show.status);
  if (tooEarly) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center px-4">
        <Trophy className="size-12 text-muted-foreground/20" />
        <h2 className="text-lg font-semibold">Results aren&apos;t available yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Results can be recorded once entries have closed and the show is underway.
          Close entries first, then come back here on show day.
        </p>
      </div>
    );
  }

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
                  className="min-h-[2.75rem] border-red-200 text-red-700 hover:bg-red-50"
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
                  className="min-h-[2.75rem] bg-green-700 hover:bg-green-800"
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

      {/* Header with progress + Record Results button */}
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
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="sm" className="min-h-[2.75rem]" asChild>
            <Link href={`/steward/shows/${showId}`}>
              <ClipboardEdit className="size-3.5" />
              Record Results
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="min-h-[2.75rem]" asChild>
            <Link href={`/shows/${showId}/results`}>
              <ExternalLink className="size-3.5" />
              Public Results Page
            </Link>
          </Button>
        </div>
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

      {/* Best Awards Section */}
      {showData && confirmedDogs && confirmedDogs.length > 0 && (
        <BestAwardsSection
          showId={showId}
          showDate={showData.startDate}
          showType={showData.showType}
          confirmedDogs={confirmedDogs}
          existingAchievements={secAchievements ?? []}
          classResults={breedGroups}
        />
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
          {/* Show-level awards (read-only display from public achievements) */}
          {showAwards.length > 0 && (
            <div className="rounded-lg border border-green-200 bg-gradient-to-b from-green-50/80 to-green-50/30 p-3 sm:p-4">
              <div className="mb-3 flex items-center gap-2">
                <Trophy className="size-5 text-green-600" />
                <h3 className="font-serif text-base font-semibold text-green-900">
                  Recorded Show Awards
                </h3>
              </div>
              <div className="space-y-2">
                {showAwards.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                    <Badge className="bg-green-100 text-green-800 border-green-300 text-xs font-semibold whitespace-nowrap">
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
                        <Badge variant="outline" className="text-xs capitalize">
                          {cls.sex}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {cls.entriesCount} entered · {cls.dogsForward} forward
                      </span>
                      {cls.results.length > 0 && (
                        <ClassPublishButton showId={showId} showClassId={cls.classId} results={cls.results} />
                      )}
                    </div>
                    {cls.results.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No results yet
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {cls.results.map((result) => (
                          <div key={result.entryClassId} className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-sm">
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
                                  className="shrink-0 text-xs bg-amber-50 text-amber-700"
                                >
                                  <Award className="mr-0.5 size-3" />
                                  {result.specialAward}
                                </Badge>
                              )}
                              {result.placement === 1 && (
                                <WinnerPhotoButton
                                  entryClassId={result.entryClassId}
                                  currentPhotoUrl={result.winnerPhotoUrl}
                                  dogName={result.dogName}
                                  showId={showId}
                                />
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
