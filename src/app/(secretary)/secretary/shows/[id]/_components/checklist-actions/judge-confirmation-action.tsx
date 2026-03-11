'use client';

import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { penceToPoundsString } from '@/lib/date-utils';
import type { ActionPanelProps } from '../checklist-action-registry';

export function JudgeConfirmationAction({ showId, entityId, entityName }: ActionPanelProps) {
  const { data: contracts } = trpc.secretary.getJudgeContracts.useQuery({ showId });
  const utils = trpc.useUtils();

  const confirmMutation = trpc.secretary.sendJudgeConfirmation.useMutation({
    onSuccess: () => {
      toast.success('Confirmation letter sent');
      utils.secretary.getJudgeContracts.invalidate({ showId });
      utils.secretary.getChecklist.invalidate({ showId });
      utils.secretary.getChecklistJudgeSummary.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  const contract = contracts
    ?.filter((c) => c.judgeId === entityId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (!contract) {
    return (
      <div className="py-2 text-sm text-muted-foreground">
        No contract found for {entityName ?? 'this judge'}.
      </div>
    );
  }

  const totalExpenses = (contract.hotelCost ?? 0) + (contract.travelCost ?? 0) + (contract.otherExpenses ?? 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant={contract.stage === 'confirmed' ? 'default' : contract.stage === 'offer_accepted' ? 'secondary' : 'outline'}
        >
          {contract.stage === 'confirmed' ? 'Confirmed' : contract.stage === 'offer_accepted' ? 'Accepted — Ready to Confirm' : contract.stage}
        </Badge>
        {contract.acceptedAt && (
          <span className="text-xs text-muted-foreground">
            Accepted {new Date(contract.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      {totalExpenses > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
          Expenses: {contract.hotelCost ? `Hotel £${penceToPoundsString(contract.hotelCost)}` : ''}
          {contract.travelCost ? `${contract.hotelCost ? ', ' : ''}Travel £${penceToPoundsString(contract.travelCost)}` : ''}
          {contract.otherExpenses ? `${contract.hotelCost || contract.travelCost ? ', ' : ''}Other £${penceToPoundsString(contract.otherExpenses)}` : ''}
          {' — '}Total £{penceToPoundsString(totalExpenses)}
        </div>
      )}

      {contract.stage === 'offer_accepted' && (
        <Button
          size="sm"
          onClick={() => confirmMutation.mutate({ contractId: contract.id })}
          disabled={confirmMutation.isPending}
        >
          {confirmMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Send Confirmation Letter
        </Button>
      )}

      {contract.stage === 'confirmed' && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <Check className="size-3" />
          Confirmation sent {contract.confirmedAt ? new Date(contract.confirmedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
        </p>
      )}
    </div>
  );
}
