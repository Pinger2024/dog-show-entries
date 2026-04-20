'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { statusConfig } from '../../_lib/show-utils';
import { useShowId } from '../../_lib/show-context';
import type { ActionPanelProps } from '../checklist-action-registry';

/** Action keys that map to show status transitions */
const STATUS_ACTIONS: Record<string, {
  targetStatus: string;
  buttonLabel: string;
  prerequisites?: string[];
}> = {
  show_publish: {
    targetStatus: 'published',
    buttonLabel: 'Publish Show',
    prerequisites: ['Classes created', 'Venue confirmed'],
  },
  entries_open: {
    targetStatus: 'entries_open',
    buttonLabel: 'Open Entries',
    prerequisites: ['Show published', 'Classes created', 'Stripe connected'],
  },
  entries_close: {
    targetStatus: 'entries_closed',
    buttonLabel: 'Close Entries',
  },
};

export function ShowStatusAction({ showId }: ActionPanelProps & { actionKey?: string }) {
  const realShowId = useShowId();
  const utils = trpc.useUtils();
  const { data: show } = trpc.shows.getById.useQuery({ id: realShowId });
  const { data: autoDetect } = trpc.secretary.getChecklistAutoDetect.useQuery({ showId });

  const updateMutation = trpc.shows.update.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: realShowId });
      utils.secretary.getChecklist.invalidate({ showId });
      utils.secretary.getChecklistAutoDetect.invalidate({ showId });
      toast.success('Show status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  if (!show) return null;

  const currentStatus = show.status;
  const currentConf = statusConfig[currentStatus];

  // Determine which actions are relevant based on current status
  const availableActions = Object.entries(STATUS_ACTIONS).filter(([, action]) => {
    if (action.targetStatus === 'published') return currentStatus === 'draft';
    if (action.targetStatus === 'entries_open') return currentStatus === 'published';
    if (action.targetStatus === 'entries_closed') return currentStatus === 'entries_open';
    return false;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Current status:</span>
        <Badge variant={currentConf?.variant ?? 'outline'}>
          {currentConf?.label ?? currentStatus}
        </Badge>
      </div>

      {availableActions.map(([key, action]) => {
        // Check prerequisites
        const prereqChecks = action.prerequisites?.map((prereq) => {
          let met = false;
          if (prereq === 'Classes created') met = autoDetect?.classes_created ?? false;
          if (prereq === 'Venue confirmed') met = autoDetect?.venue_set ?? false;
          if (prereq === 'Show published') met = autoDetect?.show_published ?? false;
          if (prereq === 'Stripe connected') met = autoDetect?.stripe_connected ?? false;
          return { label: prereq, met };
        });

        const allMet = !prereqChecks || prereqChecks.every((p) => p.met);

        return (
          <div key={key} className="space-y-2">
            {prereqChecks && prereqChecks.length > 0 && (
              <div className="text-xs space-y-0.5">
                {prereqChecks.map((p) => (
                  <div key={p.label} className="flex items-center gap-1.5">
                    {p.met ? (
                      <Check className="size-3 text-green-500" />
                    ) : (
                      <AlertTriangle className="size-3 text-amber-500" />
                    )}
                    <span className={p.met ? 'text-muted-foreground' : 'text-amber-600'}>
                      {p.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Button
              size="sm"
              onClick={() => updateMutation.mutate({
                id: realShowId,
                status: action.targetStatus as 'published' | 'entries_open' | 'entries_closed',
              })}
              disabled={updateMutation.isPending || !allMet}
            >
              {updateMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {action.buttonLabel}
            </Button>
          </div>
        );
      })}

      {availableActions.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No status actions available in the current state ({currentConf?.label ?? currentStatus}).
        </p>
      )}
    </div>
  );
}
