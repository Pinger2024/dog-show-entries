'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Award,
  X,
  UserX,
  Plus,
  CircleSlash,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { SPECIAL_AWARDS } from '@/lib/placements';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Ordinal label for a placement integer. 1-5 use the named labels
// (Reserve / VHC), 6+ use "6th", "7th" etc.
function placementLabel(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  if (n === 4) return 'Res';
  if (n === 5) return 'VHC';
  return `${n}th`;
}

// Per-slot accent colour. 1-5 follow the prize-card ribbon palette;
// 6+ use a neutral slate.
function placementColour(n: number): { bg: string; ring: string } {
  switch (n) {
    case 1: return { bg: 'bg-red-600', ring: 'ring-red-600' };
    case 2: return { bg: 'bg-blue-700', ring: 'ring-blue-700' };
    case 3: return { bg: 'bg-yellow-500', ring: 'ring-yellow-500' };
    case 4: return { bg: 'bg-green-700', ring: 'ring-green-700' };
    case 5: return { bg: 'bg-purple-700', ring: 'ring-purple-700' };
    default: return { bg: 'bg-slate-600', ring: 'ring-slate-600' };
  }
}

const SV_GRADES = [
  { value: 'v', label: 'V — Excellent' },
  { value: 'sg', label: 'SG — Very Good' },
  { value: 'g', label: 'G — Good' },
  { value: 'a', label: 'A — Adequate' },
  { value: 'u', label: 'U — Insufficient' },
  { value: 'disqualified', label: 'Disqualified' },
] as const;

