'use client';

import { CheckCircle2, Clock, Loader2, Mail, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ActionPanelProps } from '../checklist-action-registry';

export function ResultsApprovalAction({ showId }: ActionPanelProps) {
  const { data, isLoading } =
    trpc.secretary.getResultsPublicationStatus.useQuery({ showId });
  const utils = trpc.useUtils();

  const resendApproval = trpc.secretary.resendJudgeApprovalRequest.useMutation({
    onSuccess: () => {
      utils.secretary.getResultsPublicationStatus.invalidate({ showId });
      toast.success('Approval request sent');
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading approval status...
      </div>
    );
  }

  if (!data) return null;

  const { judges, approvals } = data;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Stewards submit results for approval from their show page. You can resend requests here as a fallback.
      </p>

      {/* Summary bar */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="size-3 text-green-500" />
          {approvals.approved} approved
        </Badge>
        <Badge variant="secondary" className="gap-1">
          <Clock className="size-3 text-amber-500" />
          {approvals.pending} pending
        </Badge>
        {approvals.declined > 0 && (
          <Badge variant="secondary" className="gap-1">
            <XCircle className="size-3 text-red-500" />
            {approvals.declined} queried
          </Badge>
        )}
        {approvals.notSent > 0 && (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            {approvals.notSent} not sent
          </Badge>
        )}
      </div>

      {/* Judge list */}
      <div className="space-y-2">
        {judges.map((judge) => (
          <div
            key={judge.judgeId}
            className="flex flex-col gap-1.5 rounded-lg border p-2.5 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{judge.judgeName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {judge.breeds.length > 0 ? judge.breeds.join(', ') : 'All breeds'}
              </p>
              {judge.note && (
                <p className="mt-1 text-xs text-amber-700 italic">
                  "{judge.note}"
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {judge.status === 'approved' ? (
                <Badge className="bg-green-100 text-green-800 text-xs gap-1">
                  <CheckCircle2 className="size-3" />
                  Approved
                </Badge>
              ) : judge.status === 'pending' ? (
                <Badge className="bg-amber-100 text-amber-800 text-xs gap-1">
                  <Clock className="size-3" />
                  Awaiting
                </Badge>
              ) : judge.status === 'declined' ? (
                <Badge className="bg-red-100 text-red-800 text-xs gap-1">
                  <XCircle className="size-3" />
                  Query
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Not sent
                </Badge>
              )}
              {!judge.contactEmail ? (
                <span className="text-xs text-red-500">No email</span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[2.75rem] text-xs"
                  disabled={resendApproval.isPending}
                  onClick={() =>
                    resendApproval.mutate({ showId, judgeId: judge.judgeId })
                  }
                >
                  <Send className="mr-1 size-3" />
                  {judge.status ? 'Resend' : 'Send'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
