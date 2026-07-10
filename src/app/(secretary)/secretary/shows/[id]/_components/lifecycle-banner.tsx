'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Gavel,
  Loader2,
  Package,
  Settings,
  TrendingUp,
  XCircle,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import type { ScheduleData } from '@/server/db/schema/shows';
import { Button } from '@/components/ui/button';
import type { RouterOutputs } from '@/server/trpc/router';
import {
  SECard,
  SEDarkPanel,
  SEButton,
  Pulse,
  Chip,
  HoneyBanner,
  CountdownCells,
} from '@/components/show-experience/kit';
import { SE_H } from '@/components/show-experience/tokens';
import {
  derivePhase,
  formatDeadline,
  PHASE_CONFIG,
  type ShowPhase,
} from '../_lib/phase-utils';

type Show = NonNullable<RouterOutputs['shows']['getById']>;
type EntryStats = RouterOutputs['secretary']['getShowEntryStats'];

interface LifecycleBannerProps {
  show: Show;
  entryStats: EntryStats | undefined;
  onOpenEntries?: () => void;
}

const phaseIcons: Record<ShowPhase, React.ElementType> = {
  setup: Settings,
  entries_open: TrendingUp,
  pre_show: Package,
  show_day: Gavel,
  post_show: CheckCircle,
  cancelled: XCircle,
};

/* ============================================================
 * Lifecycle Banner — the show overview's phase-aware status card.
 * Re-presented in the Show Experience language: show day gets the
 * dark "living" band (SEDarkPanel + Pulse), entries closing soon get
 * a honey countdown, everything else is a tinted SECard using the
 * same phase colors PHASE_CONFIG has always defined. Content per
 * phase is unchanged — only the shell + presentational primitives.
 * ============================================================ */

