'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft,
  ClipboardList,
  Clock,
  Database,
  Loader2,
  PoundSterling,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { statusConfig } from './_lib/show-utils';
import { ShowIdProvider } from './_lib/show-context';
import { ShowSectionNav } from './_components/show-section-nav';
import { LifecycleBanner } from './_components/lifecycle-banner';
import { formatRelativeTime, formatCompactRevenue } from './_lib/show-utils';

export default function ShowManagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: show, isLoading: showLoading } = trpc.shows.getById.useQuery({
    id,
  });
  const { data: entryStats } = trpc.secretary.getShowEntryStats.useQuery(
    { showId: show?.id ?? '' },
    { enabled: !!show, staleTime: 60_000 }
  );

  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const updateMutation = trpc.shows.update.useMutation();
  const populateMutation = trpc.dev.populateShowTestData.useMutation();
  const clearMutation = trpc.dev.clearShowTestData.useMutation();
  const utils = trpc.useUtils();

  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [showTestDataDialog, setShowTestDataDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);

  if (showLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 pb-16 md:pb-0">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!show) {
    return (
      <div className="space-y-4 sm:space-y-6 pb-16 md:pb-0">
        <p className="text-muted-foreground">Show not found.</p>
        <Button variant="outline" asChild>
          <Link href="/secretary">
            <ArrowLeft className="size-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  const showStatus = statusConfig[show.status] ?? {
    label: show.status,
    variant: 'outline' as const,
  };

  const riskyTransitions: Record<string, string> = {
    cancelled:
      'This will mark the show as cancelled. Exhibitors will no longer be able to view or manage their entries.',
    entries_open:
      'This will open entries to the public. Make sure all classes and pricing are set up correctly before proceeding.',
    completed:
      'This will mark the show as completed. This should only be done after the event has finished.',
  };

  async function applyStatusChange(newStatus: string) {
    try {
      await updateMutation.mutateAsync({
        id: show!.id,
        status: newStatus as
          | 'draft'
          | 'published'
          | 'entries_open'
          | 'entries_closed'
          | 'in_progress'
          | 'completed'
          | 'cancelled',
      });
      await utils.shows.getById.invalidate({ id });
      toast.success(
        `Show status updated to ${statusConfig[newStatus]?.label ?? newStatus}`
      );
    } catch {
      toast.error('Failed to update show status');
    }
    setPendingStatus(null);
  }

  function handleStatusChange(newStatus: string) {
    if (!show || newStatus === show.status) return;
    if (riskyTransitions[newStatus]) {
      setPendingStatus(newStatus);
    } else {
      applyStatusChange(newStatus);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-2 hidden sm:inline-flex">
              <Link href="/secretary">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-2xl">
              {show.name}
            </h1>
            <Badge variant={showStatus.variant} className="shrink-0 hidden sm:inline-flex">
              {showStatus.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {show.organisation?.name}
            {show.venue && ` — ${show.venue.name}`}
          </p>
        </div>
        <Select onValueChange={handleStatusChange} value={show.status}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Change status" />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-60">
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="entries_open">Entries Open</SelectItem>
            <SelectItem value="entries_closed">Entries Closed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Status change confirmation dialog */}
      <StatusChangeDialog
        pendingStatus={pendingStatus}
        showId={show.id}
        onCancel={() => setPendingStatus(null)}
        onConfirm={(status) => applyStatusChange(status)}
        riskyTransitions={riskyTransitions}
      />

      {/* Lifecycle Banner */}
      <LifecycleBanner
        show={show}
        entryStats={entryStats}
        onOpenEntries={() => handleStatusChange('entries_open')}
      />

      {/* Admin test data tools — only visible to admins */}
      {isAdmin && (
        <>
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-orange-300 bg-orange-50 p-3 dark:border-orange-700 dark:bg-orange-950/30 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-orange-600 dark:text-orange-400 shrink-0" />
              <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Admin Tools</span>
            </div>
            {(populateMutation.isPending || clearMutation.isPending) ? (
              <div className="flex items-center gap-2 sm:ml-auto">
                <Loader2 className="size-4 animate-spin text-orange-600" />
                <span className="text-xs text-orange-700 dark:text-orange-300">
                  {populateMutation.isPending ? 'Generating test data... this takes about a minute' : 'Clearing data...'}
                </span>
              </div>
            ) : (
              <div className="flex gap-2 sm:ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setShowTestDataDialog(true)}
                >
                  <Database className="size-3" />
                  Populate Test Data
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => setShowClearDialog(true)}
                >
                  <Trash2 className="size-3" />
                  Clear Data
                </Button>
              </div>
            )}
          </div>

          <Dialog
            open={showTestDataDialog}
            onOpenChange={(open) => {
              // Prevent closing while populating
              if (!open && populateMutation.isPending) return;
              setShowTestDataDialog(open);
            }}
          >
            <DialogContent onPointerDownOutside={(e) => {
              // Prevent dismissal by clicking outside while populating
              if (populateMutation.isPending) e.preventDefault();
            }}>
              <DialogHeader>
                <DialogTitle>Populate Test Data</DialogTitle>
                <DialogDescription>
                  This will create realistic mock dogs, entries, judges, rings, sponsors, and orders for this show.
                  Adapts to the show type ({show.showType}) and scope ({show.showScope ?? 'general'}).
                </DialogDescription>
              </DialogHeader>
              {populateMutation.isPending ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">Generating test data...</p>
                  <p className="text-xs text-muted-foreground">
                    Creating dogs, entries, judges, rings, sponsors, and orders.
                    This typically takes about a minute. Please don&apos;t close this dialog.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    This will generate approximately 150-200 entries with proper breeds,
                    catalogue numbers, RKC registration numbers, realistic Scottish addresses,
                    sponsors, sundry items, and full show configuration.
                  </p>
                  <p className="text-sm font-medium text-orange-600">
                    Existing entries will be kept. Use &quot;Clear Data&quot; first if you want a fresh start.
                  </p>
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setShowTestDataDialog(false)}
                  disabled={populateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  disabled={populateMutation.isPending}
                  onClick={async () => {
                    try {
                      const result = await populateMutation.mutateAsync({ showId: show.id });
                      await utils.shows.getById.invalidate({ id });
                      await utils.secretary.getShowEntryStats.invalidate({ showId: show.id });
                      setShowTestDataDialog(false);
                      const parts = [
                        `${result.entriesCreated} entries`,
                        `${result.dogsCreated} dogs`,
                        result.judgesCreated > 0 ? `${result.judgesCreated} judges` : null,
                        result.ringsCreated > 0 ? `${result.ringsCreated} rings` : null,
                        result.sponsorsCreated > 0 ? `${result.sponsorsCreated} sponsors` : null,
                      ].filter(Boolean);
                      toast.success(`Created ${parts.join(', ')}`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed to populate test data');
                    }
                  }}
                >
                  <Database className="size-4" />
                  Populate Show
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all test data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete ALL entries, dogs, orders, judges, rings, sponsors, and sundry items from this show. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    try {
                      const result = await clearMutation.mutateAsync({ showId: show!.id });
                      await utils.shows.getById.invalidate({ id });
                      await utils.secretary.getShowStats.invalidate({ showId: show!.id });
                      toast.success(`Cleared ${result.entriesDeleted} entries and ${result.dogsDeleted} dogs`);
                    } catch {
                      toast.error('Failed to clear test data');
                    }
                  }}
                >
                  Clear Data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      {/* Stats */}
      {entryStats && entryStats.totalEntries > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ClipboardList className="size-3.5" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Entries</span>
            </div>
            <p className="mt-1 text-lg font-bold">{entryStats.totalEntries}</p>
            <p className="text-[11px] text-muted-foreground">
              {entryStats.confirmed > 0 && <span className="text-emerald-600">{entryStats.confirmed} confirmed</span>}
              {entryStats.pending > 0 && <span>{entryStats.confirmed > 0 ? ' · ' : ''}<span className="text-amber-600">{entryStats.pending} pending</span></span>}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <PoundSterling className="size-3.5" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Revenue</span>
            </div>
            <p className="mt-1 text-lg font-bold text-emerald-700">
              {formatCompactRevenue(entryStats.totalRevenue)}
            </p>
            <p className="text-[11px] text-muted-foreground">{entryStats.paidOrders} paid</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-3.5" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Exhibitors</span>
            </div>
            <p className="mt-1 text-lg font-bold">{entryStats.uniqueExhibitors}</p>
            <p className="text-[11px] text-muted-foreground">unique</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3.5" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Latest</span>
            </div>
            <p className="mt-1 text-lg font-bold">
              {entryStats.lastEntryAt ? formatRelativeTime(new Date(entryStats.lastEntryAt)) : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground">most recent</p>
          </div>
        </div>
      )}

      {/* Section navigation */}
      <ShowSectionNav showId={show.id} />

      {/* Active section content */}
      <ShowIdProvider showId={show.id}>{children}</ShowIdProvider>
    </div>
  );
}

// ── Enhanced status change dialog with blocker checking ─────

function StatusChangeDialog({
  pendingStatus,
  showId,
  onCancel,
  onConfirm,
  riskyTransitions,
}: {
  pendingStatus: string | null;
  showId: string;
  onCancel: () => void;
  onConfirm: (status: string) => void;
  riskyTransitions: Record<string, string>;
}) {
  const isEntriesOpen = pendingStatus === 'entries_open';

  const { data: blockers, isLoading: blockersLoading } =
    trpc.secretary.getPhaseBlockers.useQuery(
      { showId },
      { enabled: isEntriesOpen, staleTime: 30_000 },
    );

  const canOpen = blockers?.canOpenEntries ?? false;
  const openBlockers = blockers?.openEntriesBlockers.filter(
    (b) => b.severity === 'required',
  ) ?? [];

  return (
    <Dialog
      open={!!pendingStatus}
      onOpenChange={(open) => !open && onCancel()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Change status to{' '}
            {statusConfig[pendingStatus ?? '']?.label ?? pendingStatus}?
          </DialogTitle>
          <DialogDescription>
            {isEntriesOpen && !canOpen && !blockersLoading
              ? 'Some items need to be completed before you can open entries.'
              : riskyTransitions[pendingStatus ?? '']}
          </DialogDescription>
        </DialogHeader>

        {/* Loading state for entries_open blocker check */}
        {isEntriesOpen && blockersLoading && (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking prerequisites...</span>
          </div>
        )}

        {/* Show blocker list for entries_open when there are blockers */}
        {isEntriesOpen && !canOpen && !blockersLoading && openBlockers.length > 0 && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            {openBlockers.map((blocker) => (
              <div
                key={blocker.key}
                className="flex items-start gap-2 text-sm"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{blocker.label}</span>
                  <p className="text-xs text-muted-foreground">{blocker.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={
              pendingStatus === 'cancelled' ? 'destructive' : 'default'
            }
            disabled={isEntriesOpen && (blockersLoading || !canOpen)}
            onClick={() => pendingStatus && onConfirm(pendingStatus)}
          >
            {isEntriesOpen && blockersLoading
              ? 'Checking...'
              : isEntriesOpen && !canOpen
                ? `${openBlockers.length} item${openBlockers.length !== 1 ? 's' : ''} remaining`
                : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
