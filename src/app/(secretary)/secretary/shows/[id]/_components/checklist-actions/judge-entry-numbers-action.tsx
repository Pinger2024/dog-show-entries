'use client';

import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import type { ActionPanelProps } from '../checklist-action-registry';

export function JudgeEntryNumbersAction({ showId, entityId, entityName }: ActionPanelProps) {
  const utils = trpc.useUtils();

  const sendMutation = trpc.secretary.sendJudgeEntryNumbers.useMutation({
    onSuccess: (result) => {
      toast.success(`Entry numbers sent (${result.totalEntries} total entries)`);
      utils.secretary.getChecklist.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Email {entityName ?? 'this judge'} the number of entries in each class they are judging.
      </p>
      <Button
        size="sm"
        onClick={() => {
          if (!entityId) return;
          sendMutation.mutate({ showId, judgeId: entityId });
        }}
        disabled={sendMutation.isPending || !entityId}
      >
        {sendMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        Send Entry Numbers
      </Button>
    </div>
  );
}
