'use client';

import { use, useState, useMemo } from 'react';
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  CircleDot,
  Eye,
  FileCheck,
  Gavel,
  Loader2,
  Mail,
  Plus,
  PoundSterling,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { formatCurrency, poundsToPence, penceToPoundsString } from '@/lib/date-utils';
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
import { contractStageConfig } from '../_lib/show-utils';

// ── Judges Section ───────────────────────────────────────────────

function JudgesSection({ showId }: { showId: string }) {
  const [adding, setAdding] = useState(false);
  const [judgeName, setJudgeName] = useState('');
  const [judgeKc, setJudgeKc] = useState('');
  const [judgeEmail, setJudgeEmail] = useState('');
  const [selectedJudgeId, setSelectedJudgeId] = useState('');
  const [judgePopoverOpen, setJudgePopoverOpen] = useState(false);
  const [selectedBreedId, setSelectedBreedId] = useState('');
  const [selectedRingId, setSelectedRingId] = useState('');
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerJudgeId, setOfferJudgeId] = useState('');
  const [offerEmail, setOfferEmail] = useState('');
  const [offerNotes, setOfferNotes] = useState('');
  // KC judge search state
  const [kcSearchSurname, setKcSearchSurname] = useState('');
  const [kcSearchBreed, setKcSearchBreed] = useState('');
  const [kcSelectedJudge, setKcSelectedJudge] = useState<{
    name: string;
    location: string | null;
    kcJudgeId: string;
  } | null>(null);
  const utils = trpc.useUtils();

  const { data: assignments, isLoading } =
    trpc.secretary.getShowJudges.useQuery({ showId });
  const { data: allJudges } = trpc.secretary.getJudges.useQuery();
  const { data: breeds } = trpc.breeds.list.useQuery();
  const { data: showRings } = trpc.secretary.getShowRings.useQuery({ showId });
  const { data: contracts } = trpc.secretary.getJudgeContracts.useQuery({ showId });

  const addJudgeMutation = trpc.secretary.addJudge.useMutation({
    onSuccess: (judge) => {
      toast.success(`Judge "${judge.name}" created`);
      setJudgeName('');
      setJudgeKc('');
      setJudgeEmail('');
      setAdding(false);
      setSelectedJudgeId(judge.id);
      utils.secretary.getJudges.invalidate();
    },
    onError: (err) => toast.error(err.message ?? 'Failed to add judge'),
  });

  const assignMutation = trpc.secretary.assignJudge.useMutation({
    onSuccess: () => {
      toast.success('Judge assigned to show');
      setSelectedJudgeId('');
      setSelectedBreedId('');
      setSelectedRingId('');
      utils.secretary.getShowJudges.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to assign judge'),
  });

  const removeMutation = trpc.secretary.removeJudgeAssignment.useMutation({
    onSuccess: () => {
      toast.success('Judge assignment removed');
      utils.secretary.getShowJudges.invalidate({ showId });
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
                Search the KC database or add judges manually.
              </CardDescription>
            </div>
            {!adding && (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus className="size-4" />
                New Judge
              </Button>
            )}
          </div>
        </CardHeader>
        {adding && (
          <CardContent className="space-y-4">
            {/* KC Judge Search */}
            <div className="rounded-lg border bg-blue-50/50 p-4 dark:bg-blue-950/20">
              <p className="mb-3 text-sm font-medium">Search KC Judge Database</p>
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
                  />
                </div>
                <div>
                  <Label htmlFor="kc-breed" className="text-xs text-muted-foreground">Breed (optional)</Label>
                  <Input
                    id="kc-breed"
                    placeholder="e.g. German Shepherd Dog"
                    value={kcSearchBreed}
                    onChange={(e) => setKcSearchBreed(e.target.value)}
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
                    Search KC
                  </Button>
                </div>
              </div>

              {/* KC Search Results */}
              {kcSearchMutation.isPending && (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Searching KC database (this takes a few seconds)...
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
                        className="text-[10px]"
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
                />
                <Input
                  placeholder="KC Number"
                  value={judgeKc}
                  onChange={(e) => setJudgeKc(e.target.value)}
                />
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={judgeEmail}
                  onChange={(e) => setJudgeEmail(e.target.value)}
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
            Select an existing judge and optionally assign them to a breed and ring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Popover open={judgePopoverOpen} onOpenChange={setJudgePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={judgePopoverOpen}
                  className={cn(
                    'w-full justify-between font-normal',
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
              <PopoverContent className="w-[min(90vw,400px)] sm:w-[--radix-popover-trigger-width] p-0" align="start">
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
            <Select value={selectedBreedId} onValueChange={setSelectedBreedId}>
              <SelectTrigger>
                <SelectValue placeholder="Breed (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All breeds</SelectItem>
                {(breeds ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedRingId} onValueChange={setSelectedRingId}>
              <SelectTrigger>
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
            <Button
              onClick={() =>
                assignMutation.mutate({
                  showId,
                  judgeId: selectedJudgeId,
                  breedId: selectedBreedId && selectedBreedId !== 'none' ? selectedBreedId : null,
                  ringId: selectedRingId && selectedRingId !== 'none' ? selectedRingId : null,
                })
              }
              disabled={!selectedJudgeId || assignMutation.isPending}
            >
              {assignMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current judge assignments with contract status */}
      <Card>
        <CardHeader>
          <CardTitle>Current Assignments ({uniqueJudges.length})</CardTitle>
          <CardDescription>
            Manage judge assignments and track the three-stage KC contract process.
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
                            onClick={() => {
                              if (confirm('Resend the offer email to this judge?')) {
                                resendOfferMutation.mutate({ contractId: contract.id });
                              }
                            }}
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
                            onClick={() => {
                              if (confirm('Send the formal confirmation email to this judge?')) {
                                confirmMutation.mutate({ contractId: contract.id });
                              }
                            }}
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
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm('Remove all assignments for this judge from this show?')) {
                              for (const aId of j.assignmentIds) {
                                removeMutation.mutate({ assignmentId: aId });
                              }
                            }
                          }}
                          disabled={removeMutation.isPending}
                        >
                          <Trash2 className="size-3.5" />
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
                                  className="mt-1"
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
                                  className="mt-1"
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
                                  className="mt-1"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Notes</Label>
                              <Input
                                placeholder="e.g. 2 nights at Premier Inn"
                                value={expenseForm.expenseNotes}
                                onChange={(e) => setExpenseForm({ ...expenseForm, expenseNotes: e.target.value })}
                                className="mt-1"
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
              Send a formal written offer to this judge. This is Stage 1 of the KC three-part contract process.
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
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Additional Notes (optional)</Label>
              <Input
                placeholder="Any special instructions or details..."
                value={offerNotes}
                onChange={(e) => setOfferNotes(e.target.value)}
                className="mt-1"
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
    </div>
  );
}

// ── Rings Section ────────────────────────────────────────────────

function RingsSection({ showId }: { showId: string }) {
  const [adding, setAdding] = useState(false);
  const [ringNumber, setRingNumber] = useState('');
  const [ringDay, setRingDay] = useState('');
  const [ringTime, setRingTime] = useState('');
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
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Start Time</label>
                <Input
                  type="time"
                  value={ringTime}
                  onChange={(e) => setRingTime(e.target.value)}
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
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <CircleDot className="mb-4 size-10 text-muted-foreground/40" />
            <h3 className="font-semibold">No rings defined</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add rings so judges and stewards can be assigned to specific areas.
            </p>
          </div>
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
                  className="size-9 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm('Remove this ring? Any judge/steward assignments to this ring will be unlinked.')) {
                      removeMutation.mutate({ ringId: ring.id });
                    }
                  }}
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
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('Remove this ring? Any judge/steward assignments to this ring will be unlinked.')) {
                            removeMutation.mutate({ ringId: ring.id });
                          }
                        }}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="size-3.5" />
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
  );
}

// ── Stewards Section ──────────────────────────────────────────────

function StewardsSection({ showId }: { showId: string }) {
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [breedDialogId, setBreedDialogId] = useState<string | null>(null);
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
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <Eye className="mb-4 size-10 text-muted-foreground/40" />
            <h3 className="font-semibold">No stewards assigned</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Assign stewards so they can record results from ringside during the show.
            </p>
          </div>
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
                        className="h-8 text-xs"
                        onClick={() => setBreedDialogId(assignment.id)}
                      >
                        <CircleDot className="size-3.5" />
                        Breeds
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('Remove this steward from the show?')) {
                            removeMutation.mutate({ assignmentId: assignment.id });
                          }
                        }}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="size-3.5" />
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
                          <label key={date} className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleBreedDate(breed.id, date)}
                              className="size-3.5 rounded border-gray-300"
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

export default function PeoplePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);

  return (
    <Tabs defaultValue="judges">
      <TabsList>
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
