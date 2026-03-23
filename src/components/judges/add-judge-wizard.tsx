'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Check,
  ChevronRight,
  Loader2,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ── Types ───────────────────────────────────────────────

type Step = 'find' | 'assign' | 'confirm';

interface FoundJudge {
  id?: string; // set if from local DB
  name: string;
  kcNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  kcJudgeId?: string; // RKC UUID for profile lookup
  source: 'local' | 'rkc' | 'manual';
  rkcApprovals?: { breed: string; group: string; level: number }[];
}

interface BreedSexCombo {
  breedId: string | null;
  breedName: string | null;
  sex: string | null;
  selected: boolean;
}

interface AddJudgeWizardProps {
  showId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a specific breed+sex when triggered from the coverage dashboard */
  prefillBreedId?: string | null;
  prefillSex?: string | null;
}

// ── Helpers ─────────────────────────────────────────────

function sexLabel(sex: string | null): string {
  if (sex === 'dog') return 'Dogs';
  if (sex === 'bitch') return 'Bitches';
  return 'All';
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'find', label: 'Find Judge' },
  { key: 'assign', label: 'Assign Breeds' },
  { key: 'confirm', label: 'Confirm' },
];

// ── Component ───────────────────────────────────────────

export function AddJudgeWizard({
  showId,
  open,
  onOpenChange,
  prefillBreedId,
  prefillSex,
}: AddJudgeWizardProps) {
  // ── Step state ──
  const [step, setStep] = useState<Step>('find');

  // ── Find step state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJudge, setSelectedJudge] = useState<FoundJudge | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualKc, setManualKc] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  // ── Assign step state ──
  const [breedCombos, setBreedCombos] = useState<BreedSexCombo[]>([]);

  // ── Queries ──
  const utils = trpc.useUtils();
  const { data: showData } = trpc.shows.getById.useQuery({ id: showId });

  const localSearchQuery = trpc.secretary.searchJudges.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: searchQuery.length >= 2 },
  );

  const kcSearchMutation = trpc.secretary.kcJudgeSearch.useMutation();
  const kcProfileMutation = trpc.secretary.kcJudgeProfile.useMutation();
  const addAndAssignMutation = trpc.secretary.addAndAssignJudge.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.judge.name} added — ${data.assignmentCount} assignment${data.assignmentCount !== 1 ? 's' : ''} created`);
      utils.secretary.getShowJudges.invalidate({ showId });
      utils.secretary.getJudgeCoverage.invalidate({ showId });
      utils.secretary.getChecklistAutoDetect.invalidate({ showId });
      resetAndClose();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to add judge');
    },
  });

  // ── Derive show breed+sex combos for the assign step ──
  const showBreedSexCombos = useMemo(() => {
    if (!showData?.showClasses) return [];
    const combos = new Map<string, { breedId: string | null; breedName: string | null; sex: string | null }>();
    for (const sc of showData.showClasses) {
      const key = `${sc.breed?.id ?? 'all'}:${sc.sex ?? 'both'}`;
      if (!combos.has(key)) {
        combos.set(key, {
          breedId: sc.breed?.id ?? null,
          breedName: sc.breed?.name ?? null,
          sex: sc.sex,
        });
      }
    }
    return Array.from(combos.values());
  }, [showData]);

  // ── Reset ──
  const resetAndClose = useCallback(() => {
    setStep('find');
    setSearchQuery('');
    setSelectedJudge(null);
    setManualMode(false);
    setManualName('');
    setManualKc('');
    setManualEmail('');
    setManualPhone('');
    setBreedCombos([]);
    onOpenChange(false);
  }, [onOpenChange]);

  // ── Step transitions ──

  function goToAssign(judge: FoundJudge) {
    setSelectedJudge(judge);

    // Build breed combos, pre-selecting based on prefill or RKC approvals
    const combos: BreedSexCombo[] = showBreedSexCombos.map((c) => {
      // If triggered from coverage dashboard with a specific breed/sex, pre-select that
      const isPrefilled = prefillBreedId !== undefined
        && c.breedId === prefillBreedId
        && (prefillSex === undefined || c.sex === prefillSex);

      return {
        breedId: c.breedId,
        breedName: c.breedName,
        sex: c.sex,
        selected: isPrefilled,
      };
    });

    // If judge has RKC approvals, filter to only show breeds they can judge
    if (judge.rkcApprovals && judge.rkcApprovals.length > 0) {
      const approvedBreedNames = new Set(judge.rkcApprovals.map((a) => a.breed.toLowerCase()));
      // Mark combos as not selectable if the judge isn't approved for that breed
      // But still show them — just with a visual indicator
      for (const combo of combos) {
        if (combo.breedName && !approvedBreedNames.has(combo.breedName.toLowerCase())) {
          // Not approved — could still be selected (secretary knows best) but show a warning
          (combo as BreedSexCombo & { notApproved?: boolean }).notApproved = true;
        }
      }
    }

    setBreedCombos(combos);
    setStep('assign');
  }

  function selectLocalJudge(judge: NonNullable<typeof localSearchQuery.data>[number]) {
    goToAssign({
      id: judge.id,
      name: judge.name,
      kcNumber: judge.kcNumber,
      contactEmail: judge.contactEmail,
      contactPhone: judge.contactPhone,
      source: 'local',
    });
  }

  function selectRkcJudge(result: { name: string; kcJudgeId: string; location: string | null }) {
    // Fetch profile for breed approvals
    kcProfileMutation.mutate({ kcJudgeId: result.kcJudgeId }, {
      onSuccess: (profile) => {
        goToAssign({
          name: result.name,
          kcNumber: null, // RKC search doesn't return the KC number
          contactEmail: null,
          contactPhone: null,
          kcJudgeId: result.kcJudgeId,
          source: 'rkc',
          rkcApprovals: profile.breeds,
        });
      },
    });
  }

  function selectManual() {
    goToAssign({
      name: manualName.trim(),
      kcNumber: manualKc.trim() || null,
      contactEmail: manualEmail.trim() || null,
      contactPhone: manualPhone.trim() || null,
      source: 'manual',
    });
  }

  function handleConfirm() {
    if (!selectedJudge) return;

    const selectedCombos = breedCombos.filter((c) => c.selected);
    if (selectedCombos.length === 0) {
      toast.error('Select at least one breed/sex combination');
      return;
    }

    // Use the email from the form — the user may have entered/updated it on the confirm step
    const email = selectedJudge.contactEmail ?? manualEmail;
    if (!email) {
      toast.error('Email is required — judges need it to receive their offer');
      return;
    }

    addAndAssignMutation.mutate({
      showId,
      name: selectedJudge.name,
      kcNumber: selectedJudge.kcNumber ?? undefined,
      contactEmail: email,
      contactPhone: selectedJudge.contactPhone ?? undefined,
      kcJudgeId: selectedJudge.kcJudgeId,
      assignments: selectedCombos.map((c) => ({
        breedId: c.breedId,
        sex: c.sex as 'dog' | 'bitch' | null,
      })),
    });
  }

  function toggleBreedCombo(index: number) {
    setBreedCombos((prev) => prev.map((c, i) => i === index ? { ...c, selected: !c.selected } : c));
  }

  // ── Render ────────────────────────────────────────────

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);
  const selectedCount = breedCombos.filter((c) => c.selected).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); else onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            Add Judge to Show
          </DialogTitle>
          <DialogDescription>
            {step === 'find' && 'Search for a judge or enter their details manually'}
            {step === 'assign' && `Select which breeds ${selectedJudge?.name} will judge`}
            {step === 'confirm' && 'Review and confirm the assignment'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <div className={cn(
                'flex size-6 items-center justify-center rounded-full text-xs font-medium',
                i < currentStepIndex && 'bg-green-600 text-white',
                i === currentStepIndex && 'bg-primary text-primary-foreground',
                i > currentStepIndex && 'bg-muted text-muted-foreground',
              )}>
                {i < currentStepIndex ? <Check className="size-3" /> : i + 1}
              </div>
              <span className={cn(
                'text-xs',
                i === currentStepIndex ? 'font-medium' : 'text-muted-foreground',
              )}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <ChevronRight className="size-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Find Judge ── */}
        {step === 'find' && (
          <div className="space-y-4">
            {/* Search input */}
            <div>
              <Label htmlFor="judge-search" className="text-sm font-medium">Judge surname</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="judge-search"
                  placeholder="Type to search..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setManualMode(false); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
                      kcSearchMutation.mutate({ surname: searchQuery.trim() });
                    }
                  }}
                  className="h-11 pl-9"
                  autoFocus
                />
              </div>
            </div>

            {/* Local DB results */}
            {searchQuery.length >= 2 && localSearchQuery.data && localSearchQuery.data.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Judges in Remi ({localSearchQuery.data.length})
                </p>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {localSearchQuery.data.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => selectLocalJudge(j)}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <div>
                        <span className="font-medium">{j.name}</span>
                        {j.kcNumber && <span className="ml-2 text-xs text-muted-foreground">KC# {j.kcNumber}</span>}
                      </div>
                      <Badge variant="outline" className="text-[10px]">Select</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* RKC search trigger */}
            {searchQuery.length >= 2 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => kcSearchMutation.mutate({ surname: searchQuery.trim() })}
                  disabled={kcSearchMutation.isPending}
                  className="min-h-[2.75rem]"
                >
                  {kcSearchMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  Search RKC Database
                </Button>
                {kcSearchMutation.isPending && (
                  <span className="text-xs text-muted-foreground">This takes a few seconds...</span>
                )}
              </div>
            )}

            {/* RKC results */}
            {kcSearchMutation.data && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  RKC Results ({kcSearchMutation.data.length})
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {kcSearchMutation.data.map((j) => (
                    <button
                      key={j.kcJudgeId}
                      type="button"
                      onClick={() => selectRkcJudge(j)}
                      disabled={kcProfileMutation.isPending}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                        kcProfileMutation.isPending && 'opacity-50',
                      )}
                    >
                      <div>
                        <span className="font-medium">{j.name}</span>
                        {j.location && <span className="ml-2 text-xs text-muted-foreground">{j.location}</span>}
                      </div>
                      <Badge variant="outline" className="text-[10px]">Select</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {kcSearchMutation.isError && (
              <p className="text-sm text-destructive">{kcSearchMutation.error.message}</p>
            )}

            {kcProfileMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading judge approvals...
              </div>
            )}

            {/* Manual entry fallback */}
            <div className="border-t pt-3">
              {!manualMode ? (
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="text-sm text-primary hover:underline"
                >
                  Not found? Enter details manually
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Enter Judge Details</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Name *</Label>
                      <Input
                        placeholder="Full name"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Email *</Label>
                      <Input
                        type="email"
                        inputMode="email"
                        placeholder="judge@example.com"
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">RKC Number</Label>
                      <Input
                        placeholder="Optional"
                        value={manualKc}
                        onChange={(e) => setManualKc(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <Input
                        type="tel"
                        inputMode="tel"
                        placeholder="Optional"
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                        className="h-11"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={selectManual}
                    disabled={!manualName.trim() || !manualEmail.trim()}
                    className="min-h-[2.75rem]"
                  >
                    Next — Assign Breeds
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Assign Breeds ── */}
        {step === 'assign' && selectedJudge && (
          <div className="space-y-4">
            {/* Judge summary */}
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-sm font-medium">{selectedJudge.name}</p>
              {selectedJudge.kcNumber && (
                <p className="text-xs text-muted-foreground">KC# {selectedJudge.kcNumber}</p>
              )}
              {selectedJudge.rkcApprovals && selectedJudge.rkcApprovals.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {selectedJudge.rkcApprovals.slice(0, 8).map((a, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      {a.breed} (L{a.level})
                    </Badge>
                  ))}
                  {selectedJudge.rkcApprovals.length > 8 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{selectedJudge.rkcApprovals.length - 8} more
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Email if not yet provided (required) */}
            {!selectedJudge.contactEmail && (
              <div>
                <Label className="text-xs text-muted-foreground">Email * (required for sending offers)</Label>
                <Input
                  type="email"
                  inputMode="email"
                  placeholder="judge@example.com"
                  value={manualEmail}
                  onChange={(e) => {
                    setManualEmail(e.target.value);
                    setSelectedJudge((prev) => prev ? { ...prev, contactEmail: e.target.value } : null);
                  }}
                  className="h-11"
                />
              </div>
            )}

            {/* Breed+sex selection */}
            <div>
              <p className="mb-2 text-sm font-medium">
                Which breeds will {selectedJudge.name.split(' ')[0]} judge at this show?
              </p>
              {breedCombos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No classes found for this show. Add classes first.</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {breedCombos.map((combo, i) => {
                    const notApproved = (combo as BreedSexCombo & { notApproved?: boolean }).notApproved;
                    return (
                      <label
                        key={i}
                        className={cn(
                          'flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent',
                          combo.selected && 'border-primary bg-primary/5',
                          notApproved && 'opacity-60',
                        )}
                      >
                        <Checkbox
                          checked={combo.selected}
                          onCheckedChange={() => toggleBreedCombo(i)}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">
                            {combo.breedName ?? 'All Breeds'}
                          </span>
                          {combo.sex && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              — {sexLabel(combo.sex)}
                            </span>
                          )}
                        </div>
                        {notApproved && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                            Not on RKC approvals
                          </Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setStep('find')} className="min-h-[2.75rem]">
                Back
              </Button>
              <Button
                onClick={() => setStep('confirm')}
                disabled={selectedCount === 0 || (!selectedJudge.contactEmail && !manualEmail)}
                className="min-h-[2.75rem]"
              >
                Review ({selectedCount} selected)
                <ChevronRight className="size-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 'confirm' && selectedJudge && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Judge</p>
                <p className="font-medium">{selectedJudge.name}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{selectedJudge.contactEmail ?? manualEmail}</p>
                </div>
                {selectedJudge.kcNumber && (
                  <div>
                    <p className="text-xs text-muted-foreground">RKC Number</p>
                    <p className="text-sm">{selectedJudge.kcNumber}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Judging ({selectedCount} assignment{selectedCount !== 1 ? 's' : ''})
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {breedCombos.filter((c) => c.selected).map((c, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {c.breedName ?? 'All Breeds'}
                      {c.sex && ` — ${sexLabel(c.sex)}`}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setStep('assign')} className="min-h-[2.75rem]">
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={addAndAssignMutation.isPending}
                className="min-h-[2.75rem]"
              >
                {addAndAssignMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Add Judge to Show
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
