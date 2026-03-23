'use client';

import { useState, useMemo } from 'react';
import {
  CircleDot,
  Eye,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useShowId } from '../_lib/show-context';
import { JudgesSection } from '../_components/judge-section';

// ── Rings Section ────────────────────────────────────────────────

function RingsSection({ showId }: { showId: string }) {
  const [adding, setAdding] = useState(false);
  const [ringNumber, setRingNumber] = useState('');
  const [ringDay, setRingDay] = useState('');
  const [ringTime, setRingTime] = useState('');
  const [pendingAction, setPendingAction] = useState<{ message: string; action: () => void } | null>(null);
  const utils = trpc.useUtils();

  const { data: showRings, isLoading } =
    trpc.secretary.getShowRings.useQuery({ showId });

  const addMutation = trpc.secretary.addRing.useMutation({
    onSuccess: () => {
      toast.success('Ring added');
      setRingNumber('');
      setRingDay('');
      setRingTime('');
      setAdding(false);
      utils.secretary.getShowRings.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to add ring'),
  });

  const removeMutation = trpc.secretary.removeRing.useMutation({
    onSuccess: () => {
      toast.success('Ring removed');
      utils.secretary.getShowRings.invalidate({ showId });
    },
    onError: () => toast.error('Failed to remove ring'),
  });

  // Suggest the next ring number
  const nextNumber = (showRings?.length ?? 0) + 1;

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CircleDot className="size-5" />
              Rings ({showRings?.length ?? 0})
            </CardTitle>
            <CardDescription>
              Define the judging rings for this show. Rings can be assigned to judges and stewards.
            </CardDescription>
          </div>
          {!adding && (
            <Button onClick={() => { setAdding(true); setRingNumber(String(nextNumber)); }}>
              <Plus className="size-4" />
              Add Ring
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Add ring form */}
        {adding && (
          <div className="mb-6 rounded-lg border bg-muted/30 p-4">
            <p className="mb-3 text-sm font-medium">Add Ring</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ring Number *</label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 1"
                  value={ringNumber}
                  onChange={(e) => setRingNumber(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Show Day</label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 1"
                  value={ringDay}
                  onChange={(e) => setRingDay(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Start Time</label>
                <Input
                  type="time"
                  value={ringTime}
                  onChange={(e) => setRingTime(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  addMutation.mutate({
                    showId,
                    number: parseInt(ringNumber),
                    showDay: ringDay ? parseInt(ringDay) : null,
                    startTime: ringTime || null,
                  })
                }
                disabled={!ringNumber || addMutation.isPending}
              >
                {addMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Add Ring
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Ring list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !showRings || showRings.length === 0 ? (
          <EmptyState
            icon={CircleDot}
            title="No rings defined"
            description="Add rings so judges and stewards can be assigned to specific areas."
            variant="dashed"
          />
        ) : (
          <>
          {/* Mobile card view */}
          <div className="space-y-2 sm:hidden">
            {showRings.map((ring) => (
              <div key={ring.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">Ring {ring.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {ring.showDay ? `Day ${ring.showDay}` : 'No day set'}
                    {ring.startTime && ` · ${ring.startTime}`}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-11 text-destructive hover:text-destructive"
                  onClick={() => setPendingAction({
                    message: 'Remove this ring? Any judge/steward assignments to this ring will be unlinked.',
                    action: () => removeMutation.mutate({ ringId: ring.id }),
                  })}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ring</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {showRings.map((ring) => (
                  <TableRow key={ring.id}>
                    <TableCell className="font-medium">Ring {ring.number}</TableCell>
                    <TableCell>
                      {ring.showDay ? `Day ${ring.showDay}` : '—'}
                    </TableCell>
                    <TableCell>{ring.startTime ?? '—'}</TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-11 text-destructive hover:text-destructive"
                        onClick={() => setPendingAction({
                          message: 'Remove this ring? Any judge/steward assignments to this ring will be unlinked.',
                          action: () => removeMutation.mutate({ ringId: ring.id }),
                        })}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </CardContent>
    </Card>

    <AlertDialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>{pendingAction?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { pendingAction?.action(); setPendingAction(null); }}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ── Stewards Section ──────────────────────────────────────────────

function StewardsSection({ showId }: { showId: string }) {
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [breedDialogId, setBreedDialogId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ message: string; action: () => void } | null>(null);
  const utils = trpc.useUtils();

  const { data: stewards, isLoading } =
    trpc.secretary.getShowStewards.useQuery({ showId });
  const { data: showData } = trpc.shows.getById.useQuery({ id: showId });
  const { data: showClasses } = trpc.shows.getClasses.useQuery({ showId });

  const assignMutation = trpc.secretary.assignSteward.useMutation({
    onSuccess: () => {
      toast.success('Steward assigned');
      setEmail('');
      setAdding(false);
      utils.secretary.getShowStewards.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to assign steward'),
  });

  const removeMutation = trpc.secretary.removeSteward.useMutation({
    onSuccess: () => {
      toast.success('Steward removed');
      utils.secretary.getShowStewards.invalidate({ showId });
    },
    onError: () => toast.error('Failed to remove steward'),
  });

  // Unique breeds in the show (from show classes)
  const showBreeds = useMemo(() => {
    if (!showClasses) return [];
    const breedMap = new Map<string, string>();
    for (const sc of showClasses) {
      const breed = sc.breed as { id: string; name: string } | null;
      if (breed) breedMap.set(breed.id, breed.name);
    }
    return Array.from(breedMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [showClasses]);

  // Show dates (each day of multi-day shows)
  const showDates = useMemo(() => {
    if (!showData) return [];
    const dates: string[] = [];
    const start = new Date(showData.startDate);
    const end = showData.endDate ? new Date(showData.endDate) : start;
    const d = new Date(start);
    while (d <= end) {
      dates.push(d.toISOString().split('T')[0]!);
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }, [showData]);

  const dialogAssignment = stewards?.find((s) => s.id === breedDialogId);

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="size-5" />
              Stewards ({stewards?.length ?? 0})
            </CardTitle>
            <CardDescription>
              Assign stewards who can record results at ringside using their phone.
            </CardDescription>
          </div>
          {!adding && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Add Steward
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Add steward form */}
        {adding && (
          <div className="mb-6 rounded-lg border bg-muted/30 p-4">
            <p className="mb-2 text-sm font-medium">Add Steward by Email</p>
            <p className="mb-3 text-xs text-muted-foreground">
              The user must have a Remi account. If they&apos;re currently an exhibitor,
              their role will be upgraded to steward.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="steward@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email.trim()) {
                    assignMutation.mutate({ showId, email: email.trim() });
                  }
                }}
                className="flex-1 h-11"
              />
              <Button
                onClick={() =>
                  assignMutation.mutate({ showId, email: email.trim() })
                }
                disabled={!email.trim() || assignMutation.isPending}
              >
                {assignMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Assign
              </Button>
              <Button variant="outline" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Steward list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !stewards || stewards.length === 0 ? (
          <EmptyState
            icon={Eye}
            title="No stewards assigned"
            description="Assign stewards so they can record results from ringside during the show."
            variant="dashed"
          />
        ) : (
          <div className="space-y-3">
            {stewards.map((assignment) => {
              const assignedBreeds = assignment.breedAssignments ?? [];
              const uniqueBreedNames = [...new Set(assignedBreeds.map((ba: { breed: { name: string } }) => ba.breed.name))];
              return (
                <div key={assignment.id} className="rounded-lg border p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{assignment.user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{assignment.user.email}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[2.75rem] text-xs"
                        onClick={() => setBreedDialogId(assignment.id)}
                      >
                        <CircleDot className="size-3.5" />
                        Breeds
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-11 text-destructive hover:text-destructive"
                        onClick={() => setPendingAction({
                          message: 'Remove this steward from the show?',
                          action: () => removeMutation.mutate({ assignmentId: assignment.id }),
                        })}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {uniqueBreedNames.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {uniqueBreedNames.map((name) => (
                        <Badge key={name} variant="secondary" className="text-[10px]">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-muted-foreground">All breeds (no filter)</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Breed assignment dialog */}
        {dialogAssignment && (
          <BreedAssignmentDialog
            assignmentId={dialogAssignment.id}
            stewardName={dialogAssignment.user.name ?? 'Steward'}
            currentAssignments={dialogAssignment.breedAssignments ?? []}
            showBreeds={showBreeds}
            showDates={showDates}
            onClose={() => setBreedDialogId(null)}
          />
        )}
      </CardContent>
    </Card>

    <AlertDialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>{pendingAction?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { pendingAction?.action(); setPendingAction(null); }}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ── Breed Assignment Dialog ─────────────────────────────────────

function BreedAssignmentDialog({
  assignmentId,
  stewardName,
  currentAssignments,
  showBreeds,
  showDates,
  onClose,
}: {
  assignmentId: string;
  stewardName: string;
  currentAssignments: { breedId: string; showDate: string; breed: { id: string; name: string } }[];
  showBreeds: { id: string; name: string }[];
  showDates: string[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const isMultiDay = showDates.length > 1;

  // State: Set of "breedId:date" keys
  const [selected, setSelected] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const ba of currentAssignments) {
      set.add(`${ba.breedId}:${ba.showDate}`);
    }
    return set;
  });

  const setBreedsMutation = trpc.secretary.setStewardBreeds.useMutation({
    onSuccess: () => {
      toast.success('Breed assignments updated');
      utils.secretary.getShowStewards.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message ?? 'Failed to update'),
  });

  function toggleBreedDate(breedId: string, date: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = `${breedId}:${date}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleBreedAllDays(breedId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allKeys = showDates.map((d) => `${breedId}:${d}`);
      const allSelected = allKeys.every((k) => next.has(k));
      if (allSelected) {
        allKeys.forEach((k) => next.delete(k));
      } else {
        allKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  }

  function handleSave() {
    const breeds = Array.from(selected).map((key) => {
      const [breedId, showDate] = key.split(':');
      return { breedId: breedId!, showDate: showDate! };
    });
    setBreedsMutation.mutate({ stewardAssignmentId: assignmentId, breeds });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Breed Assignments — {stewardName}</DialogTitle>
          <DialogDescription>
            Select which breeds this steward should see{isMultiDay ? ' on each day' : ''}.
            Unassigned stewards see all breeds.
          </DialogDescription>
        </DialogHeader>

        {showBreeds.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No breeds found in this show&apos;s classes yet.
          </p>
        ) : (
          <div className="space-y-2">
            {showBreeds.map((breed) => {
              const allDaysKeys = showDates.map((d) => `${breed.id}:${d}`);
              const allChecked = allDaysKeys.every((k) => selected.has(k));
              const someChecked = allDaysKeys.some((k) => selected.has(k));

              return (
                <div key={breed.id} className="rounded-lg border p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={() => toggleBreedAllDays(breed.id)}
                      className="size-4 rounded border-gray-300"
                    />
                    <span className="text-sm font-medium">{breed.name}</span>
                    {isMultiDay && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {allChecked ? 'All days' : someChecked ? 'Some days' : ''}
                      </span>
                    )}
                  </label>

                  {isMultiDay && someChecked && (
                    <div className="mt-2 ml-6 flex flex-wrap gap-2">
                      {showDates.map((date) => {
                        const key = `${breed.id}:${date}`;
                        const checked = selected.has(key);
                        return (
                          <label key={date} className="flex items-center gap-1 cursor-pointer py-1.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleBreedDate(breed.id, date)}
                              className="size-4 rounded border-gray-300"
                            />
                            <span className="text-xs text-muted-foreground">
                              {new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                              })}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={setBreedsMutation.isPending}
          >
            {setBreedsMutation.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── People Page ──────────────────────────────────────────────────

export default function PeoplePage() {
  const showId = useShowId();

  return (
    <Tabs defaultValue="judges">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="judges">Judges</TabsTrigger>
        <TabsTrigger value="rings">Rings</TabsTrigger>
        <TabsTrigger value="stewards">Stewards</TabsTrigger>
      </TabsList>
      <TabsContent value="judges"><JudgesSection showId={showId} /></TabsContent>
      <TabsContent value="rings"><RingsSection showId={showId} /></TabsContent>
      <TabsContent value="stewards"><StewardsSection showId={showId} /></TabsContent>
    </Tabs>
  );
}
