'use client';

import { useState, useMemo } from 'react';
import {
  Check,
  ChevronDown,
  Circle,
  Filter,
  Loader2,
  Mail,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ActionPanelProps } from '../checklist-action-registry';

type StageFilter = 'all' | 'no_offer' | 'offer_sent' | 'offer_accepted' | 'confirmed' | 'declined';

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
  const PAGE_SIZE = 25;

  const { data, isLoading } = trpc.secretary.getChecklistJudgeSummary.useQuery({ showId });

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

  const filteredJudges = useMemo(() => {
    if (!data) return [];
    let judges = data.judges;

    // Apply stage filter
    if (filter !== 'all') {
      judges = judges.filter((j) => {
        if (filter === 'no_offer') return !j.stage;
        return j.stage === filter;
      });
    }

    // Apply search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      judges = judges.filter((j) =>
        j.name.toLowerCase().includes(q) ||
        j.breeds.some((b) => b.toLowerCase().includes(q))
      );
    }

    // Sort: no offer first, then pending, then accepted, then confirmed, then declined
    const stageOrder: Record<string, number> = {
      no_offer: 0, offer_sent: 1, offer_accepted: 2, confirmed: 3, declined: 4,
    };
    return judges.sort((a, b) => {
      const aStage = a.stage ?? 'no_offer';
      const bStage = b.stage ?? 'no_offer';
      return (stageOrder[aStage] ?? 5) - (stageOrder[bStage] ?? 5);
    });
  }, [data, filter, searchQuery]);

  const paginatedJudges = filteredJudges.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredJudges.length / PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading judge pipeline...
      </div>
    );
  }

  if (!data || data.judges.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No judges assigned to this show yet. Add judges in the People section first.
      </div>
    );
  }

  const { summary } = data;
  const pendingOfferIds = data.judges
    .filter((j) => !j.stage && j.contactEmail)
    .map((j) => j.judgeId);

  return (
    <div className="space-y-4">
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
                    <> — sent {timeAgo(j.offerSentAt)}</>
                  )}
                  {j.acceptedAt && (stage === 'offer_accepted' || stage === 'confirmed') && (
                    <> — accepted {timeAgo(j.acceptedAt)}</>
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
    </div>
  );
}

function timeAgo(date: Date | string): string {
  const d = new Date(date);
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
