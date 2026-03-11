'use client';

import { useState, useMemo } from 'react';
import { formatRelativeDate } from '@/lib/date-utils';
import {
  Check,
  Filter,
  Loader2,
  Mail,
  Plus,
  Search,
  Send,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ActionPanelProps } from '../checklist-action-registry';

type StageFilter = 'all' | 'no_offer' | 'offer_sent' | 'offer_accepted' | 'confirmed' | 'declined';

const PAGE_SIZE = 25;

const STAGE_ORDER: Record<string, number> = {
  no_offer: 0, offer_sent: 1, offer_accepted: 2, confirmed: 3, declined: 4,
};

const STAGE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  no_offer: { label: 'No Offer', color: 'text-muted-foreground', icon: '○' },
  offer_sent: { label: 'Offer Sent', color: 'text-amber-600', icon: '◔' },
  offer_accepted: { label: 'Accepted', color: 'text-blue-600', icon: '◐' },
  confirmed: { label: 'Confirmed', color: 'text-green-600', icon: '●' },
  declined: { label: 'Declined', color: 'text-destructive', icon: '✕' },
};

export function JudgeOffersAction({ showId }: ActionPanelProps) {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<StageFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);

  // Add judge form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [kcSearchSurname, setKcSearchSurname] = useState('');
  const [kcSearchBreed, setKcSearchBreed] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [judgeKc, setJudgeKc] = useState('');
  const [judgeEmail, setJudgeEmail] = useState('');
  const [kcSelectedJudge, setKcSelectedJudge] = useState<{
    name: string;
    location: string | null;
    kcJudgeId: string;
  } | null>(null);

  const { data, isLoading } = trpc.secretary.getChecklistJudgeSummary.useQuery({ showId });

  // Mutations for judge pipeline
  const bulkOfferMutation = trpc.secretary.sendBulkJudgeOffers.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.sent} offer${result.sent !== 1 ? 's' : ''} sent${result.skipped ? `, ${result.skipped} skipped` : ''}`);
      if (result.errors.length > 0) {
        toast.error(`Failed for: ${result.errors.join(', ')}`);
      }
      utils.secretary.getChecklistJudgeSummary.invalidate({ showId });
      utils.secretary.getJudgeContracts.invalidate({ showId });
      utils.secretary.getChecklist.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkConfirmMutation = trpc.secretary.bulkSendJudgeConfirmations.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.sent} confirmation${result.sent !== 1 ? 's' : ''} sent`);
      utils.secretary.getChecklistJudgeSummary.invalidate({ showId });
      utils.secretary.getJudgeContracts.invalidate({ showId });
      utils.secretary.getChecklist.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  const resendOfferMutation = trpc.secretary.resendJudgeOffer.useMutation({
    onSuccess: () => {
      toast.success('Offer resent');
      utils.secretary.getChecklistJudgeSummary.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  const confirmMutation = trpc.secretary.sendJudgeConfirmation.useMutation({
    onSuccess: () => {
      toast.success('Confirmation sent');
      utils.secretary.getChecklistJudgeSummary.invalidate({ showId });
      utils.secretary.getJudgeContracts.invalidate({ showId });
      utils.secretary.getChecklist.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  // Mutations for adding judges
  const kcSearchMutation = trpc.secretary.kcJudgeSearch.useMutation();
  const kcProfileMutation = trpc.secretary.kcJudgeProfile.useMutation();

  const addJudgeMutation = trpc.secretary.addJudge.useMutation({
    onSuccess: (judge) => {
      // Immediately assign to this show
      assignMutation.mutate({ showId, judgeId: judge.id });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to create judge'),
  });

  const reseedMutation = trpc.secretary.reseedChecklistJudges.useMutation({
    onSuccess: () => {
      // Invalidate AFTER reseed writes new per-judge checklist items
      utils.secretary.getChecklist.invalidate({ showId });
      utils.secretary.getChecklistJudgeSummary.invalidate({ showId });
    },
  });

  const assignMutation = trpc.secretary.assignJudge.useMutation({
    onSuccess: () => {
      toast.success('Judge added to show');
      resetAddForm();
      utils.secretary.getChecklistJudgeSummary.invalidate({ showId });
      // Don't invalidate getChecklist here — wait for reseed to finish writing rows
      reseedMutation.mutate({ showId });
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to assign judge');
      resetAddForm();
    },
  });

  function resetAddForm() {
    setShowAddForm(false);
    setKcSearchSurname('');
    setKcSearchBreed('');
    setJudgeName('');
    setJudgeKc('');
    setJudgeEmail('');
    setKcSelectedJudge(null);
    kcSearchMutation.reset();
    kcProfileMutation.reset();
  }

  function handleAddJudge() {
    if (!judgeName.trim()) return;
    addJudgeMutation.mutate({
      name: judgeName.trim(),
      kcNumber: judgeKc.trim() || undefined,
      contactEmail: judgeEmail.trim() || undefined,
    });
  }

  const filteredJudges = useMemo(() => {
    if (!data) return [];
    let judges = data.judges;

    if (filter !== 'all') {
      judges = judges.filter((j) => {
        if (filter === 'no_offer') return !j.stage;
        return j.stage === filter;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      judges = judges.filter((j) =>
        j.name.toLowerCase().includes(q) ||
        j.breeds.some((b) => b.toLowerCase().includes(q))
      );
    }

    return judges.sort((a, b) => {
      const aStage = a.stage ?? 'no_offer';
      const bStage = b.stage ?? 'no_offer';
      return (STAGE_ORDER[aStage] ?? 5) - (STAGE_ORDER[bStage] ?? 5);
    });
  }, [data, filter, searchQuery]);

  const pendingOfferIds = useMemo(
    () => data?.judges.filter((j) => !j.stage && j.contactEmail).map((j) => j.judgeId) ?? [],
    [data]
  );

  const paginatedJudges = filteredJudges.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredJudges.length / PAGE_SIZE);

  const isAddingJudge = addJudgeMutation.isPending || assignMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading judge pipeline...
      </div>
    );
  }

  const hasJudges = data && data.judges.length > 0;
  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {/* Add Judge button / form */}
      {!showAddForm ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAddForm(true)}
        >
          <UserPlus className="size-3.5" />
          Add Judge
        </Button>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Add Judge to Show</p>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={resetAddForm}>
              <X className="size-3.5" />
            </Button>
          </div>

          {/* RKC Search */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Search RKC Database</Label>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                placeholder="Surname"
                value={kcSearchSurname}
                onChange={(e) => setKcSearchSurname(e.target.value)}
                className="h-9 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && kcSearchSurname.trim().length >= 2) {
                    kcSearchMutation.mutate({
                      surname: kcSearchSurname.trim(),
                      breed: kcSearchBreed.trim() || undefined,
                    });
                  }
                }}
              />
              <Input
                placeholder="Breed (optional)"
                value={kcSearchBreed}
                onChange={(e) => setKcSearchBreed(e.target.value)}
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                variant="secondary"
                className="h-9"
                onClick={() =>
                  kcSearchMutation.mutate({
                    surname: kcSearchSurname.trim(),
                    breed: kcSearchBreed.trim() || undefined,
                  })
                }
                disabled={kcSearchSurname.trim().length < 2 || kcSearchMutation.isPending}
              >
                {kcSearchMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                Search RKC
              </Button>
            </div>
          </div>

          {/* RKC Search Results */}
          {kcSearchMutation.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Searching RKC database (this takes a few seconds)...
            </div>
          )}

          {kcSearchMutation.isError && (
            <p className="text-xs text-destructive">{kcSearchMutation.error.message}</p>
          )}

          {kcSearchMutation.data && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {kcSearchMutation.data.length} found — select to auto-fill
              </p>
              <div className="max-h-36 space-y-1 overflow-y-auto">
                {kcSearchMutation.data.map((j) => (
                  <button
                    key={j.kcJudgeId}
                    type="button"
                    onClick={() => {
                      setKcSelectedJudge(j);
                      setJudgeName(j.name);
                      kcProfileMutation.mutate({ kcJudgeId: j.kcJudgeId });
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                      kcSelectedJudge?.kcJudgeId === j.kcJudgeId && 'border-primary bg-primary/5'
                    )}
                  >
                    <span className="font-medium">{j.name}</span>
                    {j.location && <span className="text-muted-foreground">{j.location}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Breed approvals for selected RKC judge */}
          {kcSelectedJudge && kcProfileMutation.data && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                Approved breeds for {kcSelectedJudge.name}
              </p>
              <div className="flex flex-wrap gap-1">
                {kcProfileMutation.data.breeds.map((b, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">
                    {b.breed} (L{b.level})
                  </Badge>
                ))}
                {kcProfileMutation.data.breeds.length === 0 && (
                  <span className="text-xs text-muted-foreground">No breed approvals found</span>
                )}
              </div>
            </div>
          )}

          {/* Manual entry / confirm details */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {kcSelectedJudge ? 'Confirm Details' : 'Or Enter Manually'}
            </Label>
            <div className="grid grid-cols-1 gap-2">
              <Input
                placeholder="Name *"
                value={judgeName}
                onChange={(e) => setJudgeName(e.target.value)}
                className="h-9 text-sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="RKC Number"
                  value={judgeKc}
                  onChange={(e) => setJudgeKc(e.target.value)}
                  className="h-9 text-sm"
                />
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={judgeEmail}
                  onChange={(e) => setJudgeEmail(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="min-h-[2.75rem] sm:min-h-0"
              onClick={handleAddJudge}
              disabled={!judgeName.trim() || isAddingJudge}
            >
              {isAddingJudge ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add to Show
            </Button>
            <Button variant="outline" className="min-h-[2.75rem] sm:min-h-0" onClick={resetAddForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Empty state (only when no judges AND form is not open) */}
      {!hasJudges && !showAddForm && (
        <p className="py-2 text-center text-sm text-muted-foreground">
          No judges assigned yet. Click &ldquo;Add Judge&rdquo; above to get started.
        </p>
      )}

      {/* Pipeline content — only when we have judges */}
      {hasJudges && summary && (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap gap-2 text-xs">
            {summary.confirmed > 0 && (
              <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                {summary.confirmed} confirmed
              </Badge>
            )}
            {summary.accepted > 0 && (
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                {summary.accepted} accepted
              </Badge>
            )}
            {summary.offerSent > 0 && (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                {summary.offerSent} awaiting
              </Badge>
            )}
            {summary.noOffer > 0 && (
              <Badge variant="outline">
                {summary.noOffer} no offer
              </Badge>
            )}
            {summary.declined > 0 && (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                {summary.declined} declined
              </Badge>
            )}
          </div>

          {/* Bulk actions */}
          <div className="flex flex-wrap gap-2">
            {pendingOfferIds.length > 0 && (
              <Button
                size="sm"
                onClick={() => bulkOfferMutation.mutate({ showId, judgeIds: pendingOfferIds })}
                disabled={bulkOfferMutation.isPending}
              >
                {bulkOfferMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                Send All Pending Offers ({pendingOfferIds.length})
              </Button>
            )}
            {summary.accepted > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => bulkConfirmMutation.mutate({ showId })}
                disabled={bulkConfirmMutation.isPending}
              >
                {bulkConfirmMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Confirm All Accepted ({summary.accepted})
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Search judges or breeds..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="h-8 text-xs flex-1"
            />
            <Select value={filter} onValueChange={(v) => { setFilter(v as StageFilter); setPage(0); }}>
              <SelectTrigger className="h-8 text-xs w-full sm:w-36">
                <Filter className="size-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="no_offer">No Offer</SelectItem>
                <SelectItem value="offer_sent">Offer Sent</SelectItem>
                <SelectItem value="offer_accepted">Accepted</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Judge list */}
          <div className="space-y-1.5">
            {paginatedJudges.map((j) => {
              const stage = j.stage ?? 'no_offer';
              const config = STAGE_CONFIG[stage] ?? STAGE_CONFIG.no_offer!;

              return (
                <div
                  key={j.judgeId}
                  className={cn(
                    'flex items-center gap-3 rounded-md border px-3 py-2.5',
                    stage === 'declined' && 'opacity-50'
                  )}
                >
                  <span className={cn('text-lg shrink-0', config.color)} title={config.label}>
                    {config.icon}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{j.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 hidden sm:inline-flex">
                        {config.label}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {j.breeds.length > 0 ? j.breeds.join(', ') : 'All breeds'}
                      {j.offerSentAt && stage === 'offer_sent' && (
                        <> — sent {formatRelativeDate(new Date(j.offerSentAt))}</>
                      )}
                      {j.acceptedAt && (stage === 'offer_accepted' || stage === 'confirmed') && (
                        <> — accepted {formatRelativeDate(new Date(j.acceptedAt))}</>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-1 shrink-0">
                    {stage === 'no_offer' && j.contactEmail && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => bulkOfferMutation.mutate({ showId, judgeIds: [j.judgeId] })}
                        disabled={bulkOfferMutation.isPending}
                      >
                        <Mail className="size-3" />
                        <span className="hidden sm:inline">Send Offer</span>
                      </Button>
                    )}
                    {stage === 'no_offer' && !j.contactEmail && (
                      <span className="text-xs text-muted-foreground italic">No email</span>
                    )}
                    {stage === 'offer_sent' && j.contractId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => resendOfferMutation.mutate({ contractId: j.contractId! })}
                        disabled={resendOfferMutation.isPending}
                      >
                        Resend
                      </Button>
                    )}
                    {stage === 'offer_accepted' && j.contractId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => confirmMutation.mutate({ contractId: j.contractId! })}
                        disabled={confirmMutation.isPending}
                      >
                        <Check className="size-3" />
                        <span className="hidden sm:inline">Confirm</span>
                      </Button>
                    )}
                    {stage === 'confirmed' && (
                      <Check className="size-4 text-green-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredJudges.length)} of {filteredJudges.length}
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
