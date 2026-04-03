'use client';

import { useState, useMemo } from 'react';
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  FileCheck,
  Gavel,
  Loader2,
  Mail,
  Plus,
  PoundSterling,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { formatCurrency, poundsToPence, penceToPoundsString } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
import { contractStageConfig } from '../_lib/show-utils';
import { JudgeCoverageDashboard } from '@/components/judges/judge-coverage-dashboard';
import { AddJudgeWizard } from '@/components/judges/add-judge-wizard';

export function JudgesSection({ showId }: { showId: string }) {
  const [adding, setAdding] = useState(false);
  const [judgeName, setJudgeName] = useState('');
  const [judgeKc, setJudgeKc] = useState('');
  const [judgeEmail, setJudgeEmail] = useState('');
  const [selectedJudgeId, setSelectedJudgeId] = useState('');
  const [judgePopoverOpen, setJudgePopoverOpen] = useState(false);
  const [selectedBreedIds, setSelectedBreedIds] = useState<string[]>([]);
  const [breedPopoverOpen, setBreedPopoverOpen] = useState(false);
  const [selectedRingId, setSelectedRingId] = useState('');
  const [selectedSexFilter, setSelectedSexFilter] = useState('both');
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerJudgeId, setOfferJudgeId] = useState('');
  const [offerEmail, setOfferEmail] = useState('');
  const [offerNotes, setOfferNotes] = useState('');
  // RKC judge search state
  const [kcSearchSurname, setKcSearchSurname] = useState('');
  const [kcSearchBreed, setKcSearchBreed] = useState('');
  const [kcSelectedJudge, setKcSelectedJudge] = useState<{
    name: string;
    location: string | null;
    kcJudgeId: string;
  } | null>(null);
  // Wizard state — undefined = no prefill (generic), null = all breeds, string = specific breed UUID
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPrefillBreedId, setWizardPrefillBreedId] = useState<string | null | undefined>(undefined);
  const [wizardPrefillSex, setWizardPrefillSex] = useState<string | null | undefined>(undefined);
  const utils = trpc.useUtils();

  const { data: assignments, isLoading } =
    trpc.secretary.getShowJudges.useQuery({ showId });
  const { data: allJudges } = trpc.secretary.getJudges.useQuery();
  const { data: breeds } = trpc.breeds.list.useQuery();
  const { data: showRings } = trpc.secretary.getShowRings.useQuery({ showId });
  const { data: contracts } = trpc.secretary.getJudgeContracts.useQuery({ showId });
  const { data: showData } = trpc.shows.getById.useQuery({ id: showId });

  // For single-breed shows, derive the breed from the show's classes
  const singleBreedId = useMemo(() => {
    if (!showData || showData.showScope !== 'single_breed') return null;
    const breedIds = new Set<string>();
    for (const sc of showData.showClasses ?? []) {
      if (sc.breed?.id) breedIds.add(sc.breed.id);
    }
    // If all classes share one breed, that's our single breed
    return breedIds.size === 1 ? Array.from(breedIds)[0]! : null;
  }, [showData]);

  // Group breeds by their RKC breed group for the searchable combobox
  const breedsByGroup = useMemo(() => {
    if (!breeds) return null;
    return breeds.reduce(
      (acc, breed) => {
        const groupName = breed.group?.name ?? 'Other';
        if (!acc[groupName]) acc[groupName] = [];
        acc[groupName].push(breed);
        return acc;
      },
      {} as Record<string, typeof breeds>
    );
  }, [breeds]);

  const addJudgeMutation = trpc.secretary.addJudge.useMutation({
    onSuccess: (judge) => {
      toast.success(`Judge "${judge.name}" created`);
      setJudgeName('');
      setJudgeKc('');
      setJudgeEmail('');
      setAdding(false);
      setSelectedJudgeId(judge.id);
      // Auto-select breed for single-breed shows
      if (singleBreedId) {
        setSelectedBreedIds([singleBreedId]);
      }
      utils.secretary.getJudges.invalidate();
    },
    onError: (err) => {
      const msg = err.message ?? 'Failed to add judge';
      // Provide more helpful error messages for common issues
      if (msg.includes('unique') || msg.includes('duplicate')) {
        toast.error('A judge with this name or RKC number already exists. Select them from the dropdown instead.');
      } else if (msg.includes('required') || msg.includes('min')) {
        toast.error('Judge name is required.');
      } else {
        toast.error(msg);
      }
    },
  });

  // Track which breed IDs are already assigned to any judge for this show
  const assignedBreedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of assignments ?? []) {
      if (a.breedId) ids.add(a.breedId);
    }
    return ids;
  }, [assignments]);

  const assignMutation = trpc.secretary.assignJudge.useMutation({
    onSuccess: () => {
      toast.success('Judge assigned to show');
      setSelectedJudgeId('');
      setSelectedBreedIds([]);
      setSelectedRingId('');
      setSelectedSexFilter('both');
      utils.secretary.getShowJudges.invalidate({ showId });
    },
    onError: (err) => {
      const msg = err.message ?? 'Failed to assign judge';
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already')) {
        toast.error('This judge is already assigned to that breed. Check the assignments below.');
      } else {
        toast.error(msg);
      }
    },
  });

  const bulkAssignMutation = trpc.secretary.bulkAssignJudge.useMutation({
    onSuccess: (data) => {
      toast.success(`Judge assigned to ${data.count} breed${data.count !== 1 ? 's' : ''}`);
      setSelectedJudgeId('');
      setSelectedBreedIds([]);
      setSelectedRingId('');
      setSelectedSexFilter('both');
      utils.secretary.getShowJudges.invalidate({ showId });
    },
    onError: (err) => {
      const msg = err.message ?? 'Failed to assign judge';
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already')) {
        toast.error('This judge is already assigned to one or more of those breeds.');
      } else {
        toast.error(msg);
      }
    },
  });

  const removeMutation = trpc.secretary.removeJudgeAssignment.useMutation({
    onSuccess: () => {
      toast.success('Judge assignment removed');
      utils.secretary.getShowJudges.invalidate({ showId });
      utils.secretary.getJudgeCoverage.invalidate({ showId });
    },
    onError: () => toast.error('Failed to remove judge assignment'),
  });

  const sendOfferMutation = trpc.secretary.sendJudgeOffer.useMutation({
    onSuccess: () => {
      toast.success('Offer email sent to judge');
      setOfferDialogOpen(false);
      setOfferJudgeId('');
      setOfferEmail('');
      setOfferNotes('');
      utils.secretary.getJudgeContracts.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to send offer'),
  });

  const resendOfferMutation = trpc.secretary.resendJudgeOffer.useMutation({
    onSuccess: () => {
      toast.success('Offer email resent');
      utils.secretary.getJudgeContracts.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to resend offer'),
  });

  const kcSearchMutation = trpc.secretary.kcJudgeSearch.useMutation();
  const kcProfileMutation = trpc.secretary.kcJudgeProfile.useMutation();

  const [pendingAction, setPendingAction] = useState<{ message: string; action: () => void } | null>(null);
  const [expandedExpenses, setExpandedExpenses] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    hotelCost: '',
    travelCost: '',
    otherExpenses: '',
    expenseNotes: '',
  });

  const expenseMutation = trpc.secretary.updateJudgeExpenses.useMutation({
    onSuccess: () => {
      toast.success('Expenses updated');
      utils.secretary.getJudgeContracts.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to update expenses'),
  });

  const confirmMutation = trpc.secretary.sendJudgeConfirmation.useMutation({
    onSuccess: () => {
      toast.success('Confirmation email sent to judge');
      utils.secretary.getJudgeContracts.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to send confirmation'),
  });

  // Build a map of judgeId -> latest contract for quick lookups
  const contractsByJudge = useMemo(() => {
    const map = new Map<string, NonNullable<typeof contracts>[number]>();
    for (const c of contracts ?? []) {
      const existing = map.get(c.judgeId);
      if (!existing || new Date(c.createdAt) > new Date(existing.createdAt)) {
        map.set(c.judgeId, c);
      }
    }
    return map;
  }, [contracts]);

  // Deduplicate judges from assignments (a judge may have multiple breed/ring assignments)
  const uniqueJudges = useMemo(() => {
    const seen = new Map<string, {
      judgeId: string;
      name: string;
      kcNumber: string | null;
      contactEmail: string | null;
      breeds: string[];
      rings: string[];
      assignmentIds: string[];
    }>();
    for (const a of assignments ?? []) {
      const existing = seen.get(a.judgeId);
      if (existing) {
        if (a.breed && !existing.breeds.includes(a.breed.name)) {
          existing.breeds.push(a.breed.name);
        }
        if (a.ring && !existing.rings.includes(`Ring ${a.ring.number}`)) {
          existing.rings.push(`Ring ${a.ring.number}`);
        }
        existing.assignmentIds.push(a.id);
      } else {
        seen.set(a.judgeId, {
          judgeId: a.judgeId,
          name: a.judge.name,
          kcNumber: a.judge.kcNumber,
          contactEmail: a.judge.contactEmail,
          breeds: a.breed ? [a.breed.name] : [],
          rings: a.ring ? [`Ring ${a.ring.number}`] : [],
          assignmentIds: [a.id],
        });
      }
    }
    return Array.from(seen.values());
  }, [assignments]);

  function openOfferDialog(judgeId: string, email: string) {
    setOfferJudgeId(judgeId);
    setOfferEmail(email);
    setOfferNotes('');
    setOfferDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Coverage Dashboard */}
      <JudgeCoverageDashboard
        showId={showId}
        onAddJudge={(breedId, sex) => {
          setWizardPrefillBreedId(breedId);
          setWizardPrefillSex(sex);
          setWizardOpen(true);
        }}
      />

      {/* Add Judge Wizard */}
      <AddJudgeWizard
        showId={showId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        prefillBreedId={wizardPrefillBreedId}
        prefillSex={wizardPrefillSex}
      />

      {/* Create new judge */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="size-5" />
                Judges
              </CardTitle>
              <CardDescription>
                Add judges via the guided wizard, or manage existing assignments below.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => { setWizardPrefillBreedId(undefined); setWizardPrefillSex(undefined); setWizardOpen(true); }}>
              <Plus className="size-4" />
              Add Judge
            </Button>
          </div>
        </CardHeader>
        {adding && (
          <CardContent className="space-y-4">
            {/* RKC Judge Search */}
            <div className="rounded-lg border bg-blue-50/50 p-4 dark:bg-blue-950/20">
              <p className="mb-3 text-sm font-medium">Search RKC Judge Database</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="kc-surname" className="text-xs text-muted-foreground">Surname *</Label>
                  <Input
                    id="kc-surname"
                    placeholder="e.g. Smith"
                    value={kcSearchSurname}
                    onChange={(e) => setKcSearchSurname(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && kcSearchSurname.trim().length >= 2) {
                        kcSearchMutation.mutate({
                          surname: kcSearchSurname.trim(),
                          breed: kcSearchBreed.trim() || undefined,
                        });
                      }
                    }}
                    className="h-11"
                  />
                </div>
                <div>
                  <Label htmlFor="kc-breed" className="text-xs text-muted-foreground">Breed (optional)</Label>
                  <Input
                    id="kc-breed"
                    placeholder="e.g. German Shepherd Dog"
                    value={kcSearchBreed}
                    onChange={(e) => setKcSearchBreed(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      kcSearchMutation.mutate({
                        surname: kcSearchSurname.trim(),
                        breed: kcSearchBreed.trim() || undefined,
                      })
                    }
                    disabled={kcSearchSurname.trim().length < 2 || kcSearchMutation.isPending}
                  >
                    {kcSearchMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                    Search RKC
                  </Button>
                </div>
              </div>

              {/* RKC Search Results */}
              {kcSearchMutation.isPending && (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Searching RKC database (this takes a few seconds)...
                </div>
              )}

              {kcSearchMutation.isError && (
                <p className="mt-3 text-sm text-destructive">{kcSearchMutation.error.message}</p>
              )}

              {kcSearchMutation.data && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {kcSearchMutation.data.length} judge{kcSearchMutation.data.length !== 1 ? 's' : ''} found — select one to auto-fill
                  </p>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {kcSearchMutation.data.map((j) => (
                      <button
                        key={j.kcJudgeId}
                        type="button"
                        onClick={() => {
                          setKcSelectedJudge(j);
                          setJudgeName(j.name);
                          // Fetch profile for breed/level details
                          kcProfileMutation.mutate({ kcJudgeId: j.kcJudgeId });
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                          kcSelectedJudge?.kcJudgeId === j.kcJudgeId && 'border-primary bg-primary/5'
                        )}
                      >
                        <span className="font-medium">{j.name}</span>
                        {j.location && (
                          <span className="text-xs text-muted-foreground">{j.location}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected judge's breed approvals */}
              {kcSelectedJudge && kcProfileMutation.isPending && (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading judge approvals...
                </div>
              )}
              {kcSelectedJudge && kcProfileMutation.data && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Approved breeds for {kcSelectedJudge.name}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {kcProfileMutation.data.breeds.map((b, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-xs"
                      >
                        {b.breed} (L{b.level})
                      </Badge>
                    ))}
                    {kcProfileMutation.data.breeds.length === 0 && (
                      <span className="text-xs text-muted-foreground">No breed approvals found</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Manual judge entry */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-sm font-medium">
                {kcSelectedJudge ? 'Confirm Judge Details' : 'Or Enter Manually'}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  placeholder="Name *"
                  value={judgeName}
                  onChange={(e) => setJudgeName(e.target.value)}
                  className="h-11"
                />
                <Input
                  placeholder="RKC Number"
                  value={judgeKc}
                  onChange={(e) => setJudgeKc(e.target.value)}
                  className="h-11"
                />
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={judgeEmail}
                  onChange={(e) => setJudgeEmail(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    addJudgeMutation.mutate({
                      name: judgeName.trim(),
                      kcNumber: judgeKc.trim() || undefined,
                      contactEmail: judgeEmail.trim() || undefined,
                    })
                  }
                  disabled={!judgeName.trim() || addJudgeMutation.isPending}
                >
                  {addJudgeMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Create Judge
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAdding(false);
                    setKcSearchSurname('');
                    setKcSearchBreed('');
                    setKcSelectedJudge(null);
                    kcSearchMutation.reset();
                    kcProfileMutation.reset();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Assign judge to show */}
      <Card>
        <CardHeader>
          <CardTitle>Assign Judge to Show</CardTitle>
          <CardDescription>
            Select a judge, pick one or more breeds, then assign. Already-assigned breeds are marked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Row 1: Judge + Ring + Sex */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Popover open={judgePopoverOpen} onOpenChange={setJudgePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={judgePopoverOpen}
                    className={cn(
                      'w-full justify-between font-normal h-11',
                      !selectedJudgeId && 'text-muted-foreground'
                    )}
                  >
                    {selectedJudgeId
                      ? (() => {
                          const j = (allJudges ?? []).find((j) => j.id === selectedJudgeId);
                          return j ? `${j.name}${j.kcNumber ? ` (${j.kcNumber})` : ''}` : 'Select judge...';
                        })()
                      : 'Select judge...'}
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="max-w-[calc(100vw-2rem)] w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search judges..." />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>No judges found.</CommandEmpty>
                      <CommandGroup>
                        {(allJudges ?? []).map((j) => (
                          <CommandItem
                            key={j.id}
                            value={j.name}
                            onSelect={() => {
                              setSelectedJudgeId(j.id);
                              setJudgePopoverOpen(false);
                              // Auto-select breed for single-breed shows
                              if (singleBreedId && selectedBreedIds.length === 0) {
                                setSelectedBreedIds([singleBreedId]);
                              }
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 size-4',
                                j.id === selectedJudgeId ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {j.name} {j.kcNumber ? `(${j.kcNumber})` : ''}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Select value={selectedRingId} onValueChange={setSelectedRingId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Ring (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No ring</SelectItem>
                  {(showRings ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Ring {r.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedSexFilter} onValueChange={setSelectedSexFilter}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Both sexes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both sexes</SelectItem>
                  <SelectItem value="dog">Dogs only</SelectItem>
                  <SelectItem value="bitch">Bitches only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Row 2: Multi-breed selection */}
            {selectedJudgeId && (
              <>
                <Popover open={breedPopoverOpen} onOpenChange={setBreedPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={breedPopoverOpen}
                      className="w-full justify-between font-normal h-11 text-muted-foreground"
                    >
                      {selectedBreedIds.length > 0
                        ? `${selectedBreedIds.length} breed${selectedBreedIds.length !== 1 ? 's' : ''} selected`
                        : 'Select breeds to assign...'}
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="max-w-[calc(100vw-2rem)] w-80 p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                    <Command shouldFilter={true}>
                      <CommandInput placeholder="Search breeds..." />
                      <CommandList className="max-h-[300px]">
                        <CommandEmpty>No breeds found.</CommandEmpty>
                        {breedsByGroup && Object.entries(breedsByGroup).map(([groupName, groupBreeds]) => (
                          <CommandGroup key={groupName} heading={groupName}>
                            {groupBreeds.map((b) => {
                              const isSelected = selectedBreedIds.includes(b.id);
                              const isAssigned = assignedBreedIds.has(b.id);
                              return (
                                <CommandItem
                                  key={b.id}
                                  value={b.name}
                                  onSelect={() => {
                                    setSelectedBreedIds((prev) =>
                                      isSelected
                                        ? prev.filter((id) => id !== b.id)
                                        : [...prev, b.id]
                                    );
                                    // Keep popover open for multi-select
                                  }}
                                  onPointerDown={(e) => e.preventDefault()}
                                  className={isAssigned ? 'opacity-50' : ''}
                                >
                                  <Check className={cn('mr-2 size-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                                  {b.name}
                                  {isAssigned && <span className="ml-auto text-xs text-muted-foreground">assigned</span>}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Selected breed chips */}
                {selectedBreedIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedBreedIds.map((id) => {
                      const breed = (breeds ?? []).find((b) => b.id === id);
                      return breed ? (
                        <Badge
                          key={id}
                          variant="secondary"
                          className="cursor-pointer gap-1 text-xs hover:bg-destructive/10"
                          onClick={() => setSelectedBreedIds((prev) => prev.filter((bid) => bid !== id))}
                        >
                          {breed.name}
                          <X className="size-3" />
                        </Badge>
                      ) : null;
                    })}
                    <button
                      onClick={() => setSelectedBreedIds([])}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear all
                    </button>
                  </div>
                )}

                {/* Assign button */}
                <Button
                  onClick={() => {
                    if (selectedBreedIds.length > 0) {
                      bulkAssignMutation.mutate({
                        showId,
                        judgeId: selectedJudgeId,
                        breedIds: selectedBreedIds,
                        ringId: selectedRingId && selectedRingId !== 'none' ? selectedRingId : null,
                        sex: selectedSexFilter === 'both' ? null : selectedSexFilter as 'dog' | 'bitch',
                      });
                    } else {
                      assignMutation.mutate({
                        showId,
                        judgeId: selectedJudgeId,
                        breedId: null,
                        ringId: selectedRingId && selectedRingId !== 'none' ? selectedRingId : null,
                        sex: selectedSexFilter === 'both' ? null : selectedSexFilter as 'dog' | 'bitch',
                      });
                    }
                  }}
                  disabled={assignMutation.isPending || bulkAssignMutation.isPending}
                  className="w-full min-h-[2.75rem] sm:w-auto"
                >
                  {(assignMutation.isPending || bulkAssignMutation.isPending) && <Loader2 className="size-4 animate-spin" />}
                  {selectedBreedIds.length > 0
                    ? `Assign ${selectedBreedIds.length} breed${selectedBreedIds.length !== 1 ? 's' : ''}`
                    : 'Assign to all breeds'}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current judge assignments with contract status */}
      <Card>
        <CardHeader>
          <CardTitle>Current Assignments ({uniqueJudges.length})</CardTitle>
          <CardDescription>
            Manage judge assignments and track the three-stage RKC contract process.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : uniqueJudges.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <Gavel className="mb-4 size-10 text-muted-foreground/40" />
              <h3 className="font-semibold">No judges assigned</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Assign judges to this show using the form above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {uniqueJudges.map((j) => {
                const contract = contractsByJudge.get(j.judgeId);
                const stage = contract?.stage;
                const stageConf = stage ? contractStageConfig[stage] : null;

                return (
                  <div key={j.judgeId} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{j.name}</span>
                          {j.kcNumber && (
                            <span className="text-sm text-muted-foreground">({j.kcNumber})</span>
                          )}
                          {stageConf ? (
                            <Badge variant={stageConf.variant}>{stageConf.label}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">No Contract</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {j.breeds.length > 0 ? (
                            j.breeds.map((b) => (
                              <Badge key={b} variant="outline" className="text-xs">{b}</Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">All breeds</span>
                          )}
                          {j.rings.map((r) => (
                            <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                          ))}
                        </div>
                        {j.contactEmail && (
                          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="size-3" />
                            {j.contactEmail}
                          </p>
                        )}
                        {contract?.offerSentAt && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Offer sent {new Date(contract.offerSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {contract.acceptedAt && ` · Accepted ${new Date(contract.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                            {contract.confirmedAt && ` · Confirmed ${new Date(contract.confirmedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                            {contract.declinedAt && ` · Declined ${new Date(contract.declinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!contract && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openOfferDialog(j.judgeId, j.contactEmail ?? '')}
                          >
                            <Send className="size-3.5" />
                            Send Offer
                          </Button>
                        )}
                        {stage === 'offer_sent' && contract && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPendingAction({
                              message: 'Resend the offer email to this judge?',
                              action: () => resendOfferMutation.mutate({ contractId: contract.id }),
                            })}
                            disabled={resendOfferMutation.isPending}
                          >
                            {resendOfferMutation.isPending ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3.5" />
                            )}
                            Resend
                          </Button>
                        )}
                        {stage === 'offer_accepted' && contract && (
                          <Button
                            size="sm"
                            onClick={() => setPendingAction({
                              message: 'Send the formal confirmation email to this judge?',
                              action: () => confirmMutation.mutate({ contractId: contract.id }),
                            })}
                            disabled={confirmMutation.isPending}
                          >
                            {confirmMutation.isPending ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <FileCheck className="size-3.5" />
                            )}
                            Send Confirmation
                          </Button>
                        )}
                        {stage === 'declined' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openOfferDialog(j.judgeId, j.contactEmail ?? contract?.judgeEmail ?? '')}
                          >
                            <Send className="size-3.5" />
                            New Offer
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-11 text-destructive hover:text-destructive"
                          onClick={() => setPendingAction({
                            message: 'Remove all assignments for this judge from this show?',
                            action: () => {
                              for (const aId of j.assignmentIds) {
                                removeMutation.mutate({ assignmentId: aId });
                              }
                            },
                          })}
                          disabled={removeMutation.isPending}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Expenses section */}
                    {contract && (
                      <div className="mt-3 border-t pt-3">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => {
                            if (expandedExpenses === contract.id) {
                              setExpandedExpenses(null);
                            } else {
                              setExpandedExpenses(contract.id);
                              setExpenseForm({
                                hotelCost: contract.hotelCost ? penceToPoundsString(contract.hotelCost) : '',
                                travelCost: contract.travelCost ? penceToPoundsString(contract.travelCost) : '',
                                otherExpenses: contract.otherExpenses ? penceToPoundsString(contract.otherExpenses) : '',
                                expenseNotes: contract.expenseNotes ?? '',
                              });
                            }
                          }}
                        >
                          <span className="flex items-center gap-1.5 font-medium">
                            <PoundSterling className="size-3.5" />
                            Expenses
                            {(contract.hotelCost || contract.travelCost || contract.otherExpenses) && (
                              <span className="text-xs font-normal">
                                — {formatCurrency((contract.hotelCost ?? 0) + (contract.travelCost ?? 0) + (contract.otherExpenses ?? 0))} total
                              </span>
                            )}
                          </span>
                          <ChevronDown className={cn('size-4 transition-transform', expandedExpenses === contract.id && 'rotate-180')} />
                        </button>

                        {expandedExpenses === contract.id && (
                          <div className="mt-3 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div>
                                <Label className="text-xs">Hotel (£)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder="0.00"
                                  value={expenseForm.hotelCost}
                                  onChange={(e) => setExpenseForm({ ...expenseForm, hotelCost: e.target.value })}
                                  className="mt-1 h-11"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Travel (£)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder="0.00"
                                  value={expenseForm.travelCost}
                                  onChange={(e) => setExpenseForm({ ...expenseForm, travelCost: e.target.value })}
                                  className="mt-1 h-11"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Other (£)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder="0.00"
                                  value={expenseForm.otherExpenses}
                                  onChange={(e) => setExpenseForm({ ...expenseForm, otherExpenses: e.target.value })}
                                  className="mt-1 h-11"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Notes</Label>
                              <Input
                                placeholder="e.g. 2 nights at Premier Inn"
                                value={expenseForm.expenseNotes}
                                onChange={(e) => setExpenseForm({ ...expenseForm, expenseNotes: e.target.value })}
                                className="mt-1 h-11"
                              />
                            </div>
                            <Button
                              size="sm"
                              onClick={() => {
                                expenseMutation.mutate({
                                  contractId: contract.id,
                                  hotelCost: expenseForm.hotelCost ? poundsToPence(parseFloat(expenseForm.hotelCost)) : null,
                                  travelCost: expenseForm.travelCost ? poundsToPence(parseFloat(expenseForm.travelCost)) : null,
                                  otherExpenses: expenseForm.otherExpenses ? poundsToPence(parseFloat(expenseForm.otherExpenses)) : null,
                                  expenseNotes: expenseForm.expenseNotes.trim() || null,
                                });
                              }}
                              disabled={expenseMutation.isPending}
                            >
                              {expenseMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                              Save Expenses
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Offer Dialog */}
      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Judging Offer</DialogTitle>
            <DialogDescription>
              Send a formal written offer to this judge. This is Stage 1 of the RKC three-part contract process.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">Judge Email</Label>
              <Input
                type="email"
                placeholder="judge@example.com"
                value={offerEmail}
                onChange={(e) => setOfferEmail(e.target.value)}
                className="mt-1 h-11"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Additional Notes (optional)</Label>
              <Input
                placeholder="Any special instructions or details..."
                value={offerNotes}
                onChange={(e) => setOfferNotes(e.target.value)}
                className="mt-1 h-11"
              />
              <p className="text-xs text-muted-foreground mt-1">
                These notes will appear in the offer email sent to the judge.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                sendOfferMutation.mutate({
                  showId,
                  judgeId: offerJudgeId,
                  judgeEmail: offerEmail.trim(),
                  notes: offerNotes.trim() || undefined,
                })
              }
              disabled={!offerEmail.trim() || sendOfferMutation.isPending}
            >
              {sendOfferMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send Offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
