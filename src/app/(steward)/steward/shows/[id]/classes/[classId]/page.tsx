'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Award,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { KC_PLACEMENTS, SPECIAL_AWARDS } from '@/lib/placements';
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

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center text-muted-foreground">Class not found.</div>
    );
  }

  const { showClass, entries } = data;

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
    } else {
      recordResult.mutate({
        entryClassId,
        placement: parseInt(value),
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
        </div>
      </div>

      {/* Entries list */}
      <div className="mt-6 space-y-2">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No confirmed entries in this class.
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.entryClassId}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              {/* Catalogue number — large for ringside visibility */}
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-bold">
                {entry.catalogueNumber ?? '—'}
              </div>

              {/* Dog info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {entry.dogName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.exhibitorName}
                </p>
                {entry.result?.specialAward && (
                  <Badge variant="secondary" className="mt-1 text-[10px] bg-amber-50 text-amber-700">
                    <Award className="mr-0.5 size-3" />
                    {entry.result.specialAward}
                  </Badge>
                )}
              </div>

              {/* Placement select */}
              <div className="flex items-center gap-1">
                <Select
                  value={
                    entry.result?.placement
                      ? String(entry.result.placement)
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
                  <SelectTrigger className="h-10 w-24">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {KC_PLACEMENTS.map((p) => (
                      <SelectItem key={p.value} value={String(p.value)}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Special award button */}
                <Dialog open={specialAwardOpen} onOpenChange={setSpecialAwardOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 shrink-0"
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
                          className="justify-start"
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
                          className="text-destructive"
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
          ))
        )}
      </div>

      {/* Previous / Next class navigation */}
      <div className="mt-8 flex items-center justify-between gap-2 sm:gap-4">
        {prevClass ? (
          <Button variant="outline" asChild className="min-w-0 max-w-[45%]">
            <Link href={`/steward/shows/${showId}/classes/${prevClass.id}`}>
              <ChevronLeft className="mr-1 size-4 shrink-0" />
              <span className="truncate">{prevClass.classDefinition.name}</span>
            </Link>
          </Button>
        ) : (
          <div />
        )}
        {nextClass ? (
          <Button variant="outline" asChild className="min-w-0 max-w-[45%]">
            <Link href={`/steward/shows/${showId}/classes/${nextClass.id}`}>
              <span className="truncate">{nextClass.classDefinition.name}</span>
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
