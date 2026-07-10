'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  Mail,
  Send,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import type { AchievementType } from '@/lib/placements';
import { resolveTopAwards, buildPlacementIndex, eligibleCandidates } from '@/lib/top-awards';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  const { data: lockStatus } =
    trpc.steward.getResultsLockStatus.useQuery({ showId });
  const { data: judgeApprovals } =
    trpc.steward.getJudgeApprovalStatus.useQuery({ showId });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!classes) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center sm:p-8">
        <div className="text-4xl font-bold text-muted-foreground/30">?</div>
        <h2 className="mt-3 text-lg font-semibold">Show not found</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          This show may have been removed, or you may not be assigned as a steward.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/steward">
            <Button variant="default" className="min-h-[2.75rem]">
              <ArrowLeft className="size-4" />
              Back to My Shows
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const judged = summary?.judgedClasses ?? 0;
  const total = summary?.totalClasses ?? classes.length;
  const progress = total > 0 ? Math.round((judged / total) * 100) : 0;

  // Public-visibility counts, from the per-class flags getShowClasses returns.
  // A judged class isn't public until the steward taps Publish — surface how
  // many are still waiting so nothing quietly stays hidden from exhibitors.
  const liveCount = classes.filter((c) => c.isPublished).length;
  const judgedCount = classes.filter((c) => c.hasResults).length;
  const notLiveCount = Math.max(0, judgedCount - liveCount);

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
        {judgedCount > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {judgedCount} judged · {liveCount} live to public
            {notLiveCount > 0 && (
              <span className="text-se-honey-deep"> · {notLiveCount} not yet live</span>
            )}
          </p>
        )}
      </div>

      {/* Classes grouped by breed */}
      <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-6">
        {breeds.map(([breedName, breedClasses]) => (
          <div key={breedName}>
            {breeds.length > 1 && (
              <h2 className="mb-2 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {breedName}
              </h2>
            )}
            <div className="space-y-1">
              {breedClasses.map((sc) => (
                <Link
                  key={sc.id}
                  href={`/steward/shows/${showId}/classes/${sc.id}`}
                  className="flex items-center gap-2 sm:gap-3 rounded-lg border p-2.5 sm:p-3 transition-colors hover:bg-muted/30 active:bg-muted/50"
                >
                  {sc.hasResults ? (
                    <CheckCircle2 className="size-5 shrink-0 text-se-fresh-deep" />
                  ) : (
                    <div className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/20" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
                          className="text-xs capitalize"
                        >
                          {sc.sex}
                        </Badge>
                      )}
                      {sc.isPublished && (
                        <Badge className="bg-se-fresh-soft text-se-fresh-deep text-[10px] uppercase tracking-wider">
                          Live
                        </Badge>
                      )}
                      {sc.hasResults && !sc.isPublished && (
                        <Badge variant="outline" className="border-se-honey-line bg-se-honey-soft text-se-honey-deep text-[10px] uppercase tracking-wider">
                          Not published
                        </Badge>
                      )}
                      {sc.hasUnpublishedChanges && (
                        <Badge variant="outline" className="border-se-honey-line bg-se-honey-soft text-se-honey-deep text-[10px]">
                          Updates pending
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {sc.entryCount} {sc.entryCount === 1 ? 'entry' : 'entries'}
                      {sc.absentCount > 0 && (
                        <span className="ml-1 text-se-honey-deep">
                          ({sc.absentCount} abs)
                        </span>
                      )}
                      {sc.resultsCount > 0 && (
                        <span className="ml-1 text-se-fresh-deep">
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

      {/* Locked banner */}
      {lockStatus?.locked && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-se-honey-line bg-se-honey-soft p-3 text-sm text-se-honey-deep">
          <Lock className="size-4 shrink-0" />
          <p>Results have been published. Contact the secretary to make changes.</p>
        </div>
      )}

      {/* Best of Breed / BIS Section */}
      {judged > 0 && showData && (
        <BestOfBreedSection
          showId={showId}
          showDate={showData.startDate}
          showType={showData.showType}
          showRuleset={(showData as { showRuleset?: string }).showRuleset}
          showScope={(showData as { showScope?: string }).showScope}
          customAwards={
            (showData as { scheduleData?: { bestAwards?: string[] } | null })
              .scheduleData?.bestAwards ?? []
          }
          liveResults={liveResults}
          existingAchievements={existingAchievements ?? []}
        />
      )}

      {/* Judge Approval Section */}
      {judgeApprovals && judgeApprovals.length > 0 && (
        <JudgeApprovalSection
          showId={showId}
          judges={judgeApprovals}
          isLocked={lockStatus?.locked ?? false}
          hasAnyResults={judged > 0}
        />
      )}
    </div>
  );
}

// ── Best of Breed / BIS Component ─────────────────────────

const BOB_AWARDS: { type: AchievementType; label: string }[] = [
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

const BIS_AWARDS: { type: AchievementType; label: string }[] = [
  { type: 'best_in_show', label: 'Best in Show' },
  { type: 'reserve_best_in_show', label: 'Reserve Best in Show' },
  { type: 'best_puppy_in_show', label: 'Best Puppy in Show' },
  // New 2026 — RKC F(1).27 Best Veteran in Show progression
  { type: 'best_veteran_in_show', label: 'Best Veteran in Show' },
  { type: 'reserve_best_veteran_in_show', label: 'Reserve Best Veteran in Show' },
  { type: 'best_long_coat_in_show', label: 'Best Long Coat in Show' },
];

/** Returns the required sex for an award type, or null if either sex is allowed */
function requiredSexForAward(type: AchievementType): 'dog' | 'bitch' | null {
  if (['dog_cc', 'reserve_dog_cc', 'best_puppy_dog', 'best_long_coat_dog'].includes(type)) return 'dog';
  if (['bitch_cc', 'reserve_bitch_cc', 'best_puppy_bitch', 'best_long_coat_bitch'].includes(type)) return 'bitch';
  return null;
}

/** Awards that are restricted to dogs aged under 12 months on show day —
 *  Amanda 2026-05-28: only puppy class winners should appear in the
 *  Best Puppy * dropdowns. */
const PUPPY_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_puppy_in_breed',
  'best_puppy_dog',
  'best_puppy_bitch',
  'best_puppy_in_show',
]);

/** Returns true if the dog is under 12 months on the show date.
 *  Unknown DOB → false (better to hide than offer a non-puppy as a puppy). */
function isPuppyOnShowDate(dob: string | null, showDate: string): boolean {
  if (!dob) return false;
  const dobDate = new Date(dob);
  const show = new Date(showDate);
  const months =
    (show.getFullYear() - dobDate.getFullYear()) * 12 +
    (show.getMonth() - dobDate.getMonth()) -
    (show.getDate() < dobDate.getDate() ? 1 : 0);
  return months < 12;
}

interface BestOfBreedSectionProps {
  showId: string;
  showDate: string;
  showType: string;
  showRuleset?: string;
  showScope?: string;
  customAwards?: string[];
  liveResults?: {
    breedGroups: {
      breedName: string;
      classes: {
        className: string;
        results: {
          placement: number | null;
          dogId: string | null;
          dogName: string;
          dogSex: string | null;
          dogDateOfBirth: string | null;
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
    publishedAt: Date | null;
    dog?: { id: string; registeredName: string; breed?: { name: string } | null } | null;
  }[];
}

function BestOfBreedSection({
  showId,
  showDate,
  showType,
  showRuleset,
  showScope,
  customAwards,
  liveResults,
  existingAchievements,
}: BestOfBreedSectionProps) {
  const isChampionship = showType === 'championship';
  const isWusv = showRuleset === 'wusv';
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

  const publishAchievement = trpc.steward.publishAchievement.useMutation({
    onSuccess: () => {
      utils.steward.getShowAchievements.invalidate({ showId });
      toast.success('Award published — now live to the public');
    },
    onError: (err) => toast.error(err.message),
  });

  const unpublishAchievement = trpc.steward.unpublishAchievement.useMutation({
    onSuccess: () => {
      utils.steward.getShowAchievements.invalidate({ showId });
      toast.success('Award hidden from the public');
    },
    onError: (err) => toast.error(err.message),
  });

  // Build a list of 1st-placed dogs per breed from live results (class winners)
  type CandidateDog = { dogId: string; dogName: string; dogSex: string | null; dogDateOfBirth: string | null; exhibitorName: string; catalogueNumber: string | null };
  const classWinnersByBreed = new Map<string, CandidateDog[]>();
  // Reserve CC candidates: 1st AND 2nd-place dogs per breed. Per Amanda
  // 2026-05-28, the judge often hands the Res CC to the dog that was
  // 2nd in the CC winner's class — so we widen the Reserve pool to
  // include 2nd-place dogs as well, not just class winners.
  const reserveCandidatesByBreed = new Map<string, CandidateDog[]>();

  if (liveResults) {
    for (const bg of liveResults.breedGroups) {
      const winners: CandidateDog[] = [];
      const reservePool: CandidateDog[] = [];
      const pushIfNew = (list: CandidateDog[], r: typeof bg.classes[number]['results'][number]) => {
        if (!r.dogId || list.some((x) => x.dogId === r.dogId)) return;
        list.push({
          dogId: r.dogId,
          dogName: r.dogName,
          dogSex: r.dogSex ?? null,
          dogDateOfBirth: r.dogDateOfBirth ?? null,
          exhibitorName: r.exhibitorName,
          catalogueNumber: r.catalogueNumber,
        });
      };
      for (const cls of bg.classes) {
        const firstPlaced = cls.results.find((r) => r.placement === 1);
        const secondPlaced = cls.results.find((r) => r.placement === 2);
        if (firstPlaced) {
          pushIfNew(winners, firstPlaced);
          pushIfNew(reservePool, firstPlaced);
        }
        if (secondPlaced) pushIfNew(reservePool, secondPlaced);
      }
      if (winners.length > 0) {
        classWinnersByBreed.set(bg.breedName, winners);
        reserveCandidatesByBreed.set(bg.breedName, reservePool);
      }
    }
  }

  /** Awards where the Reserve pool (1st + 2nd) applies instead of just class
   *  winners — Reserve CCs typically include the 2nd-place dog from the CC
   *  winner's class. */
  const RESERVE_AWARDS: ReadonlySet<AchievementType> = new Set([
    'reserve_dog_cc',
    'reserve_bitch_cc',
  ]);

  // All unique class winners across all breeds (for BIS selection)
  const allWinners: { dogId: string; dogName: string; dogDateOfBirth: string | null; breedName: string }[] = [];
  for (const [breedName, winners] of classWinnersByBreed) {
    for (const w of winners) {
      if (!allWinners.some((aw) => aw.dogId === w.dogId)) {
        allWinners.push({ dogId: w.dogId, dogName: w.dogName, dogDateOfBirth: w.dogDateOfBirth, breedName });
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

  // ── SV / WUSV regional top awards (Amanda 2026-05-28) ──────────────
  // Regionals have NO Best of Breed / CCs / BIS — only four awards:
  // Most Promising Young Dog/Bitch (from the young-class winners — Minor
  // Puppy, Puppy, Junior; Baby Puppy is NOT in the Most Promising pool)
  // and Best Dog/Bitch (from the Yearling, Adult, Working winners).
  if (isWusv) {
    const SV_YOUNG = new Set(['Minor Puppy', 'Puppy', 'Junior']);
    const SV_ADULT = new Set(['Yearling', 'Adult', 'Working']);
    const stripSv = (n: string) => n.replace(/^SV\s+/, '').trim();
    const young: CandidateDog[] = [];
    const adult: CandidateDog[] = [];
    const addUnique = (list: CandidateDog[], r: CandidateDog) => {
      if (!r.dogId || list.some((x) => x.dogId === r.dogId)) return;
      list.push(r);
    };
    if (liveResults) {
      for (const bg of liveResults.breedGroups) {
        for (const cls of bg.classes) {
          const w = cls.results.find((r) => r.placement === 1);
          if (!w?.dogId) continue;
          const cand: CandidateDog = {
            dogId: w.dogId,
            dogName: w.dogName,
            dogSex: w.dogSex ?? null,
            dogDateOfBirth: w.dogDateOfBirth ?? null,
            exhibitorName: w.exhibitorName,
            catalogueNumber: w.catalogueNumber,
          };
          const age = stripSv(cls.className);
          if (SV_YOUNG.has(age)) addUnique(young, cand);
          else if (SV_ADULT.has(age)) addUnique(adult, cand);
        }
      }
    }

    const SV_AWARDS: { type: AchievementType; label: string; pool: CandidateDog[]; sex: 'dog' | 'bitch' }[] = [
      { type: 'most_promising_young_dog', label: 'Most Promising Young Dog', pool: young, sex: 'dog' },
      { type: 'most_promising_young_bitch', label: 'Most Promising Young Bitch', pool: young, sex: 'bitch' },
      { type: 'best_dog', label: 'Best Dog', pool: adult, sex: 'dog' },
      { type: 'best_bitch', label: 'Best Bitch', pool: adult, sex: 'bitch' },
    ];

    if (young.length === 0 && adult.length === 0) return null;

    return (
      <div className="mt-6 sm:mt-8 space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-se-honey-deep" />
          <h2 className="text-sm sm:text-base font-semibold">Top Awards</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Most Promising Young Dog &amp; Bitch are chosen from the Minor Puppy,
          Puppy &amp; Junior class winners; Best Dog &amp; Bitch from the
          Yearling, Adult &amp; Working winners.
        </p>
        <div className="rounded-lg border p-3 sm:p-4 space-y-3">
          {SV_AWARDS.map((award) => {
            const candidates = award.pool.filter((w) => w.dogSex === award.sex);
            const existing = existingAchievements.find(
              (a) => a.type === award.type && award.pool.some((w) => w.dogId === a.dogId),
            );
            return (
              <AwardSelect
                key={award.type}
                label={award.label}
                type={award.type}
                existingDogId={existing?.dogId}
                isPublished={!!existing?.publishedAt}
                candidates={candidates}
                onRecord={(dogId, type) => recordAchievement.mutate({ showId, dogId, type, date: showDate })}
                onRemove={(dogId, type) => removeAchievement.mutate({ showId, dogId, type })}
                onPublish={(dogId, type) => publishAchievement.mutate({ showId, dogId, type })}
                onUnpublish={(dogId, type) => unpublishAchievement.mutate({ showId, dogId, type })}
              />
            );
          })}
        </div>
      </div>
    );
  }

  if (classWinnersByBreed.size === 0) return null;

  // ── Single-breed RKC shows: config-driven Top Awards (#98) ──────────
  // The hard-coded BoB/CC/BIS arrays don't fit clubs (like BAGSD) that award
  // Best Dog/Bitch + reserves instead of CCs, and the show-level block used to
  // be hidden for single-breed shows. Drive the recordable awards off the show's
  // OWN configured Best Awards list so it always matches what the show actually
  // gives — and flows to the results page + public + dog profiles.
  // Single-breed shows drive Top Awards off the show's OWN configured list.
  // Gate on the show SCOPE, not the live class-winner breed count: on BAGSD the
  // Veteran class carries a breed id while the other 20 are breed-null, so the
  // moment Veteran gets a 1st the winner-breed count hit 2 and the old
  // `size === 1` gate flipped the UI to the hard-coded multi-breed CC screen
  // mid-show (C1). Fall back to the winner count only when scope is absent.
  const isSingleBreedShow =
    showScope != null ? showScope === 'single_breed' : classWinnersByBreed.size === 1;
  if (!isWusv && isSingleBreedShow) {
    const topAwards = resolveTopAwards(showType, customAwards);
    if (topAwards.length === 0) return null;

    // Eligibility (#98 — the RKC "beaten" rule) runs through the shared engine
    // in lib/top-awards so the steward and secretary surfaces provably agree.
    // Scan EVERY breed group's classes, not just breedGroups[0] — otherwise a
    // breed-tagged class (e.g. BAGSD's Veteran, which sorts after "Any Breed")
    // is invisible to the pool and Best Veteran can never be filled. Keys are
    // qualified by breed group so identically-named classes across groups aren't
    // conflated by the beaten-rule matcher.
    type Cand = { dogId: string; dogName: string; sex: string | null; exhibitorName: string; catalogueNumber: string | null };
    const allClasses = (liveResults?.breedGroups ?? []).flatMap((bg) =>
      bg.classes.map((cls) => ({
        key: `${bg.breedName}:::${cls.className}`,
        className: cls.className,
        results: cls.results,
      })),
    );
    const dogInfo = new Map<string, Cand>();
    for (const cls of allClasses) {
      for (const r of cls.results) {
        if (!r.dogId || r.placement == null || dogInfo.has(r.dogId)) continue;
        dogInfo.set(r.dogId, {
          dogId: r.dogId, dogName: r.dogName, sex: r.dogSex ?? null,
          exhibitorName: r.exhibitorName, catalogueNumber: r.catalogueNumber,
        });
      }
    }
    const placedDogs = Array.from(dogInfo.values());
    const index = buildPlacementIndex(allClasses);
    return (
      <div className="mt-6 sm:mt-8 space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-se-honey-deep" />
          <h2 className="text-sm sm:text-base font-semibold">Top Awards</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          At the end of judging, the judge announces these awards. Pick each winner
          here, then tap Publish to make it public. Only dogs that weren&apos;t beaten
          in their classes appear in each list.
        </p>
        <div className="rounded-lg border p-3 sm:p-4 space-y-3">
          {topAwards.map((award) => {
            const candidates = eligibleCandidates(award, placedDogs, index);
            const existing = existingAchievements.find((a) => a.type === award.type);
            if (candidates.length === 0 && !existing) {
              return (
                <div key={award.type} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-xs sm:text-sm font-medium sm:w-44 sm:shrink-0 sm:truncate" title={award.name}>
                    {award.name}
                  </span>
                  <p className="flex-1 text-xs italic text-muted-foreground">
                    No eligible dogs yet — winners appear here as classes are judged.
                  </p>
                </div>
              );
            }
            return (
              <AwardSelect
                key={award.type}
                label={award.name}
                type={award.type}
                existingDogId={existing?.dogId}
                isPublished={!!existing?.publishedAt}
                candidates={candidates}
                onRecord={(dogId, type) => recordAchievement.mutate({ showId, dogId, type, date: showDate })}
                onRemove={(dogId, type) => removeAchievement.mutate({ showId, dogId, type })}
                onPublish={(dogId, type) => publishAchievement.mutate({ showId, dogId, type })}
                onUnpublish={(dogId, type) => unpublishAchievement.mutate({ showId, dogId, type })}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 sm:mt-8 space-y-6">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-se-honey-deep" />
        <h2 className="text-sm sm:text-base font-semibold">Best of Breed & Show Awards</h2>
      </div>

      {/* Per-breed awards */}
      {Array.from(classWinnersByBreed.entries()).map(([breedName, winners]) => (
        <div key={breedName} className="rounded-lg border p-3 sm:p-4 space-y-3">
          <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {breedName}
          </h3>
          {BOB_AWARDS.map((award) => {
            const filtered = PUPPY_AWARDS.has(award.type)
              ? winners.filter((w) => isPuppyOnShowDate(w.dogDateOfBirth, showDate))
              : winners;
            const existing = existingAchievements.find(
              (a) => a.type === award.type && winners.some((w) => w.dogId === a.dogId)
            );
            return (
              <AwardSelect
                key={award.type}
                label={award.label}
                type={award.type}
                existingDogId={existing?.dogId}
                isPublished={!!existing?.publishedAt}
                candidates={filtered}
                onRecord={(dogId, type) => recordAchievement.mutate({ showId, dogId, type, date: showDate })}
                onRemove={(dogId, type) => removeAchievement.mutate({ showId, dogId, type })}
                onPublish={(dogId, type) => publishAchievement.mutate({ showId, dogId, type })}
                onUnpublish={(dogId, type) => unpublishAchievement.mutate({ showId, dogId, type })}
              />
            );
          })}
          {isChampionship && (
            <>
              <div className="mt-2 border-t pt-2" />
              {CHAMPIONSHIP_AWARDS.map((award) => {
                const sexFilter = requiredSexForAward(award.type);
                const basePool = RESERVE_AWARDS.has(award.type)
                  ? reserveCandidatesByBreed.get(breedName) ?? winners
                  : winners;
                let filtered = sexFilter
                  ? basePool.filter((w) => w.dogSex === sexFilter)
                  : basePool;
                if (PUPPY_AWARDS.has(award.type)) {
                  filtered = filtered.filter((w) =>
                    isPuppyOnShowDate(w.dogDateOfBirth, showDate),
                  );
                }
                const existing = existingAchievements.find(
                  (a) => a.type === award.type && basePool.some((w) => w.dogId === a.dogId)
                );
                return (
                  <AwardSelect
                    key={award.type}
                    label={award.label}
                    type={award.type}
                    existingDogId={existing?.dogId}
                    isPublished={!!existing?.publishedAt}
                    candidates={filtered}
                    onRecord={(dogId, type) => recordAchievement.mutate({ showId, dogId, type, date: showDate })}
                    onRemove={(dogId, type) => removeAchievement.mutate({ showId, dogId, type })}
                    onPublish={(dogId, type) => publishAchievement.mutate({ showId, dogId, type })}
                    onUnpublish={(dogId, type) => unpublishAchievement.mutate({ showId, dogId, type })}
                  />
                );
              })}
            </>
          )}
        </div>
      ))}

      {/* Show-level awards (BIS). Gate on *breed count*, not winner count —
          a single-breed show can have many class winners but BIS isn't
          applicable; conversely even a 2-breed show with one class winner
          each still has a meaningful BIS selection. */}
      {classWinnersByBreed.size > 1 && (
        <div className="rounded-lg border border-se-honey-line bg-se-honey-soft/50 p-3 sm:p-4 space-y-3">
          <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-se-honey-deep">
            Show Awards
          </h3>
          {BIS_AWARDS
            .filter((award) => award.type !== 'best_long_coat_in_show' || isChampionship)
            .map((award) => {
            const existing = existingAchievements.find((a) => a.type === award.type);
            const pool = PUPPY_AWARDS.has(award.type)
              ? allWinners.filter((w) => isPuppyOnShowDate(w.dogDateOfBirth, showDate))
              : allWinners;
            return (
              <AwardSelect
                key={award.type}
                label={award.label}
                type={award.type}
                existingDogId={existing?.dogId}
                isPublished={!!existing?.publishedAt}
                candidates={pool.map((w) => ({
                  dogId: w.dogId,
                  dogName: `${w.dogName} (${w.breedName})`,
                  catalogueNumber: null,
                  exhibitorName: '',
                }))}
                onRecord={(dogId, type) => recordAchievement.mutate({ showId, dogId, type, date: showDate })}
                onRemove={(dogId, type) => removeAchievement.mutate({ showId, dogId, type })}
                onPublish={(dogId, type) => publishAchievement.mutate({ showId, dogId, type })}
                onUnpublish={(dogId, type) => unpublishAchievement.mutate({ showId, dogId, type })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Judge Approval Section ───────────────────────────────
function JudgeApprovalSection({
  showId,
  judges,
  isLocked,
  hasAnyResults,
}: {
  showId: string;
  judges: {
    judgeId: string;
    judgeName: string;
    contactEmail: string | null;
    breeds: string[];
    approvalStatus: string | null;
    approvalSentAt: Date | null;
    approvedAt: Date | null;
    approvalNote: string | null;
  }[];
  isLocked: boolean;
  hasAnyResults: boolean;
}) {
  const utils = trpc.useUtils();
  // Which judge we're about to email — drives the confirm dialog. Emailing a
  // judge is irreversible-ish (they get a "please confirm" mail), so it gets the
  // same "are you sure?" treatment publishing a class does.
  const [confirmJudge, setConfirmJudge] = useState<{ judgeId: string; judgeName: string } | null>(null);

  const submitApproval = trpc.steward.submitForJudgeApproval.useMutation({
    onSuccess: () => {
      utils.steward.getJudgeApprovalStatus.invalidate({ showId });
      toast.success('Approval request sent to judge');
      setConfirmJudge(null);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="mt-6 sm:mt-8 space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="size-5 text-se-fresh-deep" />
        <h2 className="text-sm sm:text-base font-semibold">Judge Approval</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        When you've finished recording results for a judge, submit for their digital approval.
      </p>

      <div className="space-y-2">
        {judges.map((judge) => (
          <div
            key={judge.judgeId}
            className="rounded-lg border p-3 space-y-2"
          >
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{judge.judgeName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {judge.breeds.length > 0 ? judge.breeds.join(', ') : 'All breeds'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {judge.approvalStatus === 'approved' ? (
                  <Badge className="bg-se-fresh-soft text-se-fresh-deep text-xs gap-1">
                    <CheckCircle2 className="size-3" />
                    Approved
                  </Badge>
                ) : judge.approvalStatus === 'pending' ? (
                  <Badge className="bg-se-honey-soft text-se-honey-deep text-xs gap-1">
                    <Clock className="size-3" />
                    Awaiting
                  </Badge>
                ) : judge.approvalStatus === 'declined' ? (
                  <Badge className="bg-destructive/10 text-destructive text-xs gap-1">
                    <XCircle className="size-3" />
                    Query
                  </Badge>
                ) : null}
              </div>
            </div>

            {judge.approvalNote && (
              <p className="text-xs italic text-se-honey-deep">"{judge.approvalNote}"</p>
            )}

            {!judge.contactEmail ? (
              <p className="text-xs text-red-500">
                No email on file — ask the secretary to add one.
              </p>
            ) : !judge.approvalStatus ? (
              <>
                <Button
                  size="sm"
                  className="h-9 w-full bg-blue-600 hover:bg-blue-700 sm:w-auto"
                  disabled={submitApproval.isPending || isLocked || !hasAnyResults}
                  onClick={() =>
                    setConfirmJudge({ judgeId: judge.judgeId, judgeName: judge.judgeName })
                  }
                >
                  <Send className="mr-1 size-3" />
                  Submit for Approval
                </Button>
                {!hasAnyResults && (
                  <p className="text-xs text-muted-foreground">
                    Available once you&apos;ve recorded results.
                  </p>
                )}
              </>
            ) : judge.approvalStatus === 'declined' ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full sm:w-auto"
                disabled={submitApproval.isPending || isLocked}
                onClick={() =>
                  setConfirmJudge({ judgeId: judge.judgeId, judgeName: judge.judgeName })
                }
              >
                <Send className="mr-1 size-3" />
                Resubmit
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Confirm before emailing the judge — mirrors the publish confirmation. */}
      <Dialog open={confirmJudge != null} onOpenChange={(open) => !open && setConfirmJudge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send results to {confirmJudge?.judgeName} for approval?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This emails {confirmJudge?.judgeName} asking them to confirm the
            results you&apos;ve recorded. Ready?
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-11" onClick={() => setConfirmJudge(null)}>
              Cancel
            </Button>
            <Button
              className="h-11 bg-blue-600 hover:bg-blue-700"
              disabled={submitApproval.isPending}
              onClick={() =>
                confirmJudge && submitApproval.mutate({ showId, judgeId: confirmJudge.judgeId })
              }
            >
              <Send className="mr-1 size-4" />
              Yes, send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Reusable award select dropdown
function AwardSelect({
  label,
  type,
  existingDogId,
  isPublished,
  candidates,
  onRecord,
  onRemove,
  onPublish,
  onUnpublish,
}: {
  label: string;
  type: AchievementType;
  existingDogId?: string;
  isPublished: boolean;
  candidates: { dogId: string; dogName: string; catalogueNumber: string | null; exhibitorName: string }[];
  onRecord: (dogId: string, type: AchievementType) => void;
  onRemove: (dogId: string, type: AchievementType) => void;
  onPublish: (dogId: string, type: AchievementType) => void;
  onUnpublish: (dogId: string, type: AchievementType) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span
        className="text-xs sm:text-sm font-medium sm:w-44 sm:shrink-0 sm:truncate"
        title={label}
      >
        {label}
      </span>
      <div className="flex flex-1 items-center gap-2">
        <Select
          value={existingDogId ?? 'none'}
          onValueChange={(dogId) => {
            if (dogId === 'none') {
              if (existingDogId) onRemove(existingDogId, type);
            } else {
              if (existingDogId && existingDogId !== dogId) {
                onRemove(existingDogId, type);
              }
              onRecord(dogId, type);
            }
          }}
        >
          <SelectTrigger className="h-11 flex-1 text-xs sm:text-sm">
            <SelectValue placeholder="Select winner..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {candidates.map((w) => (
              <SelectItem key={w.dogId} value={w.dogId}>
                {w.catalogueNumber ? `#${w.catalogueNumber} ` : ''}{w.dogName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {existingDogId &&
          (isPublished ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-11 shrink-0 gap-1 border-green-300 bg-green-50 text-green-800 hover:bg-green-100"
              onClick={() => onUnpublish(existingDogId, type)}
              title="Hide this award from the public again"
            >
              <CheckCircle2 className="size-4" />
              Live
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-11 shrink-0 gap-1 bg-green-700 hover:bg-green-800"
              onClick={() => onPublish(existingDogId, type)}
              title="Publish this award to the public results page"
            >
              <Send className="size-4" />
              Publish
            </Button>
          ))}
      </div>
    </div>
  );
}