export function LifecycleBanner({ show, entryStats, onOpenEntries }: LifecycleBannerProps) {
  const phase = derivePhase(show.status);
  const config = PHASE_CONFIG[phase];

  // Detect overdue entries: status is entries_open but close date has passed
  const entriesOverdue = phase === 'entries_open'
    && !!show.entryCloseDate
    && new Date(show.entryCloseDate).getTime() < Date.now();

  const Icon = entriesOverdue ? AlertTriangle : phaseIcons[phase];

  // Show day (not overdue) is the most exciting moment of the show — give
  // it the dark "living" band treatment, same language as the dashboard's
  // UrgentBand.
  if (phase === 'show_day' && !entriesOverdue) {
    return (
      <SEDarkPanel angle={172} className="rounded-2xl px-5 py-5 sm:px-6">
        <ShowDayContent show={show} />
      </SEDarkPanel>
    );
  }

  return (
    <SECard
      className={cn(
        'p-4 sm:p-5',
        entriesOverdue ? 'border-destructive/30 bg-destructive/5' : cn(config.bgColor, config.borderColor),
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={cn(
            'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-se-surface/70',
            entriesOverdue ? 'text-destructive' : config.color,
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          {phase === 'setup' && (
            <SetupContent show={show} onOpenEntries={onOpenEntries} />
          )}
          {phase === 'entries_open' && (
            <EntriesOpenContent show={show} entryStats={entryStats} />
          )}
          {phase === 'pre_show' && (
            <PreShowContent show={show} entryStats={entryStats} />
          )}
          {phase === 'post_show' && (
            <PostShowContent show={show} />
          )}
          {phase === 'cancelled' && (
            <CancelledContent />
          )}
        </div>
      </div>
    </SECard>
  );
}

// ── Phase 1: Setup ──────────────────────────────────────────

function SetupContent({
  show,
  onOpenEntries,
}: {
  show: Show;
  onOpenEntries?: () => void;
}) {
  const { data: blockers, isLoading } = trpc.secretary.getPhaseBlockers.useQuery(
    { showId: show.id },
    { staleTime: 30_000 },
  );

  const requiredBlockers = blockers?.openEntriesBlockers.filter(
    (b) => b.severity === 'required',
  ) ?? [];
  const allBlockers = blockers?.openEntriesBlockers ?? [];
  const canOpen = blockers?.canOpenEntries ?? false;

  const entriesOpenInfo = show.entriesOpenDate
    ? formatDeadline(show.entriesOpenDate, 'Entries scheduled to open')
    : null;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <h3 className={cn(SE_H, 'text-sm text-se-ink sm:text-base')}>
          {canOpen && !isLoading ? 'Everything\'s ready' : 'Set up your show'}
        </h3>
        {entriesOpenInfo && (
          <span className={cn(
            'text-xs',
            entriesOpenInfo.urgent ? 'font-medium text-se-honey-deep' : 'text-se-ink3',
          )}>
            {entriesOpenInfo.text}
          </span>
        )}
      </div>

      {/* Blocker checklist */}
      {!isLoading && allBlockers.length > 0 && !canOpen && (
        <div className="space-y-1">
          {allBlockers.map((blocker) => {
            const done = false; // Blockers in the list are always incomplete
            const isRequired = blocker.severity === 'required';
            return (
              <div
                key={blocker.key}
                className="flex items-center gap-2 min-h-[2.75rem] sm:min-h-0"
              >
                {done ? (
                  <Check className="size-3.5 shrink-0 text-se-fresh-deep" />
                ) : (
                  <X className={cn(
                    'size-3.5 shrink-0',
                    isRequired ? 'text-destructive' : 'text-se-honey-deep',
                  )} />
                )}
                <span className={cn(
                  'text-xs',
                  isRequired ? 'text-se-ink' : 'text-se-ink3',
                )}>
                  {blocker.label}
                </span>
                {blocker.actionPath && (
                  <Link
                    href={`/secretary/shows/${show.id}${blocker.actionPath}`}
                    className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-se-fresh-soft px-2.5 py-0.5 text-xs font-semibold text-se-fresh-deep transition-colors hover:bg-se-fresh-soft/70 min-h-[1.75rem]"
                  >
                    Fix
                    <ChevronRight className="size-3" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action button */}
      <div className="pt-1">
        {canOpen ? (
          <SEButton
            variant="fresh"
            size="sm"
            className="w-full sm:w-auto"
            onClick={onOpenEntries}
          >
            Open Entries
          </SEButton>
        ) : !isLoading && requiredBlockers.length > 0 ? (
          <SEButton
            variant="ghost"
            size="sm"
            className="w-full disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
            disabled
          >
            Complete {requiredBlockers.length} item{requiredBlockers.length !== 1 ? 's' : ''} to open entries
          </SEButton>
        ) : null}
      </div>
    </div>
  );
}

// ── Phase 2: Entries Open ───────────────────────────────────

function EntriesOpenContent({
  show,
  entryStats,
}: {
  show: Show;
  entryStats: EntryStats | undefined;
}) {
  const totalEntries = entryStats?.totalEntries ?? 0;
  const uniqueExhibitors = entryStats?.uniqueExhibitors ?? 0;

  const closeInfo = show.entryCloseDate
    ? formatDeadline(show.entryCloseDate, 'Entries close')
    : null;

  const utils = trpc.useUtils();
  const closeEntriesMutation = trpc.shows.update.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: show.id });
      toast.success('Entries closed');
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  if (closeInfo?.overdue) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className={cn(SE_H, 'text-sm text-destructive')}>
              Entries were scheduled to close on{' '}
              {new Date(show.entryCloseDate!).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
              })}
            </p>
            <p className="text-xs text-destructive/80">
              {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} from{' '}
              {uniqueExhibitors} {uniqueExhibitors === 1 ? 'exhibitor' : 'exhibitors'} — entries are still being accepted
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="destructive"
          className="w-full sm:w-auto min-h-[2.75rem]"
          disabled={closeEntriesMutation.isPending}
          onClick={() => closeEntriesMutation.mutate({ id: show.id, status: 'entries_closed' })}
        >
          {closeEntriesMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Closing...
            </>
          ) : (
            'Close Entries Now'
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pulse />
        <h3 className={cn(SE_H, 'text-sm text-se-ink sm:text-base')}>
          {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} from {uniqueExhibitors}{' '}
          {uniqueExhibitors === 1 ? 'exhibitor' : 'exhibitors'}
        </h3>
      </div>

      {/* Countdown — honey band once we're inside the urgent window,
          otherwise a quiet deadline line. */}
      {closeInfo?.urgent ? (
        <HoneyBanner label="Entries close" date={closeInfo.text}>
          <CountdownCells target={new Date(show.entryCloseDate!)} dark />
        </HoneyBanner>
      ) : closeInfo ? (
        <p className="text-xs text-se-ink3">{closeInfo.text}</p>
      ) : null}

      {/* Two clear actions while entries are open: view the list, or
          close entries early. The early-close button used to only appear
          once the deadline had passed — Amanda 2026-05-28 needed to close
          before the date without hunting for the status badge. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SEButton asChild variant="ghost" size="sm" className="w-full sm:w-auto">
          <Link href={`/secretary/shows/${show.id}/entries`}>
            View Entries
          </Link>
        </SEButton>
        <SEButton
          variant="ghost"
          size="sm"
          className="w-full disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          disabled={closeEntriesMutation.isPending}
          onClick={() => closeEntriesMutation.mutate({ id: show.id, status: 'entries_closed' })}
        >
          {closeEntriesMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Closing...
            </>
          ) : (
            'Close entries now'
          )}
        </SEButton>
      </div>
    </div>
  );
}

// ── Phase 3: Pre-Show ───────────────────────────────────────

function PreShowContent({
  show,
  entryStats,
}: {
  show: Show;
  entryStats: EntryStats | undefined;
}) {
  const confirmedEntries = entryStats?.confirmed ?? entryStats?.totalEntries ?? 0;

  const showDayInfo = show.startDate
    ? formatDeadline(show.startDate, 'Show day')
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <h3 className={cn(SE_H, 'text-sm text-se-ink sm:text-base')}>
          Entries closed &mdash; {confirmedEntries} {confirmedEntries === 1 ? 'entry' : 'entries'} confirmed
        </h3>
      </div>

      {showDayInfo?.urgent ? (
        <HoneyBanner label="Show day" date={showDayInfo.text}>
          <CountdownCells target={new Date(show.startDate)} dark />
        </HoneyBanner>
      ) : showDayInfo ? (
        <p className="text-xs text-se-ink3">{showDayInfo.text}</p>
      ) : null}

      <SEButton asChild variant="ghost" size="sm" className="w-full sm:w-auto">
        <Link href={`/secretary/shows/${show.id}/checklist`}>
          Go to Checklist
        </Link>
      </SEButton>
    </div>
  );
}

// ── Phase 4: Show Day (rendered inside SEDarkPanel by the parent) ──

function ShowDayContent({ show }: { show: Show }) {
  return (
    <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <Pulse />
        <h3 className={cn(SE_H, 'text-base text-se-cream sm:text-lg')}>
          Show day is here
        </h3>
      </div>
      <SEButton asChild variant="fresh" size="sm" className="w-full sm:w-auto">
        <Link href={`/secretary/shows/${show.id}/results`}>
          <Gavel className="size-4" />
          Record Results
        </Link>
      </SEButton>
    </div>
  );
}

// ── Phase 5: Post-Show ──────────────────────────────────────

function PostShowContent({ show }: { show: Show }) {
  const resultsPublished = !!show.resultsPublishedAt;
  const scheduleData = show.scheduleData as ScheduleData | null;
  const rkcSubmitted = !!scheduleData?.rkcSubmittedAt;

  // RKC deadline: 14 days after show end date
  const rkcDeadline = new Date(show.endDate);
  rkcDeadline.setDate(rkcDeadline.getDate() + 14);
  const rkcInfo = rkcSubmitted
    ? { text: 'Submitted to RKC', urgent: false, overdue: false }
    : formatDeadline(rkcDeadline, 'RKC submission deadline');

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <h3 className={cn(SE_H, 'text-sm text-se-ink sm:text-base')}>
          Show complete
        </h3>
        <Chip tone={resultsPublished ? 'fresh' : 'light'}>
          {resultsPublished ? 'Results published' : 'Results not yet published'}
        </Chip>
      </div>
      <span className={cn(
        'block text-xs',
        rkcSubmitted && 'text-se-fresh-deep',
        !rkcSubmitted && rkcInfo.urgent ? 'font-medium text-se-honey-deep' : '',
        !rkcSubmitted && rkcInfo.overdue && 'font-medium text-destructive',
        !rkcSubmitted && !rkcInfo.urgent && !rkcInfo.overdue && 'text-se-ink3',
      )}>
        {rkcInfo.text}
      </span>
    </div>
  );
}

// ── Cancelled ───────────────────────────────────────────────

function CancelledContent() {
  return (
    <h3 className={cn(SE_H, 'text-sm text-destructive sm:text-base')}>
      This show has been cancelled
    </h3>
  );
}
