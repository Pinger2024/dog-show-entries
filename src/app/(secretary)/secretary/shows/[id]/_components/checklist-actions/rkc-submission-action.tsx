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
      toast.success('Recorded as sent to the RKC');
    },
    onError: (err) => toast.error(err.message),
  });

  const unmarkSubmitted = trpc.secretary.unmarkRkcSubmitted.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success('Undone — recorded as not sent');
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
      {/* Remi never transmits anything to the RKC — this whole panel is a
          record that the SECRETARY sent it. A secretary clicked the button
          believing it filed her return and was badly frightened (via Mandy,
          2026-08-20), so every label here now says "marked" rather than
          "submitted", and the note below states it outright. */}
      <p className="rounded-lg bg-se-paper2 p-3 text-xs text-se-ink2">
        Remi doesn&apos;t send anything to the RKC. You send your return to them
        yourself, then tick it here so Remi can keep track of the 14-day deadline.
      </p>

      {rkcSubmitted ? (
        <div className="flex items-center gap-2 rounded-lg bg-se-fresh-soft p-3 text-sm text-se-fresh-deep">
          <CheckCircle className="size-4 shrink-0" />
          <div>
            <p className="font-medium">Marked as sent</p>
            <p className="text-xs text-se-fresh-deep">
              You recorded this as sent on{' '}
              {new Date(rkcSubmittedAt!).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-se-honey-soft p-3 text-sm text-se-honey-deep">
          <Send className="size-4 shrink-0" />
          <p className="font-medium">Not yet marked as sent</p>
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
          Undo — I haven&apos;t sent it
        </Button>
      ) : (
        <Button
          size="sm"
          className="w-full bg-se-fresh hover:bg-se-fresh/90 gap-1.5"
          disabled={!isCompleted || markSubmitted.isPending}
          onClick={() => markSubmitted.mutate({ showId })}
        >
          {markSubmitted.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Send className="size-3" />
          )}
          I&apos;ve sent this to the RKC
        </Button>
      )}

      {!isCompleted && !rkcSubmitted && (
        <p className="text-xs text-muted-foreground">
          The show must be completed before you can record this.
        </p>
      )}
    </div>
  );
}
