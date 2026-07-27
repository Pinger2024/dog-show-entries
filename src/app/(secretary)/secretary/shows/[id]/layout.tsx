'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft,
  Ban,
  ClipboardList,
  Clock,
  Database,
  Loader2,
  PoundSterling,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { SECard, Eyebrow } from '@/components/show-experience/kit';
import { SE_H } from '@/components/show-experience/tokens';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { EditShowNameDialog } from './_components/edit-show-name-dialog';
import {
  formatRelativeTime,
  formatCompactRevenue,
  formatWholePounds,
  joinWorkings,
  formatDogsEnteredParts,
  classEntriesLabel,
} from './_lib/show-utils';

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
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showTestDataDialog, setShowTestDataDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);

  if (showLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 pb-16 lg:pb-0">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!show) {
    return (
      <div className="space-y-4 sm:space-y-6 pb-16 lg:pb-0">
        <div className="rounded-xl border bg-card p-6 text-center sm:p-8">
          <div className="text-4xl font-bold text-muted-foreground/30">?</div>
          <h2 className="mt-3 text-lg font-semibold">Show not found</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            We couldn&apos;t load this show. It may have been deleted, or you may
            not have access.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              variant="default"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/secretary">
                <ArrowLeft className="size-4" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const showStatus = statusConfig[show.status] ?? {
    label: show.status,
    variant: 'outline' as const,
  };

  const riskyTransitions: Record<string, string> = {
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
      if (newStatus === 'entries_open') {
        const { fireDogConfetti } = await import('@/lib/confetti');
        fireDogConfetti();
      }
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
    <div className="space-y-4 sm:space-y-6 pb-16 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link href="/secretary/shows">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <h1 className={cn(SE_H, 'truncate text-lg tracking-tight sm:text-2xl')}>
              {show.name}
            </h1>
            <EditShowNameDialog showId={show.id} currentName={show.name} />
            {/* Status — the badge is now a clickable dropdown so the
                secretary can jump between draft / entries open / closed /
                cancelled etc. without waiting for the auto-transition.
                Amanda 2026-05-22 reported the free-form switcher had gone
                missing; restored. */}
            <Select value={show.status} onValueChange={handleStatusChange}>
              <SelectTrigger
                aria-label="Change show status"
                className="h-auto shrink-0 gap-1 border-none bg-transparent p-0 shadow-none focus:ring-0 focus:ring-offset-0"
              >
                <Badge variant={showStatus.variant} className="shrink-0 cursor-pointer hover:opacity-80">
                  {showStatus.label}
                </Badge>
              </SelectTrigger>
              <SelectContent align="end">
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
          <p className="mt-1 text-sm text-muted-foreground">
            {show.organisation?.name}
            {show.venue && ` — ${show.venue.name}`}
          </p>
        </div>
        {/* Cancel show — only when show is still active (not already cancelled/completed) */}
        {show.status !== 'cancelled' && show.status !== 'completed' && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={() => setShowCancelDialog(true)}
          >
            <Ban className="size-3.5" />
            Cancel Show
          </Button>
        )}
      </div>

      {/* Cancel show confirmation */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this show?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to cancel <span className="font-semibold text-foreground">{show.name}</span>.
              This will mark the show as cancelled. Exhibitors will no longer be able to view or manage their entries.
              This action should only be used if the show is genuinely being cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Show Active</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => applyStatusChange('cancelled')}
            >
              Yes, Cancel Show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-se-honey-line bg-se-honey-soft p-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-se-honey-deep shrink-0" />
              <span className="text-xs font-medium text-se-honey-deep">Admin Tools</span>
            </div>
            {(populateMutation.isPending || clearMutation.isPending) ? (
              <div className="flex items-center gap-2 sm:ml-auto">
                <Loader2 className="size-4 animate-spin text-se-honey-deep" />
                <span className="text-xs text-se-honey-deep">
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
                  <p className="text-sm font-medium text-se-honey-deep">
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
      {entryStats && entryStats.dogsEntered > 0 && (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <SECard className="p-3.5">
            <div className="flex items-center gap-1.5 text-se-ink3">
              <ClipboardList className="size-3.5" />
              <Eyebrow>Entries</Eyebrow>
            </div>
            {/* Headline = "dogs entered" — the same canonical number the
                entries list, banner, and Financial page all show now (was
                "confirmed", which silently dropped orderless NFC / manually
                added dogs and read lower than the entries list — Amanda's
                74/75/78 report). The lines beneath show its workings. */}
            <p className={cn(SE_H, 'mt-1.5 text-[22px] leading-none tabular-nums text-se-ink')}>{entryStats.dogsEntered}</p>
            <p className="mt-1 text-[11px] text-se-ink3">
              {formatDogsEnteredParts({
                paid: entryStats.confirmed,
                notForCompetition: entryStats.notForCompetitionEntries,
                otherOrderless: entryStats.otherOrderlessEntries,
              })}
            </p>
            {/* The judges'-book count. Mandy 2026-07-27: this card read 93
                while the Class Breakdown read 109 and neither said which unit
                it meant — a dog in two classes is one dog, two class entries. */}
            {classEntriesLabel(entryStats.dogsEntered, entryStats.classEntries) && (
              <p className="mt-1 text-[11px] text-se-ink3">
                {classEntriesLabel(entryStats.dogsEntered, entryStats.classEntries)}
              </p>
            )}
            {entryStats.pending > 0 && (
              <p className="mt-1 text-[11px] text-se-honey-deep">{entryStats.pending} awaiting payment</p>
            )}
            {entryStats.withdrawn > 0 && (
              <p className="mt-1 text-[11px] text-se-ink3">{entryStats.withdrawn} withdrawn — fee kept</p>
            )}
          </SECard>
          <SECard className="p-3.5">
            <div className="flex items-center gap-1.5 text-se-ink3">
              <PoundSterling className="size-3.5" />
              <Eyebrow>Revenue</Eyebrow>
            </div>
            <p className={cn(SE_H, 'mt-1.5 text-[22px] leading-none tabular-nums text-se-fresh-deep')}>
              {formatCompactRevenue(entryStats.totalRevenue)}
            </p>
            {(() => {
              const revenueWorkings = joinWorkings([
                entryStats.paidThroughRemiFeesPence > 0 ? `${formatWholePounds(entryStats.paidThroughRemiFeesPence)} fees` : null,
                entryStats.withdrawnKeptPence > 0 ? `${formatWholePounds(entryStats.withdrawnKeptPence)} kept` : null,
                entryStats.sundriesPence > 0 ? `${formatWholePounds(entryStats.sundriesPence)} sundries` : null,
              ]);
              return revenueWorkings ? (
                <p className="mt-1 truncate text-[11px] text-se-ink3">{revenueWorkings}</p>
              ) : null;
            })()}
            <p className="mt-1 text-[11px] text-se-ink3">{entryStats.paidOrders} paid orders</p>
          </SECard>
          <SECard className="p-3.5">
            <div className="flex items-center gap-1.5 text-se-ink3">
              <Users className="size-3.5" />
              <Eyebrow>Exhibitors</Eyebrow>
            </div>
            <p className={cn(SE_H, 'mt-1.5 text-[22px] leading-none tabular-nums text-se-ink')}>{entryStats.uniqueExhibitors}</p>
            <p className="mt-1 text-[11px] text-se-ink3">unique</p>
          </SECard>
          <SECard className="p-3.5">
            <div className="flex items-center gap-1.5 text-se-ink3">
              <Clock className="size-3.5" />
              <Eyebrow>Latest</Eyebrow>
            </div>
            <p className={cn(SE_H, 'mt-1.5 truncate text-[22px] leading-none text-se-ink')}>
              {entryStats.lastEntryAt ? formatRelativeTime(new Date(entryStats.lastEntryAt)) : '—'}
            </p>
            <p className="mt-1 text-[11px] text-se-ink3">most recent</p>
          </SECard>
        </div>
      )}

      {/* Section navigation + content */}
      <div className="lg:flex lg:gap-6">
        <ShowSectionNav showId={show.id} isWusv={show.showRuleset === 'wusv'} />
        <div className="min-w-0 flex-1">
          <ShowIdProvider showId={show.id}>{children}</ShowIdProvider>
        </div>
      </div>
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
