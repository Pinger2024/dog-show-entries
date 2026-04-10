'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Award,
  X,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { SPECIAL_AWARDS, getPlacementsForScope } from '@/lib/placements';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function StewardClassResultsPage({
  params,
}: {
  params: Promise<{ id: string; classId: string }>;
}) {
  const { id: showId, classId } = use(params);
  const [specialAwardOpen, setSpecialAwardOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.steward.getClassEntries.useQuery({
    showClassId: classId,
  });

  const { data: allClasses } = trpc.steward.getShowClasses.useQuery({
    showId,
  });

  const { data: lockStatus } = trpc.steward.getResultsLockStatus.useQuery({
    showId,
  });

  const recordResult = trpc.steward.recordResult.useMutation({
    onSuccess: () => {
      utils.steward.getClassEntries.invalidate({ showClassId: classId });
      utils.steward.getShowClasses.invalidate({ showId });
      utils.steward.getResultsSummary.invalidate({ showId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const removeResult = trpc.steward.removeResult.useMutation({
    onSuccess: () => {
      utils.steward.getClassEntries.invalidate({ showClassId: classId });
      utils.steward.getShowClasses.invalidate({ showId });
      utils.steward.getResultsSummary.invalidate({ showId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const markAbsent = trpc.steward.markAbsent.useMutation({
    onSuccess: () => {
      utils.steward.getClassEntries.invalidate({ showClassId: classId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center text-muted-foreground">Class not found.</div>
    );
  }

  const { showClass, entries, judgeName } = data;
  const isLocked = lockStatus?.locked ?? false;

  // Check if judge bred any dogs in this class
  const judgeBreederWarnings = judgeName
    ? entries.filter(
        (e) =>
          e.breederName &&
          judgeName &&
          e.breederName.toLowerCase().trim() === judgeName.toLowerCase().trim()
      )
    : [];

  // Scope-aware placements: all-breed = 1st–HC, breed = 1st–Commended
  const availablePlacements = getPlacementsForScope(showClass.showScope);

  // Set of placement integers already taken by other entries in this class.
  // Each placement should only ever be assigned to one dog, so the steward
  // shouldn't be able to pick the same placement twice — once an entry has
  // 1st, "1st" disappears from every other entry's dropdown. Amanda flagged
  // this in testing.
  const usedPlacements = new Set(
    entries
      .map((e) => e.result?.placement)
      .filter((p): p is number => p != null)
  );

  // "Dogs forward" = present (not absent) — standard RKC terminology
  const dogsForward = entries.filter((e) => !e.absent).length;

  // Find prev/next class
  const sortedClasses = allClasses?.sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
  const currentIndex =
    sortedClasses?.findIndex((c) => c.id === classId) ?? -1;
  const prevClass =
    currentIndex > 0 ? sortedClasses?.[currentIndex - 1] : undefined;
  const nextClass =
    sortedClasses && currentIndex < sortedClasses.length - 1
      ? sortedClasses[currentIndex + 1]
      : undefined;

  function handlePlacementChange(
    entryClassId: string,
    value: string,
    currentSpecialAward: string | null
  ) {
    if (value === 'none') {
      removeResult.mutate({ entryClassId });
    } else if (value === 'withheld' || value === 'unplaced') {
      // Non-numeric statuses go in the new placementStatus column,
      // and we explicitly null out the numeric placement.
      recordResult.mutate({
        entryClassId,
        placement: null,
        placementStatus: value,
        specialAward: currentSpecialAward,
      });
    } else {
      recordResult.mutate({
        entryClassId,
        placement: parseInt(value),
        placementStatus: null,
        specialAward: currentSpecialAward,
      });
    }
  }

  function handleSpecialAward(entryClassId: string, award: string | null, currentPlacement: number | null) {
    recordResult.mutate({
      entryClassId,
      placement: currentPlacement,
      specialAward: award,
    });
    setSpecialAwardOpen(false);
  }

  return (
    <div>
      {/* Header */}
      <Link
        href={`/steward/shows/${showId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to classes
      </Link>

      <div className="mt-3">
        <h1 className="font-serif text-xl font-bold">
          {showClass.classDefinition.name}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {showClass.breed && <span>{showClass.breed.name}</span>}
          {showClass.sex && (
            <Badge variant="outline" className="capitalize text-xs">
              {showClass.sex}
            </Badge>
          )}
          <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
          <span className="font-medium text-foreground">
            · {dogsForward} forward
          </span>
          {entries.length - dogsForward > 0 && (
            <span className="text-amber-600">
              ({entries.length - dogsForward} absent)
            </span>
          )}
        </div>
      </div>

      {/* Locked banner */}
      {isLocked && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Lock className="size-4 shrink-0" />
          <p>Results have been published. Editing is locked. Contact the secretary to make changes.</p>
        </div>
      )}

      {/* Judge breeder conflict warnings */}
      {judgeBreederWarnings.length > 0 && (
        <div className="mt-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
          {judgeBreederWarnings.map((entry) => (
            <div key={entry.entryClassId} className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="size-4 shrink-0" />
              <p>{entry.dogName} was bred by the assigned judge ({judgeName})</p>
            </div>
          ))}
        </div>
      )}

      {/* Entries list */}
      <div className={`mt-6 space-y-2 ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No confirmed entries in this class.
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.entryClassId}
              className={`rounded-lg border ${entry.absent ? 'opacity-50' : ''}`}
            >
              <div className="flex flex-col gap-2 p-3">
                {/* Top row: catalogue number + dog info + absent toggle */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Catalogue number — large for ringside visibility */}
                  <div className={`flex size-12 shrink-0 items-center justify-center rounded-lg text-lg font-bold ${entry.absent ? 'bg-amber-100 text-amber-600' : 'bg-muted'}`}>
                    {entry.absent ? 'Abs' : (entry.catalogueNumber ?? '—')}
                  </div>

                  {/* Dog info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`truncate text-sm font-medium ${entry.absent ? 'line-through' : ''}`}>
                        {entry.dogName}
                      </p>
                      {entry.absent && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 shrink-0">
                          Absent
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.exhibitorName}
                      {!entry.absent && entry.catalogueNumber && ` · #${entry.catalogueNumber}`}
                    </p>
                    {entry.result?.specialAward && (
                      <Badge variant="secondary" className="mt-1 text-xs bg-amber-50 text-amber-700">
                        <Award className="mr-0.5 size-3" />
                        {entry.result.specialAward}
                      </Badge>
                    )}
                  </div>

                  {/* Absent toggle */}
                  <Button
                    variant={entry.absent ? 'default' : 'ghost'}
                    size="icon"
                    className={`size-11 shrink-0 ${entry.absent ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'text-muted-foreground/40'}`}
                    title={entry.absent ? 'Mark as present' : 'Mark as absent'}
                    onClick={() =>
                      markAbsent.mutate({
                        entryId: entry.entryId,
                        absent: !entry.absent,
                      })
                    }
                  >
                    <UserX className="size-4" />
                  </Button>
                </div>

                {/* Bottom row: placement select + award button — indented past catalogue number */}
                <div className={`flex items-center gap-2 pl-14 ${entry.absent ? 'pointer-events-none opacity-30' : ''}`}>
                  <Select
                    value={
                      entry.result?.placement
                        ? String(entry.result.placement)
                        : entry.result?.placementStatus
                          ? entry.result.placementStatus
                          : 'none'
                    }
                    onValueChange={(v) =>
                      handlePlacementChange(
                        entry.entryClassId,
                        v,
                        entry.result?.specialAward ?? null
                      )
                    }
                  >
                    <SelectTrigger className="h-11 flex-1">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {availablePlacements.map((p) => {
                        // Hide placements that another entry has already
                        // claimed, but keep this entry's own selection
                        // visible so the steward can see/clear it.
                        const isOwnSelection = entry.result?.placement === p.value;
                        if (usedPlacements.has(p.value) && !isOwnSelection) {
                          return null;
                        }
                        return (
                          <SelectItem key={p.value} value={String(p.value)}>
                            {p.label}
                          </SelectItem>
                        );
                      })}
                      {/* Non-numeric placement statuses — Amanda's
                          additions in steward testing. Withheld is when
                          the judge withholds a placement; Unplaced is an
                          explicit "judged but not in the prizes". Both
                          are mutually exclusive with a numeric placement. */}
                      <SelectItem value="withheld">Withheld</SelectItem>
                      <SelectItem value="unplaced">Unplaced</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Special award button */}
                  <Dialog open={specialAwardOpen} onOpenChange={setSpecialAwardOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0"
                        title="Special Award"
                      >
                        <Award className={`size-4 ${entry.result?.specialAward ? 'text-amber-500' : 'text-muted-foreground/40'}`} />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          Special Award — {entry.dogName}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-2">
                        {SPECIAL_AWARDS.map((award) => (
                          <Button
                            key={award}
                            variant={
                              entry.result?.specialAward === award
                                ? 'default'
                                : 'outline'
                            }
                            className="justify-start h-11"
                            onClick={() =>
                              handleSpecialAward(
                                entry.entryClassId,
                                entry.result?.specialAward === award
                                  ? null
                                  : award,
                                entry.result?.placement ?? null
                              )
                            }
                          >
                            {award}
                          </Button>
                        ))}
                        {entry.result?.specialAward && (
                          <Button
                            variant="ghost"
                            className="text-destructive h-11"
                            onClick={() =>
                              handleSpecialAward(
                                entry.entryClassId,
                                null,
                                entry.result?.placement ?? null
                              )
                            }
                          >
                            <X className="mr-1 size-4" />
                            Remove Award
                          </Button>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

            </div>
          ))
        )}
      </div>

      {/* Previous / Next class navigation */}
      <div className="mt-8 flex items-center justify-between gap-2 sm:gap-4">
        {prevClass ? (
          <Button variant="outline" asChild className="h-11">
            <Link href={`/steward/shows/${showId}/classes/${prevClass.id}`}>
              <ChevronLeft className="mr-1 size-4 shrink-0" />
              Previous Class
            </Link>
          </Button>
        ) : (
          <div />
        )}
        {nextClass ? (
          <Button variant="outline" asChild className="h-11">
            <Link href={`/steward/shows/${showId}/classes/${nextClass.id}`}>
              Next Class
              <ChevronRight className="ml-1 size-4 shrink-0" />
            </Link>
          </Button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
