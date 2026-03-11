'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { penceToPoundsString } from '@/lib/date-utils';
import type { ActionPanelProps } from '../checklist-action-registry';

export function JudgeThankYouAction({ showId, entityId, entityName }: ActionPanelProps) {
  const { data: contracts } = trpc.secretary.getJudgeContracts.useQuery({ showId });
  const utils = trpc.useUtils();

  const contract = contracts
    ?.filter((c) => c.judgeId === entityId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const [message, setMessage] = useState('');

  const sendMutation = trpc.secretary.sendJudgeThankYou.useMutation({
    onSuccess: () => {
      toast.success('Thank-you letter sent');
      utils.secretary.getChecklist.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  const totalExpenses = (contract?.hotelCost ?? 0) + (contract?.travelCost ?? 0) + (contract?.otherExpenses ?? 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Send a thank-you letter to {entityName ?? 'this judge'} with an optional personal message.
      </p>

      {totalExpenses > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
          Expenses to settle: £{penceToPoundsString(totalExpenses)}
          {contract?.hotelCost ? ` (Hotel £${penceToPoundsString(contract.hotelCost)})` : ''}
          {contract?.travelCost ? ` (Travel £${penceToPoundsString(contract.travelCost)})` : ''}
          {contract?.otherExpenses ? ` (Other £${penceToPoundsString(contract.otherExpenses)})` : ''}
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Personal message (optional)</Label>
        <Textarea
          className="min-h-[60px] text-xs"
          placeholder="Thank you for your time and expertise..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <Button
        size="sm"
        onClick={() => {
          if (!entityId) return;
          sendMutation.mutate({
            showId,
            judgeId: entityId,
            message: message || undefined,
          });
        }}
        disabled={sendMutation.isPending || !entityId}
      >
        {sendMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        Send Thank You
      </Button>
    </div>
  );
}
