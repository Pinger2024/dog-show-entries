'use client';

import { Copy, Loader2, Mail, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ActionPanelProps } from '../checklist-action-registry';

export function JudgeAcceptanceAction({ showId, entityId, entityName }: ActionPanelProps) {
  const { data: contracts } = trpc.secretary.getJudgeContracts.useQuery({ showId });
  const utils = trpc.useUtils();

  const resendMutation = trpc.secretary.resendJudgeOffer.useMutation({
    onSuccess: () => {
      toast.success('Offer resent');
      utils.secretary.getJudgeContracts.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  // Find the latest contract for this judge
  const contract = contracts
    ?.filter((c) => c.judgeId === entityId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (!contract) {
    return (
      <div className="py-2 text-sm text-muted-foreground">
        No offer has been sent to {entityName ?? 'this judge'} yet. Send an offer from the &ldquo;Send judge offer letters&rdquo; item above.
      </div>
    );
  }

  const stage = contract.stage;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const offerLink = `${baseUrl}/api/judge-contract/${contract.offerToken}`;

  return (
    <div className="space-y-3">
      {/* Status line */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant={stage === 'offer_accepted' || stage === 'confirmed' ? 'default' : stage === 'declined' ? 'destructive' : 'secondary'}
        >
          {stage === 'offer_sent' && 'Offer Sent'}
          {stage === 'offer_accepted' && 'Accepted'}
          {stage === 'confirmed' && 'Confirmed'}
          {stage === 'declined' && 'Declined'}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {stage === 'offer_sent' && contract.offerSentAt && (
            <>Sent {new Date(contract.offerSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} — awaiting response</>
          )}
          {stage === 'offer_accepted' && contract.acceptedAt && (
            <>Accepted {new Date(contract.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</>
          )}
          {stage === 'confirmed' && contract.confirmedAt && (
            <>Confirmed {new Date(contract.confirmedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</>
          )}
          {stage === 'declined' && contract.declinedAt && (
            <>Declined {new Date(contract.declinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</>
          )}
        </span>
      </div>

      {/* Actions */}
      {stage === 'offer_sent' && (
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => resendMutation.mutate({ contractId: contract.id })}
            disabled={resendMutation.isPending}
          >
            {resendMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            Resend Offer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(offerLink);
              toast.success('Offer link copied to clipboard');
            }}
          >
            <Copy className="size-3" />
            Copy Link
          </Button>
        </div>
      )}

      {stage === 'declined' && contract.expenseNotes && (
        <p className="text-xs text-muted-foreground bg-red-50 p-2 rounded-md border border-red-100">
          {contract.expenseNotes}
        </p>
      )}
    </div>
  );
}
