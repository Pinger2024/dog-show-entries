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
  const [offerHotel, setOfferHotel] = useState('');
  const [offerTravel, setOfferTravel] = useState('');
  const [offerOther, setOfferOther] = useState('');
  const [offerExpenseNotes, setOfferExpenseNotes] = useState('');
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
    setOfferHotel('');
    setOfferTravel('');
    setOfferOther('');
    setOfferExpenseNotes('');
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send Judging Offer</DialogTitle>
            <DialogDescription>
              Stage 1 of the RKC three-part contract process. Review the email preview below.
            </DialogDescription>
          </DialogHeader>

          {/* Email preview */}
          {(() => {
            const judge = uniqueJudges.find((j) => j.judgeId === offerJudgeId);
            // Derive breed names: judge's assigned breeds → show breed → class breeds → show name
            const showBreedName = showData?.breed?.name;
            const classBreedNames = [...new Set(
              (showData?.showClasses ?? []).filter((sc) => sc.breed).map((sc) => sc.breed!.name)
            )];
            const fallbackBreed = showBreedName ?? (classBreedNames.length > 0 ? classBreedNames.join(', ') : (showData?.name ?? 'All breeds'));
            const breedsText = judge?.breeds.length
              ? judge.breeds.join(', ')
              : fallbackBreed;
            const showDate = showData?.startDate
              ? new Date(showData.startDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : 'TBC';
            const venue = showData?.venue
              ? `${showData.venue.name}${showData.venue.postcode ? `, ${showData.venue.postcode}` : ''}`
              : 'Venue TBC';
            const orgName = showData?.organisation?.name ?? 'the Show Society';

            return (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email preview</p>
                <div className="rounded-md bg-[#2D5F3F] px-4 py-3 text-center">
                  <p className="font-semibold text-white">Judging Appointment Offer</p>
                  <p className="text-xs text-white/70">from {orgName}</p>
                </div>
                <p className="text-muted-foreground">Dear {judge?.name ?? 'Judge'},</p>
                <p className="text-muted-foreground">On behalf of {orgName}, I have much pleasure in inviting you to judge at our forthcoming show...</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <span className="font-medium">Show</span>
                  <span>{showData?.name ?? '—'}</span>
                  <span className="font-medium">Date</span>
                  <span>{showDate}</span>
                  <span className="font-medium">Venue</span>
                  <span>{venue}</span>
                  <span className="font-medium">Breeds</span>
                  <span>{breedsText}</span>
                  {showData?.showType && (
                    <>
                      <span className="font-medium">Type</span>
                      <span className="capitalize">{showData.showType.replace('_', ' ')}</span>
                    </>
                  )}
                </div>
                {(parseFloat(offerHotel) > 0 || parseFloat(offerTravel) > 0 || parseFloat(offerOther) > 0) && (
                  <>
                    <span className="font-medium">Expenses</span>
                    <span>
                      {[
                        parseFloat(offerHotel) > 0 && `Hotel: £${parseFloat(offerHotel).toFixed(2)}`,
                        parseFloat(offerTravel) > 0 && `Travel: £${parseFloat(offerTravel).toFixed(2)}`,
                        parseFloat(offerOther) > 0 && `Other: £${parseFloat(offerOther).toFixed(2)}`,
                      ].filter(Boolean).join(', ')}
                      {offerExpenseNotes.trim() ? ` (${offerExpenseNotes.trim()})` : ''}
                    </span>
                  </>
                )}
                {offerNotes.trim() && (
                  <div className="col-span-2 rounded-md bg-background px-3 py-2 text-muted-foreground italic">
                    {offerNotes}
                  </div>
                )}
                <div className="col-span-2 flex justify-center gap-4 pt-1">
                  <span className="rounded-md bg-[#2D5F3F] px-4 py-1.5 text-xs font-medium text-white">Accept Appointment</span>
                  <span className="text-xs text-muted-foreground underline">Decline</span>
                </div>
              </div>
            );
          })()}

          <div className="space-y-4">
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
            {/* Expenses */}
            <div>
              <Label className="text-sm font-medium">Expenses Offered (optional)</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <div>
                  <Label className="text-xs text-muted-foreground">Hotel (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={offerHotel}
                    onChange={(e) => setOfferHotel(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Travel (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={offerTravel}
                    onChange={(e) => setOfferTravel(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Other (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={offerOther}
                    onChange={(e) => setOfferOther(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
              <Input
                placeholder="e.g. 2 nights at Premier Inn"
                value={offerExpenseNotes}
                onChange={(e) => setOfferExpenseNotes(e.target.value)}
                className="mt-2 h-11"
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
                  hotelCost: offerHotel ? Math.round(parseFloat(offerHotel) * 100) : undefined,
                  travelCost: offerTravel ? Math.round(parseFloat(offerTravel) * 100) : undefined,
                  otherExpenses: offerOther ? Math.round(parseFloat(offerOther) * 100) : undefined,
                  expenseNotes: offerExpenseNotes.trim() || undefined,
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
