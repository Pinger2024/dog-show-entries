'use client';

import { use, useState, useMemo } from 'react';
import {
  Check,
  ChevronsUpDown,
  CircleDot,
  Eye,
  FileCheck,
  Gavel,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
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
                Add judges to the system and assign them to this show.
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
          <CardContent>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-sm font-medium">Create New Judge</p>
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
                <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
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
  const utils = trpc.useUtils();

  const { data: stewards, isLoading } =
    trpc.secretary.getShowStewards.useQuery({ showId });

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
            <div className="flex gap-2">
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
                className="flex-1"
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
          <>
          {/* Mobile card view */}
          <div className="space-y-2 sm:hidden">
            {stewards.map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{assignment.user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{assignment.user.email}</p>
                  {assignment.ring && (
                    <Badge variant="outline" className="mt-1 text-xs">Ring {assignment.ring.number}</Badge>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm('Remove this steward from the show?')) {
                      removeMutation.mutate({ assignmentId: assignment.id });
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
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Ring</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {stewards.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">
                      {assignment.user.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {assignment.user.email}
                    </TableCell>
                    <TableCell>
                      {assignment.ring ? (
                        <Badge variant="outline">Ring {assignment.ring.number}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">All</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('Remove this steward from the show?')) {
                            removeMutation.mutate({ assignmentId: assignment.id });
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
