'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Download,
  FileText,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ActionPanelProps } from '../checklist-action-registry';

export function RkcSubmissionAction({ showId, onComplete }: ActionPanelProps) {
  const { data: show, isLoading } = trpc.shows.getById.useQuery({ id: showId });
  const utils = trpc.useUtils();

  const markSubmitted = trpc.secretary.markRkcSubmitted.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      onComplete?.();
      toast.success('Marked as submitted to RKC');
    },
    onError: (err) => toast.error(err.message),
  });

  const unmarkSubmitted = trpc.secretary.unmarkRkcSubmitted.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success('RKC submission status cleared');
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading...
      </div>
    );
  }

  if (!show) return null;

  const scheduleData = show.scheduleData as { rkcSubmittedAt?: string } | null;
  const rkcSubmittedAt = scheduleData?.rkcSubmittedAt;
  const rkcSubmitted = !!rkcSubmittedAt;
  const isCompleted = show.status === 'completed';

  return (
    <div className="space-y-3">
      {/* Status */}
      {rkcSubmitted ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle className="size-4 shrink-0" />
          <div>
            <p className="font-medium">Submitted to RKC</p>
            <p className="text-xs text-green-600">
              Marked as submitted on{' '}
              {new Date(rkcSubmittedAt!).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <Send className="size-4 shrink-0" />
          <p className="font-medium">Not yet submitted</p>
        </div>
      )}

      {/* Download marked catalogue */}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        asChild
      >
        <a href={`/api/catalogue/${showId}/marked`} target="_blank" rel="noopener noreferrer">
          <Download className="size-3" />
          Open Marked Catalogue
        </a>
      </Button>

      {/* Download absentee report */}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        asChild
      >
        <a href={`/api/absentee-report/${showId}`} download>
          <FileText className="size-3" />
          Download Absentee Report (CSV)
        </a>
      </Button>

      {/* Submit / Clear actions */}
      {rkcSubmitted ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          disabled={unmarkSubmitted.isPending}
          onClick={() => unmarkSubmitted.mutate({ showId })}
        >
          {unmarkSubmitted.isPending ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <X className="mr-1 size-3" />
          )}
          Clear submission status
        </Button>
      ) : (
        <Button
          size="sm"
          className="w-full bg-green-700 hover:bg-green-800 gap-1.5"
          disabled={!isCompleted || markSubmitted.isPending}
          onClick={() => markSubmitted.mutate({ showId })}
        >
          {markSubmitted.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Send className="size-3" />
          )}
          Mark as submitted to RKC
        </Button>
      )}

      {!isCompleted && !rkcSubmitted && (
        <p className="text-xs text-muted-foreground">
          The show must be completed before marking RKC submission.
        </p>
      )}
    </div>
  );
}
