'use client';

import Link from 'next/link';
import {
  Check,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Gavel,
  Loader2,
  Trophy,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { RouterOutputs } from '@/server/trpc/router';
import {
  derivePhase,
  formatDaysUntil,
  formatDeadline,
  PHASE_CONFIG,
  type ShowPhase,
} from '../_lib/phase-utils';
import { formatCompactRevenue } from '../_lib/show-utils';
import { useShowId } from '../_lib/show-context';

type Show = NonNullable<RouterOutputs['shows']['getById']>;

export function PhaseActionPanel() {
  const showId = useShowId();

  const { data: show } = trpc.shows.getById.useQuery({ id: showId });

  if (!show) return null;

  const phase = derivePhase(show.status);

  return (
    <>
      {phase === 'setup' && <SetupPanel show={show} showId={showId} />}
      {phase === 'entries_open' && <EntriesOpenPanel show={show} showId={showId} />}
      {phase === 'pre_show' && <PreShowPanel show={show} showId={showId} />}
      {phase === 'show_day' && <ShowDayPanel show={show} showId={showId} />}
      {phase === 'post_show' && <PostShowPanel show={show} showId={showId} />}
      {phase === 'cancelled' && <CancelledPanel />}
    </>
  );
}

// ── Phase 1: Setup ──────────────────────────────────────────

function SetupPanel({ show, showId }: { show: Show; showId: string }) {
  const { data: blockers, isLoading } = trpc.secretary.getPhaseBlockers.useQuery(
    { showId },
    { staleTime: 30_000 },
  );
  const { data: autoDetect } = trpc.secretary.getChecklistAutoDetect.useQuery(
    { showId },
    { staleTime: 30_000 },
  );

  const utils = trpc.useUtils();
  const updateMutation = trpc.shows.update.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      utils.secretary.getPhaseBlockers.invalidate({ showId });
    },
  });

  const allBlockers = blockers?.openEntriesBlockers ?? [];
  const canOpen = blockers?.canOpenEntries ?? false;

  // Build the full checklist with both complete (auto-detected) and incomplete items
  type ChecklistItem = {
    key: string;
    label: string;
    done: boolean;
    auto: boolean;
    actionPath?: string;
    severity: 'required' | 'recommended';
  };

  const checklist: ChecklistItem[] = [];

  // Auto-detected complete items
  const autoKeys: { key: string; label: string; count?: string }[] = [
    { key: 'classes_created', label: 'Classes created' },
    { key: 'judges_assigned', label: 'Judge assigned' },
    { key: 'entry_fees_set', label: 'Entry fees set' },
    { key: 'entry_close_date_set', label: 'Entry close date set' },
    { key: 'secretary_details_set', label: 'Secretary details added' },
    { key: 'guarantors_added', label: 'Guarantors added' },
    { key: 'venue_set', label: 'Venue confirmed' },
    { key: 'kc_licence_recorded', label: 'RKC licence recorded' },
  ];

  if (autoDetect) {
    for (const ak of autoKeys) {
      const isDone = autoDetect[ak.key] === true;
      // Find matching blocker for incomplete items
      const matchingBlocker = allBlockers.find((b) => {
        if (ak.key === 'classes_created' && b.key === 'no_classes') return true;
        if (ak.key === 'judges_assigned' && b.key === 'no_judge') return true;
        if (ak.key === 'entry_fees_set' && b.key === 'no_entry_fees') return true;
        if (ak.key === 'entry_close_date_set' && b.key === 'no_close_date') return true;
        if (ak.key === 'secretary_details_set' && b.key === 'no_secretary_details') return true;
        if (ak.key === 'guarantors_added' && b.key === 'insufficient_guarantors') return true;
        if (ak.key === 'venue_set' && b.key === 'no_venue') return true;
        if (ak.key === 'kc_licence_recorded' && b.key === 'no_rkc_licence') return true;
        return false;
      });

      checklist.push({
        key: ak.key,
        label: isDone ? ak.label : (matchingBlocker?.label ?? ak.label),
        done: isDone,
        auto: isDone,
        actionPath: matchingBlocker?.actionPath || undefined,
        severity: matchingBlocker?.severity ?? 'recommended',
      });
    }
  }

  // Sort: incomplete required first, then incomplete recommended, then complete
  checklist.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.done && !b.done) {
      if (a.severity !== b.severity) return a.severity === 'required' ? -1 : 1;
    }
    return 0;
  });

  const handleOpenEntries = () => {
    updateMutation.mutate({
      id: showId,
      status: 'entries_open',
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="size-4 text-amber-600" />
          What you need before opening entries
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking requirements...</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {checklist.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-2.5 min-h-[2.75rem] rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
              >
                {/* Status icon */}
                {item.done ? (
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <Check className="size-3 text-emerald-600" />
                  </div>
                ) : (
                  <div className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full',
                    item.severity === 'required'
                      ? 'bg-destructive/10'
                      : 'bg-muted',
                  )}>
                    <X className={cn(
                      'size-3',
                      item.severity === 'required'
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )} />
                  </div>
                )}

                {/* Label */}
                <span className={cn(
                  'flex-1 text-sm',
                  item.done
                    ? 'text-muted-foreground line-through'
                    : item.severity === 'required'
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground',
                )}>
                  {item.label}
                </span>

                {/* Auto badge */}
                {item.auto && item.done && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                    Auto
                  </Badge>
                )}

                {/* Fix link for incomplete items */}
                {!item.done && item.actionPath && (
                  <Link
                    href={`/secretary/shows/${showId}${item.actionPath}`}
                    className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline shrink-0 min-h-[2.75rem] sm:min-h-0 px-1"
                  >
                    Fix
                    <ChevronRight className="size-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action area */}
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            size="default"
            className="w-full sm:w-auto min-h-[2.75rem]"
            disabled={!canOpen || isLoading || updateMutation.isPending}
            onClick={handleOpenEntries}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Opening...
              </>
            ) : canOpen ? (
              'Open Entries'
            ) : (
              `Complete ${allBlockers.filter(b => b.severity === 'required').length} required item${allBlockers.filter(b => b.severity === 'required').length !== 1 ? 's' : ''} to open`
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            asChild
          >
            <Link href={`/secretary/shows/${showId}/checklist`}>
              View full checklist
              <ChevronRight className="size-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Phase 2: Entries Open ───────────────────────────────────

function EntriesOpenPanel({ show, showId }: { show: Show; showId: string }) {
  const { data: entryStats } = trpc.secretary.getShowEntryStats.useQuery(
    { showId },
    { staleTime: 30_000 },
  );

  const totalEntries = entryStats?.totalEntries ?? 0;
  const uniqueExhibitors = entryStats?.uniqueExhibitors ?? 0;
  const totalRevenue = entryStats?.totalRevenue ?? 0;

  const closeInfo = show.entryCloseDate
    ? formatDeadline(show.entryCloseDate, 'Entries close')
    : null;

  return (
    <Card className="border-emerald-200 dark:border-emerald-800">
      <CardContent className="pt-6 space-y-4">
        {/* Header with pulsing green dot */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
          </span>
          <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Entries are open
          </h3>
        </div>

        {/* Large stats */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl font-bold tracking-tight">
            {totalEntries}
          </span>
          <span className="text-sm text-muted-foreground">
            {totalEntries === 1 ? 'entry' : 'entries'}
          </span>
          <span className="text-muted-foreground">&middot;</span>
          <span className="text-2xl font-bold tracking-tight">
            {uniqueExhibitors}
          </span>
          <span className="text-sm text-muted-foreground">
            {uniqueExhibitors === 1 ? 'exhibitor' : 'exhibitors'}
          </span>
          <span className="text-muted-foreground">&middot;</span>
          <span className="text-2xl font-bold tracking-tight">
            {formatCompactRevenue(totalRevenue)}
          </span>
          <span className="text-sm text-muted-foreground">revenue</span>
        </div>

        {/* Close date countdown */}
        {closeInfo && (
          <p className={cn(
            'text-sm',
            closeInfo.urgent
              ? 'font-medium text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground',
            closeInfo.overdue && 'text-destructive',
          )}>
            {closeInfo.text}
          </p>
        )}

        {/* Quick links */}
        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
          <Button variant="outline" size="sm" className="min-h-[2.75rem] sm:min-h-0" asChild>
            <Link href={`/secretary/shows/${showId}/entries`}>
              View entries
              <ChevronRight className="size-3" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="min-h-[2.75rem] sm:min-h-0 text-muted-foreground" asChild>
            <Link href={`/secretary/shows/${showId}/financial`}>
              Financial summary
              <ChevronRight className="size-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Phase 3: Pre-Show ───────────────────────────────────────

function PreShowPanel({ show, showId }: { show: Show; showId: string }) {
  const { data: entryStats } = trpc.secretary.getShowEntryStats.useQuery(
    { showId },
    { staleTime: 60_000 },
  );
  const { data: autoDetect } = trpc.secretary.getChecklistAutoDetect.useQuery(
    { showId },
    { staleTime: 60_000 },
  );
  const { data: blockers } = trpc.secretary.getPhaseBlockers.useQuery(
    { showId },
    { staleTime: 60_000 },
  );

  const confirmedEntries = entryStats?.confirmed ?? entryStats?.totalEntries ?? 0;

  const showDayInfo = show.startDate
    ? formatDeadline(show.startDate, 'Show day')
    : null;

  const daysToGo = show.startDate ? formatDaysUntil(show.startDate) : null;

  // Pre-show preparation items
  const hasCatalogueNumbers = !!autoDetect?.catalogue_numbers_assigned;
  const hasRings = !!autoDetect?.rings_created;
  const hasStewards = !!autoDetect?.stewards_assigned;
  const hasJudgeOffers = !!autoDetect?.judge_offers_sent;
  const stewardCount = blockers?.startShowBlockers?.find(b => b.key === 'no_stewards') ? 0 : 1;

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          <span className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            Pre-show preparation
            {daysToGo && (
              <Badge variant="secondary" className="w-fit text-xs">
                {daysToGo} to go
              </Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Entry summary */}
        <p className="text-sm text-muted-foreground">
          {confirmedEntries} confirmed {confirmedEntries === 1 ? 'entry' : 'entries'}
        </p>

        {/* Two-column grid on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Documents column */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Documents
            </h4>
            <PrepItem
              done={hasCatalogueNumbers}
              label="Catalogue numbers"
              href={`/secretary/shows/${showId}/catalogue`}
            />
            <PrepItem
              done={false}
              label="Print shop"
              href={`/secretary/shows/${showId}/print-shop`}
            />
            <PrepItem
              done={!!show.scheduleUrl}
              label="Schedule PDF"
              href={`/secretary/shows/${showId}/schedule`}
            />
          </div>

          {/* People column */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              People
            </h4>
            <PrepItem
              done={hasJudgeOffers}
              label="Judge confirmation"
              href={`/secretary/shows/${showId}/people`}
            />
            <PrepItem
              done={hasStewards}
              label="Stewards assigned"
              href={`/secretary/shows/${showId}/people`}
            />
            <PrepItem
              done={hasRings}
              label="Rings set up"
              href={`/secretary/shows/${showId}/people`}
            />
          </div>
        </div>

        {/* Show day countdown */}
        {showDayInfo && (
          <p className={cn(
            'text-sm border-t pt-3',
            showDayInfo.urgent
              ? 'font-medium text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground',
          )}>
            {showDayInfo.text}
          </p>
        )}

        {/* Checklist link */}
        <div className="flex">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" asChild>
            <Link href={`/secretary/shows/${showId}/checklist`}>
              View full checklist
              <ChevronRight className="size-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** A single preparation item row */
function PrepItem({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 min-h-[2.75rem] sm:min-h-0 rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
    >
      {done ? (
        <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <Check className="size-2.5 text-emerald-600" />
        </div>
      ) : (
        <CircleDot className="size-4 shrink-0 text-muted-foreground/50" />
      )}
      <span className={cn(
        'flex-1 text-sm',
        done ? 'text-muted-foreground' : 'text-foreground',
      )}>
        {label}
      </span>
      <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
    </Link>
  );
}

// ── Phase 4: Show Day ───────────────────────────────────────

function ShowDayPanel({ show, showId }: { show: Show; showId: string }) {
  const { data: entryStats } = trpc.secretary.getShowEntryStats.useQuery(
    { showId },
    { staleTime: 30_000 },
  );

  const totalEntries = entryStats?.totalEntries ?? 0;
  const totalClasses = show.showClasses?.length ?? 0;

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <Gavel className="size-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">
            Judging is underway
          </h3>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            <strong className="text-foreground">{totalEntries}</strong> entries across{' '}
            <strong className="text-foreground">{totalClasses}</strong> classes
          </span>
        </div>

        {/* Action */}
        <div className="border-t pt-4">
          <Button className="w-full sm:w-auto min-h-[2.75rem]" asChild>
            <Link href={`/secretary/shows/${showId}/results`}>
              <Trophy className="size-4" />
              Record Results
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Phase 5: Post-Show ──────────────────────────────────────

function PostShowPanel({ show, showId }: { show: Show; showId: string }) {
  const resultsPublished = !!show.resultsPublishedAt;

  // RKC deadline: 14 days after show end date
  const rkcDeadline = new Date(show.endDate);
  rkcDeadline.setDate(rkcDeadline.getDate() + 14);
  const rkcInfo = formatDeadline(rkcDeadline, 'RKC submission deadline');

  // Count post-show tasks
  const tasks = [
    { label: 'Publish results', done: resultsPublished, href: `/secretary/shows/${showId}/results` },
    { label: 'Submit to RKC', done: false, href: `/secretary/shows/${showId}/documents` },
  ];
  const completedTasks = tasks.filter(t => t.done).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Trophy className="size-4 text-muted-foreground" />
          Show complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Results status */}
        <div className="flex items-center gap-2">
          {resultsPublished ? (
            <Badge variant="default" className="bg-emerald-600">Results published</Badge>
          ) : (
            <Badge variant="secondary">Results not yet published</Badge>
          )}
        </div>

        {/* RKC deadline */}
        <p className={cn(
          'text-sm',
          rkcInfo.urgent && !rkcInfo.overdue && 'font-medium text-amber-600 dark:text-amber-400',
          rkcInfo.overdue && 'font-medium text-destructive',
          !rkcInfo.urgent && !rkcInfo.overdue && 'text-muted-foreground',
        )}>
          {rkcInfo.text}
        </p>

        {/* Post-show task list */}
        <div className="space-y-1.5 border-t pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Post-show tasks ({completedTasks}/{tasks.length})
          </h4>
          {tasks.map((task) => (
            <Link
              key={task.label}
              href={task.href}
              className="flex items-center gap-2 min-h-[2.75rem] sm:min-h-0 rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
            >
              {task.done ? (
                <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Check className="size-2.5 text-emerald-600" />
                </div>
              ) : (
                <CircleDot className="size-4 shrink-0 text-muted-foreground/50" />
              )}
              <span className={cn(
                'flex-1 text-sm',
                task.done ? 'text-muted-foreground line-through' : 'text-foreground',
              )}>
                {task.label}
              </span>
              <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Cancelled ───────────────────────────────────────────────

function CancelledPanel() {
  return (
    <Card className="border-destructive/20 bg-destructive/5">
      <CardContent className="pt-6">
        <p className="text-sm font-semibold text-foreground">
          This show has been cancelled
        </p>
      </CardContent>
    </Card>
  );
}
