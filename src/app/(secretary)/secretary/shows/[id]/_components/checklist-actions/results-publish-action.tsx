'use client';

import { useState } from 'react';
import { CheckCircle2, Globe, Loader2, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { ActionPanelProps } from '../checklist-action-registry';

export function ResultsPublishAction({ showId }: ActionPanelProps) {
  const [sendNotifications, setSendNotifications] = useState(true);

  const { data, isLoading } =
    trpc.secretary.getResultsPublicationStatus.useQuery({ showId });
  const utils = trpc.useUtils();

  const publishMutation = trpc.secretary.publishResults.useMutation({
    onSuccess: () => {
      utils.secretary.getResultsPublicationStatus.invalidate({ showId });
      toast.success('Results published successfully');
    },
    onError: (err) => toast.error(err.message),
  });

  const unpublishMutation = trpc.secretary.unpublishResults.useMutation({
    onSuccess: () => {
      utils.secretary.getResultsPublicationStatus.invalidate({ showId });
      toast.success('Results unpublished — stewards can now edit');
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

  if (!data) return null;

  const { published, publishedAt, approvals, showStatus } = data;
  const canPublish = ['in_progress', 'completed'].includes(showStatus);

  return (
    <div className="space-y-3">
      {/* Status */}
      {published ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <Globe className="size-4 shrink-0" />
          <div>
            <p className="font-medium">Results are published</p>
            {publishedAt && (
              <p className="text-xs text-green-600">
                Published {new Date(publishedAt).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
          <Lock className="ml-auto size-4 text-green-600" />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <Unlock className="size-4 shrink-0" />
          <p className="font-medium">Results not yet published</p>
        </div>
      )}

      {/* Judge approval progress */}
      {approvals.total > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-green-500" />
          {approvals.approved} of {approvals.total} judges approved
          {approvals.pending > 0 && <span className="text-amber-600">({approvals.pending} pending)</span>}
        </div>
      )}

      {/* Publish / Unpublish buttons */}
      {published ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full border-red-200 text-red-700 hover:bg-red-50"
              disabled={unpublishMutation.isPending}
            >
              {unpublishMutation.isPending ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <Unlock className="mr-1 size-3" />
              )}
              Unpublish Results
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unpublish Results?</AlertDialogTitle>
              <AlertDialogDescription>
                Results will be hidden from the public and stewards will be able to edit again. You can republish at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => unpublishMutation.mutate({ showId })}
                className="bg-red-600 hover:bg-red-700"
              >
                Unpublish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              className="w-full bg-green-700 hover:bg-green-800"
              disabled={!canPublish || publishMutation.isPending}
            >
              {publishMutation.isPending ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <Globe className="mr-1 size-3" />
              )}
              Publish Results
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish Results?</AlertDialogTitle>
              <AlertDialogDescription>
                This will make results visible to the public, lock editing for stewards, and send notification emails to all exhibitors and followers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex items-center gap-2 px-1 py-2">
              <input
                type="checkbox"
                id="send-notifications"
                checked={sendNotifications}
                onChange={(e) => setSendNotifications(e.target.checked)}
                className="size-4 rounded border-gray-300"
              />
              <label htmlFor="send-notifications" className="text-sm">
                Send notification emails to exhibitors and followers
              </label>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  publishMutation.mutate({ showId, sendNotifications })
                }
                className="bg-green-700 hover:bg-green-800"
              >
                Publish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {!canPublish && !published && (
        <p className="text-xs text-muted-foreground">
          The show must be in progress or completed before results can be published.
        </p>
      )}
    </div>
  );
}
