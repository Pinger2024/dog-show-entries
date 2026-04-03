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

export function LifecycleBanner({ show, entryStats, onOpenEntries }: LifecycleBannerProps) {
  const phase = derivePhase(show.status);
  const config = PHASE_CONFIG[phase];

  // Detect overdue entries: status is entries_open but close date has passed
  const entriesOverdue = phase === 'entries_open'
    && !!show.entryCloseDate
    && new Date(show.entryCloseDate).getTime() < Date.now();

  const Icon = entriesOverdue ? AlertTriangle : phaseIcons[phase];

  return (
    <div
      className={cn(
        'rounded-lg border-l-4 p-3 sm:p-4',
        entriesOverdue
          ? 'bg-rose-50 border-rose-400 dark:bg-rose-950/20 dark:border-rose-600'
          : cn(config.bgColor, config.borderColor),
        // Show day gets a more prominent treatment
        phase === 'show_day' && !entriesOverdue && 'bg-primary/10 border-primary',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn('mt-0.5 shrink-0', entriesOverdue ? 'text-rose-600 dark:text-rose-400' : config.color)}>
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
            {phase === 'show_day' && (
              <ShowDayContent show={show} />
            )}
            {phase === 'post_show' && (
              <PostShowContent show={show} />
            )}
            {phase === 'cancelled' && (
              <CancelledContent />
            )}
          </div>
        </div>
      </div>
    </div>
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
    <div className="space-y-2">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          {canOpen && !isLoading ? 'Everything\'s ready' : 'Set up your show'}
        </h3>
        {entriesOpenInfo && (
          <span className={cn(
            'text-xs',
            entriesOpenInfo.urgent ? 'text-amber-600 font-medium' : 'text-muted-foreground',
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
                  <Check className="size-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <X className={cn(
                    'size-3.5 shrink-0',
                    isRequired ? 'text-destructive' : 'text-amber-500',
                  )} />
                )}
                <span className={cn(
                  'text-xs',
                  isRequired ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {blocker.label}
                </span>
                {blocker.actionPath && (
                  <Link
                    href={`/secretary/shows/${show.id}${blocker.actionPath}`}
                    className="ml-auto flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 shrink-0 min-h-[1.75rem]"
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
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={onOpenEntries}
          >
            Open Entries
          </Button>
        ) : !isLoading && requiredBlockers.length > 0 ? (
          <Button
            size="sm"
            className="w-full sm:w-auto"
            disabled
          >
            Complete {requiredBlockers.length} item{requiredBlockers.length !== 1 ? 's' : ''} to open entries
          </Button>
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

  return (
    <div className="space-y-2">
      {closeInfo?.overdue ? (
        <>
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
            <div>
              <h3 className="text-sm font-semibold text-rose-800 dark:text-rose-300">
                Entries were scheduled to close on{' '}
                {new Date(show.entryCloseDate!).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                })}
              </h3>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80">
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
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} from {uniqueExhibitors}{' '}
              {uniqueExhibitors === 1 ? 'exhibitor' : 'exhibitors'}
            </h3>
            {closeInfo && (
              <span className={cn(
                'text-xs',
                closeInfo.urgent ? 'text-amber-600 font-medium' : 'text-muted-foreground',
              )}>
                {closeInfo.text}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href={`/secretary/shows/${show.id}/entries`}>
              View Entries
            </Link>
          </Button>
        </>
      )}
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
    <div className="space-y-2">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          Entries closed &mdash; {confirmedEntries} {confirmedEntries === 1 ? 'entry' : 'entries'} confirmed
        </h3>
        {showDayInfo && (
          <span className={cn(
            'text-xs',
            showDayInfo.urgent ? 'text-amber-600 font-medium' : 'text-muted-foreground',
          )}>
            {showDayInfo.text}
          </span>
        )}
      </div>
      <Button size="sm" variant="outline" className="w-full sm:w-auto" asChild>
        <Link href={`/secretary/shows/${show.id}/checklist`}>
          Go to Checklist
        </Link>
      </Button>
    </div>
  );
}

// ── Phase 4: Show Day ───────────────────────────────────────

function ShowDayContent({ show }: { show: Show }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        Show day is here
      </h3>
      <Button size="sm" className="w-full sm:w-auto" asChild>
        <Link href={`/secretary/shows/${show.id}/results`}>
          Record Results
        </Link>
      </Button>
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
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          Show complete
        </h3>
        <span className={cn(
          'text-xs',
          resultsPublished ? 'text-emerald-600' : 'text-muted-foreground',
        )}>
          {resultsPublished ? 'Results published' : 'Results not yet published'}
        </span>
      </div>
      <span className={cn(
        'block text-xs',
        rkcSubmitted && 'text-emerald-600',
        !rkcSubmitted && rkcInfo.urgent ? 'text-amber-600 font-medium' : '',
        !rkcSubmitted && rkcInfo.overdue && 'text-destructive font-medium',
        !rkcSubmitted && !rkcInfo.urgent && !rkcInfo.overdue && 'text-muted-foreground',
      )}>
        {rkcInfo.text}
      </span>
    </div>
  );
}

// ── Cancelled ───────────────────────────────────────────────

function CancelledContent() {
  return (
    <h3 className="text-sm font-semibold text-foreground">
      This show has been cancelled
    </h3>
  );
}