export default function StewardClassResultsPage({
  params,
}: {
  params: Promise<{ id: string; classId: string }>;
}) {
  const { id: showId, classId } = use(params);
  const [specialAwardEntryId, setSpecialAwardEntryId] = useState<string | null>(null);
  // How many extra placement slots above the default 5 the steward has
  // explicitly added with the "+ Add Nth" button. Resets per-class.
  const [extraSlots, setExtraSlots] = useState(0);

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
  const isWusv = showClass.showRuleset === 'wusv';

  const judgeBreederWarnings = judgeName
    ? entries.filter(
        (e) =>
          e.breederName &&
          judgeName &&
          e.breederName.toLowerCase().trim() === judgeName.toLowerCase().trim()
      )
    : [];

  // Build the placement → dog map for the ladder.
  const placedByValue = new Map<number, (typeof entries)[number]>();
  for (const e of entries) {
    if (e.result?.placement != null) placedByValue.set(e.result.placement, e);
  }
  const highestPlaced = placedByValue.size > 0
    ? Math.max(...Array.from(placedByValue.keys()))
    : 0;
  const baseSlotCount = Math.max(5, highestPlaced);
  const totalSlots = baseSlotCount + extraSlots;
  const slots = Array.from({ length: totalSlots }, (_, i) => i + 1);
  const nextOpenSlot = slots.find((n) => !placedByValue.has(n)) ?? null;

  // Categorise unplaced entries for the bottom sections.
  const remaining = entries.filter(
    (e) => !e.absent && e.result?.placement == null && !e.result?.placementStatus
  );
  const absent = entries.filter((e) => e.absent);
  const withheld = entries.filter(
    (e) => !e.absent && e.result?.placementStatus === 'withheld'
  );
  const explicitlyUnplaced = entries.filter(
    (e) => !e.absent && e.result?.placementStatus === 'unplaced'
  );

  const dogsForward = entries.filter((e) => !e.absent).length;
  const placedCount = placedByValue.size;
  const progressPct = dogsForward > 0 ? Math.round((placedCount / dogsForward) * 100) : 0;

  const sortedClasses = allClasses?.sort((a, b) => a.sortOrder - b.sortOrder);
  const currentIndex = sortedClasses?.findIndex((c) => c.id === classId) ?? -1;
  const prevClass = currentIndex > 0 ? sortedClasses?.[currentIndex - 1] : undefined;
  const nextClass =
    sortedClasses && currentIndex < sortedClasses.length - 1
      ? sortedClasses[currentIndex + 1]
      : undefined;

  function placeNext(entryClassId: string, specialAward: string | null) {
    if (nextOpenSlot == null) {
      toast.error('No empty placement slot — clear one first or add another');
      return;
    }
    recordResult.mutate({
      entryClassId,
      placement: nextOpenSlot,
      placementStatus: null,
      specialAward,
    });
  }

  function clearPlacement(entryClassId: string) {
    removeResult.mutate({ entryClassId });
  }

  function setStatus(
    entryClassId: string,
    status: 'withheld' | 'unplaced',
    currentSpecialAward: string | null
  ) {
    recordResult.mutate({
      entryClassId,
      placement: null,
      placementStatus: status,
      specialAward: currentSpecialAward,
    });
  }

  return (
    <div>
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
          {showClass.sex && (
            <Badge variant="outline" className="ml-2 capitalize text-xs align-middle">
              {showClass.sex}
            </Badge>
          )}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {showClass.breed && <span>{showClass.breed.name}</span>}
          <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
          <span className="font-medium text-foreground">· {dogsForward} forward</span>
          {entries.length - dogsForward > 0 && (
            <span className="text-amber-600">({entries.length - dogsForward} absent)</span>
          )}
        </div>

        {/* Progress bar */}
        {dogsForward > 0 && (
          <>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-700 to-green-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{placedCount} placed</span>
              {' · '}
              {remaining.length} remaining
              {' · '}
              <span>{progressPct}%</span>
            </p>
          </>
        )}
      </div>

      {isLocked && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Lock className="size-4 shrink-0" />
          <p>Results have been published. Editing is locked. Contact the secretary to make changes.</p>
        </div>
      )}

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

      {entries.length === 0 ? (
        <p className="mt-8 py-8 text-center text-sm text-muted-foreground">
          No confirmed entries in this class.
        </p>
      ) : (
        <div className={cn('mt-5', isLocked && 'pointer-events-none opacity-60')}>
          {/* How to use — quick reference */}
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50/60 p-3 text-xs text-green-900">
            <p className="font-semibold">How to use this page</p>
            <ul className="mt-1 space-y-0.5 text-green-800">
              <li>· <strong>Tap any dog</strong> in the list to place it in the next open slot</li>
              <li>· <strong>Tap ×</strong> next to a placed dog to undo</li>
              <li>· <strong>Tap "Status ▾"</strong> on a dog to mark Absent / Withheld / Unplaced</li>
              <li>· <strong>Tap the trophy</strong> to give a Special Award (Best of Breed, etc)</li>
            </ul>
          </div>

          {/* Placement ladder */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="bg-green-800 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
              Placements
            </div>
            <div className="divide-y">
              {slots.map((n) => {
                const placed = placedByValue.get(n);
                const isActive = nextOpenSlot === n;
                const colour = placementColour(n);
                return (
                  <div
                    key={n}
                    className={cn(
                      'flex min-h-[58px] items-center gap-3 px-3 py-2',
                      isActive && 'border-l-4 border-amber-400 bg-amber-50/60 pl-2'
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white',
                        colour.bg
                      )}
                    >
                      {placementLabel(n)}
                    </div>
                    <div className="min-w-0 flex-1">
                      {placed ? (
                        <>
                          <p className="text-xs font-semibold text-muted-foreground">
                            #{placed.catalogueNumber ?? '—'}
                          </p>
                          <p className="truncate text-sm font-semibold">
                            {placed.dogName}
                          </p>
                          {placed.result?.specialAward && (
                            <Badge variant="secondary" className="mt-1 text-xs bg-amber-50 text-amber-700">
                              <Award className="mr-0.5 size-3" />
                              {placed.result.specialAward}
                            </Badge>
                          )}
                        </>
                      ) : isActive ? (
                        <p className="text-sm italic text-muted-foreground">
                          Tap a dog below to place {placementLabel(n)} →
                        </p>
                      ) : (
                        <p className="text-sm italic text-muted-foreground">—</p>
                      )}
                    </div>
                    {placed && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 text-muted-foreground"
                        onClick={() => clearPlacement(placed.entryClassId)}
                        title="Clear this placement"
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 border-t bg-muted/40 px-3 py-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 flex-1"
                onClick={() => setExtraSlots((n) => n + 1)}
              >
                <Plus className="mr-1 size-4" />
                Add {placementLabel(totalSlots + 1)}
              </Button>
              {extraSlots > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10"
                  onClick={() => setExtraSlots((n) => Math.max(0, n - 1))}
                  disabled={placedByValue.has(totalSlots)}
                  title="Remove last empty slot"
                >
                  Remove last
                </Button>
              )}
            </div>
          </div>

          {/* Not-yet-placed list */}
          {remaining.length > 0 && (
            <>
              <div className="mt-5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Not yet placed ({remaining.length})
                </p>
                {nextOpenSlot != null && (
                  <p className="text-xs text-muted-foreground">
                    Tap to place {placementLabel(nextOpenSlot)}
                  </p>
                )}
              </div>
              <div className="mt-2 space-y-2">
                {remaining.map((entry) => (
                  <DogCard
                    key={entry.entryClassId}
                    entry={entry}
                    canPlace={nextOpenSlot != null}
                    onPlace={() => placeNext(entry.entryClassId, entry.result?.specialAward ?? null)}
                    onMarkAbsent={() => markAbsent.mutate({ entryId: entry.entryId, absent: true })}
                    onWithhold={() => setStatus(entry.entryClassId, 'withheld', entry.result?.specialAward ?? null)}
                    onUnplaced={() => setStatus(entry.entryClassId, 'unplaced', entry.result?.specialAward ?? null)}
                    onOpenSpecialAward={() => setSpecialAwardEntryId(entry.entryClassId)}
                    isWusv={isWusv}
                    onChangeGrade={(grade) => {
                      recordResult.mutate({
                        entryClassId: entry.entryClassId,
                        placement: entry.result?.placement ?? null,
                        placementStatus: (entry.result?.placementStatus as "withheld" | "unplaced" | null | undefined) ?? null,
                        specialAward: entry.result?.specialAward ?? null,
                        svGrade: grade,
                      });
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Withheld / Unplaced / Absent categories */}
          {(withheld.length > 0 || explicitlyUnplaced.length > 0 || absent.length > 0) && (
            <div className="mt-5 space-y-3">
              {withheld.length > 0 && (
                <CategoryCard
                  title="Withheld"
                  tone="amber"
                  entries={withheld}
                  onClear={(id) => removeResult.mutate({ entryClassId: id })}
                />
              )}
              {explicitlyUnplaced.length > 0 && (
                <CategoryCard
                  title="Unplaced"
                  tone="slate"
                  entries={explicitlyUnplaced}
                  onClear={(id) => removeResult.mutate({ entryClassId: id })}
                />
              )}
              {absent.length > 0 && (
                <CategoryCard
                  title="Absent"
                  tone="muted"
                  entries={absent}
                  onClear={(id, entryId) => markAbsent.mutate({ entryId: entryId!, absent: false })}
                  clearLabel="Mark present"
                />
              )}
            </div>
          )}

          {/* Special-award dialog (one shared, scoped by selected entry id) */}
          {specialAwardEntryId && (() => {
            const entry = entries.find((e) => e.entryClassId === specialAwardEntryId);
            if (!entry) return null;
            return (
              <Dialog
                open={true}
                onOpenChange={(open) => setSpecialAwardEntryId(open ? specialAwardEntryId : null)}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Special Award — {entry.dogName}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-2">
                    {SPECIAL_AWARDS.map((award) => (
                      <Button
                        key={award}
                        variant={entry.result?.specialAward === award ? 'default' : 'outline'}
                        className="justify-start h-11"
                        onClick={() => {
                          recordResult.mutate({
                            entryClassId: entry.entryClassId,
                            placement: entry.result?.placement ?? null,
                            placementStatus: (entry.result?.placementStatus as "withheld" | "unplaced" | null | undefined) ?? null,
                            specialAward:
                              entry.result?.specialAward === award ? null : award,
                          });
                          setSpecialAwardEntryId(null);
                        }}
                      >
                        {award}
                      </Button>
                    ))}
                    {entry.result?.specialAward && (
                      <Button
                        variant="ghost"
                        className="text-destructive h-11"
                        onClick={() => {
                          recordResult.mutate({
                            entryClassId: entry.entryClassId,
                            placement: entry.result?.placement ?? null,
                            placementStatus: (entry.result?.placementStatus as "withheld" | "unplaced" | null | undefined) ?? null,
                            specialAward: null,
                          });
                          setSpecialAwardEntryId(null);
                        }}
                      >
                        <X className="mr-1 size-4" />
                        Remove Award
                      </Button>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            );
          })()}
        </div>
      )}

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

// ─────────────────────────────────────────────────────────────────────────

interface DogCardEntry {
  entryClassId: string;
  entryId: string;
  catalogueNumber: string | null;
  dogName: string;
  exhibitorName: string | null;
  absent: boolean;
  result: {
    specialAward: string | null;
    svGrade?: 'v' | 'sg' | 'g' | 'a' | 'u' | 'disqualified' | null;
  } | null;
}

function DogCard({
  entry,
  canPlace,
  onPlace,
  onMarkAbsent,
  onWithhold,
  onUnplaced,
  onOpenSpecialAward,
  isWusv,
  onChangeGrade,
}: {
  entry: DogCardEntry;
  canPlace: boolean;
  onPlace: () => void;
  onMarkAbsent: () => void;
  onWithhold: () => void;
  onUnplaced: () => void;
  onOpenSpecialAward: () => void;
  isWusv: boolean;
  onChangeGrade: (grade: 'v' | 'sg' | 'g' | 'a' | 'u' | 'disqualified' | null) => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl border bg-card p-2.5 transition-all',
        canPlace && 'cursor-pointer hover:border-green-700 hover:shadow-sm active:scale-[0.99]'
      )}
      onClick={(e) => {
        if (!canPlace) return;
        // Don't fire when tapping the dog row's action buttons
        const tag = (e.target as HTMLElement).closest('button,[role="menuitem"],[role="dialog"]');
        if (tag) return;
        onPlace();
      }}
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-green-800 text-base font-bold text-white">
        {entry.catalogueNumber ?? '—'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{entry.dogName}</p>
        <p className="truncate text-xs text-muted-foreground">{entry.exhibitorName}</p>
        {entry.result?.specialAward && (
          <Badge variant="secondary" className="mt-1 text-xs bg-amber-50 text-amber-700">
            <Award className="mr-0.5 size-3" />
            {entry.result.specialAward}
          </Badge>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {isWusv && (
          <Select
            value={entry.result?.svGrade ?? 'none'}
            onValueChange={(v) =>
              onChangeGrade(v === 'none' ? null : (v as 'v' | 'sg' | 'g' | 'a' | 'u' | 'disqualified'))
            }
          >
            <SelectTrigger
              className="h-9 w-[88px] text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <SelectValue placeholder="Grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Grade —</SelectItem>
              {SV_GRADES.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSpecialAward();
            }}
            className={cn(
              'inline-flex h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors',
              entry.result?.specialAward
                ? 'border-amber-300 bg-amber-100 text-amber-800'
                : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
            )}
            title="Give a Special Award (Best of Breed, etc)"
          >
            <Award className="size-3.5" />
            Award
          </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              title="Mark as absent / withheld / unplaced"
            >
              Status
              <ChevronDown className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-1.5" align="end" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={onMarkAbsent}
            >
              <UserX className="size-4 text-amber-600" />
              Mark as absent
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={onWithhold}
            >
              <CircleSlash className="size-4 text-amber-600" />
              Mark as withheld
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={onUnplaced}
            >
              <CircleSlash className="size-4 text-muted-foreground" />
              Mark as unplaced
            </button>
          </PopoverContent>
        </Popover>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function CategoryCard({
  title,
  tone,
  entries,
  onClear,
  clearLabel = 'Clear',
}: {
  title: string;
  tone: 'amber' | 'slate' | 'muted';
  entries: {
    entryClassId: string;
    entryId: string;
    catalogueNumber: string | null;
    dogName: string;
    exhibitorName: string | null;
  }[];
  onClear: (entryClassId: string, entryId?: string) => void;
  clearLabel?: string;
}) {
  const toneClasses =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50/70'
      : tone === 'slate'
        ? 'border-slate-200 bg-slate-50/70'
        : 'border-muted-foreground/10 bg-muted/30';
  const titleClasses =
    tone === 'amber'
      ? 'text-amber-700'
      : tone === 'slate'
        ? 'text-slate-600'
        : 'text-muted-foreground';
  return (
    <div className={cn('overflow-hidden rounded-xl border', toneClasses)}>
      <div
        className={cn(
          'px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
          titleClasses
        )}
      >
        {title} ({entries.length})
      </div>
      <div className="divide-y divide-white/40">
        {entries.map((e) => (
          <div key={e.entryClassId} className="flex items-center gap-3 px-3 py-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-muted-foreground">
              {e.catalogueNumber ?? '—'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{e.dogName}</p>
              <p className="truncate text-xs text-muted-foreground">{e.exhibitorName}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onClear(e.entryClassId, e.entryId)}
            >
              {clearLabel}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
