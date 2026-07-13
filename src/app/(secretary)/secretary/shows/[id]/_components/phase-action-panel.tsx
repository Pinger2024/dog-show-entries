'use client';

import Link from 'next/link';
import { fireDogConfetti } from '@/lib/confetti';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  Gavel,
  Loader2,
  Megaphone,
  Printer,
  Send,
  Share2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import type { ScheduleData } from '@/server/db/schema/shows';
import type { RouterOutputs } from '@/server/trpc/router';
import {
  SECard,
  SEButton,
  Pulse,
  Chip,
  HoneyBanner,
  CountdownCells,
} from '@/components/show-experience/kit';
import { SE_H } from '@/components/show-experience/tokens';
import {
  derivePhase,
  formatDaysUntil,
  formatDeadline,
} from '../_lib/phase-utils';
import { useShowId } from '../_lib/show-context';
import { ConfirmCloseEntries } from './confirm-close-entries';

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

// ── Shared action card component ───────────────────────────

function ActionCard({
  href,
  icon: Icon,
  label,
  description,
  accent = 'default',
  badge,
  external,
  onClick,
}: {
  href?: string;
  icon: React.ElementType;
  label: string;
  description: string;
  accent?: 'default' | 'emerald' | 'blue' | 'amber' | 'primary' | 'rose';
  badge?: string;
  external?: boolean;
  onClick?: () => void;
}) {
  const accentStyles: Record<string, string> = {
    default: 'hover:bg-se-paper2/60',
    emerald: 'border-se-fresh-line/60 bg-se-fresh-soft/50 hover:bg-se-fresh-soft',
    blue: 'border-primary/20 bg-primary/5 hover:bg-primary/10',
    amber: 'border-se-honey-line/60 bg-se-honey-soft/50 hover:bg-se-honey-soft',
    primary: 'border-primary/20 bg-primary/5 hover:bg-primary/10',
    rose: 'border-destructive/20 bg-destructive/5 hover:bg-destructive/10',
  };

  const iconStyles: Record<string, string> = {
    default: 'bg-se-paper2 text-se-ink2',
    emerald: 'bg-se-fresh-soft text-se-fresh-deep',
    blue: 'bg-primary/10 text-primary',
    amber: 'bg-se-honey-soft text-se-honey-deep',
    primary: 'bg-primary/10 text-primary',
    rose: 'bg-destructive/10 text-destructive',
  };

  const content = (
    <SECard
      interactive
      className={cn(
        'group flex items-start gap-3.5 p-4 transition-colors duration-200',
        accentStyles[accent],
      )}
    >
      <div className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
        iconStyles[accent],
      )}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn(SE_H, 'text-sm text-se-ink')}>
            {label}
          </p>
          {badge && (
            <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-se-paper2 px-1.5 text-[10px] font-semibold text-se-ink2">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-se-ink3">
          {description}
        </p>
      </div>
      {external ? (
        <ExternalLink className="size-3.5 shrink-0 text-se-ink3/60 transition-colors group-hover:text-se-ink3" />
      ) : (
        <ChevronRight className="size-4 shrink-0 text-se-ink3/60 transition-colors group-hover:text-se-ink3" />
      )}
    </SECard>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left">
        {content}
      </button>
    );
  }

  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer">{content}</a>;
  }

  return <Link href={href!}>{content}</Link>;
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
      fireDogConfetti();
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

  const isChampionship = show.showType === 'championship';
  // SV/WUSV regionals aren't RKC-licensed and don't need RKC's Open + Limit
  // class requirements (Amanda 2026-05-24).
  const isSvShow = (show as { showRuleset?: string }).showRuleset === 'wusv';

  const autoKeys: { key: string; label: string }[] = [
    { key: 'classes_created', label: 'Classes created' },
    ...(isChampionship && !isSvShow ? [{ key: 'championship_classes_complete', label: 'Open + Limit classes for each sex' }] : []),
    { key: 'judges_assigned', label: 'Judge assigned' },
    { key: 'entry_fees_set', label: 'Entry fees set' },
    { key: 'entry_close_date_set', label: 'Entry close date set' },
    { key: 'secretary_details_set', label: 'Secretary details added' },
    { key: 'guarantors_added', label: 'Guarantors added' },
    { key: 'venue_set', label: 'Venue confirmed' },
    ...(isSvShow ? [] : [{ key: 'kc_licence_recorded', label: 'RKC licence recorded' }]),
    { key: 'sundry_items_reviewed', label: 'Sundry items added' },
  ];

  if (autoDetect) {
    for (const ak of autoKeys) {
      const isDone = autoDetect[ak.key] === true;
      const matchingBlocker = allBlockers.find((b) => {
        if (ak.key === 'classes_created' && b.key === 'no_classes') return true;
        if (ak.key === 'judges_assigned' && b.key === 'no_judge') return true;
        if (ak.key === 'entry_fees_set' && b.key === 'no_entry_fees') return true;
        if (ak.key === 'entry_close_date_set' && b.key === 'no_close_date') return true;
        if (ak.key === 'secretary_details_set' && b.key === 'no_secretary_details') return true;
        if (ak.key === 'guarantors_added' && b.key === 'insufficient_guarantors') return true;
        if (ak.key === 'venue_set' && b.key === 'no_venue') return true;
        if (ak.key === 'kc_licence_recorded' && b.key === 'no_rkc_licence') return true;
        if (ak.key === 'championship_classes_complete' && b.key === 'championship_missing_classes') return true;
        if (ak.key === 'sundry_items_reviewed' && b.key === 'no_sundry_items') return true;
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

  const completedCount = checklist.filter(c => c.done).length;
  const requiredBlockerCount = allBlockers.filter(b => b.severity === 'required').length;
  const totalCount = checklist.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleOpenEntries = () => {
    updateMutation.mutate({
      id: showId,
      status: 'entries_open',
    });
  };

  return (
    <SECard className="overflow-hidden border-se-honey-line/60 bg-se-honey-soft/30">
      <div className="px-5 pb-5 pt-5 sm:px-6">
        {/* Header with progress */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-se-honey-soft">
              <ClipboardList className="size-5 text-se-honey-deep" />
            </div>
            <div>
              <h3 className={cn(SE_H, 'text-base text-se-ink')}>
                Getting ready
              </h3>
              <p className="text-xs text-se-ink3">
                {completedCount} of {totalCount} items complete
              </p>
            </div>
          </div>
          {totalCount > 0 && (
            <div className="text-right">
              <span className={cn(SE_H, 'text-2xl text-se-honey-deep tabular-nums')}>
                {progressPct}%
              </span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-se-honey-soft">
            <div
              className="h-full rounded-full bg-se-honey transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {/* Checklist */}
        {isLoading ? (
          <div className="mt-4 flex items-center gap-2 py-4">
            <Loader2 className="size-4 animate-spin text-se-ink3" />
            <span className="text-sm text-se-ink3">Checking requirements...</span>
          </div>
        ) : (
          <div className="mt-4 space-y-1">
            {checklist.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-se-surface/60 min-h-[2.75rem]"
              >
                {item.done ? (
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-se-fresh-soft">
                    <Check className="size-3 text-se-fresh-deep" />
                  </div>
                ) : (
                  <div className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full',
                    item.severity === 'required'
                      ? 'bg-destructive/10'
                      : 'bg-se-paper2',
                  )}>
                    <X className={cn(
                      'size-3',
                      item.severity === 'required'
                        ? 'text-destructive'
                        : 'text-se-ink3',
                    )} />
                  </div>
                )}

                <span className={cn(
                  'flex-1 text-sm',
                  item.done
                    ? 'text-se-ink3 line-through'
                    : item.severity === 'required'
                      ? 'font-medium text-se-ink'
                      : 'text-se-ink3',
                )}>
                  {item.label}
                </span>

                {item.auto && item.done && (
                  <Chip tone="fresh" className="h-4 shrink-0 px-1.5 text-[10px]">
                    Auto
                  </Chip>
                )}

                {!item.done && item.actionPath && (
                  <Link
                    href={`/secretary/shows/${showId}${item.actionPath}`}
                    className="flex shrink-0 items-center gap-0.5 px-1 text-xs font-medium text-primary hover:underline min-h-[2.75rem] sm:min-h-0"
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
        <div className="mt-4 flex flex-col gap-3 border-t border-se-honey-line/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <SEButton
            variant={canOpen ? 'fresh' : 'ghost'}
            size="default"
            className="w-full disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
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
              `Complete ${requiredBlockerCount} required item${requiredBlockerCount !== 1 ? 's' : ''} to open`
            )}
          </SEButton>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-se-ink3"
            asChild
          >
            <Link href={`/secretary/shows/${showId}/checklist`}>
              View full checklist
              <ChevronRight className="size-3" />
            </Link>
          </Button>
        </div>
      </div>
    </SECard>
  );
}

// ── Phase 2: Entries Open ───────────────────────────────────

function EntriesOpenPanel({ show, showId }: { show: Show; showId: string }) {
  const closeInfo = show.entryCloseDate
    ? formatDeadline(show.entryCloseDate, 'Entries close')
    : null;

  const showUrl = `https://remishowmanager.co.uk/shows/${show.slug ?? showId}`;

  const utils = trpc.useUtils();
  const closeEntriesMutation = trpc.shows.update.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success('Entries closed');
    },
    onError: (err) => toast.error(err.message),
  });

  function handleCloseEntries() {
    closeEntriesMutation.mutate({ id: showId, status: 'entries_closed' });
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(showUrl).then(
      () => toast.success('Show link copied'),
      () => toast.error('Failed to copy link'),
    );
  }

  return (
    <div className="space-y-3">
      {/* Overdue warning banner — entries should have closed but haven't been */}
      {closeInfo?.overdue && (
        <SECard className="overflow-hidden border-destructive/30 bg-destructive/5">
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  Entries were scheduled to close on{' '}
                  {new Date(show.entryCloseDate!).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                <p className="mt-0.5 text-xs text-destructive/80">
                  Entries are still being accepted. Close them now or they will remain open.
                </p>
              </div>
            </div>
            <ConfirmCloseEntries onConfirm={handleCloseEntries}>
              <Button
                size="sm"
                variant="destructive"
                className="w-full shrink-0 sm:w-auto min-h-[2.75rem]"
                disabled={closeEntriesMutation.isPending}
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
            </ConfirmCloseEntries>
          </div>
        </SECard>
      )}

      {/* Countdown — honey band once in the urgent window, otherwise a
          quiet fresh strip */}
      {closeInfo && !closeInfo.overdue && (
        closeInfo.urgent ? (
          <HoneyBanner label="Entries close" date={closeInfo.text}>
            <CountdownCells target={new Date(show.entryCloseDate!)} dark />
          </HoneyBanner>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl border border-se-fresh-line/40 bg-se-fresh-soft/60 px-4 py-3">
            <Pulse />
            <span className="text-sm font-medium text-se-fresh-deep">
              {closeInfo.text}
            </span>
          </div>
        )
      )}

      {/* Action cards grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ActionCard
          href={`/secretary/shows/${showId}/entries`}
          icon={ClipboardList}
          label="View Entries"
          description="Review incoming entries, check details, and manage exhibitor submissions"
          accent="emerald"
        />
        <ActionCard
          href={`/secretary/shows/${showId}/financial`}
          icon={FileText}
          label="Financial Summary"
          description="Track payments, revenue, and refund requests"
          accent="blue"
        />
        <ActionCard
          icon={Share2}
          label="Share Your Show"
          description="Copy the show link to share on Facebook, WhatsApp, and breed groups"
          accent="amber"
          onClick={handleCopyLink}
        />
        <ActionCard
          href={showUrl}
          icon={ExternalLink}
          label="Public Show Page"
          description="See what exhibitors see when they visit your show"
          accent="default"
          external
        />
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="ghost" size="sm" className="h-8 text-xs text-se-ink3" asChild>
          <Link href={`/secretary/shows/${showId}/reports`}>
            Reports
            <ChevronRight className="size-3" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-se-ink3" asChild>
          <Link href={`/secretary/shows/${showId}/checklist`}>
            Checklist
            <ChevronRight className="size-3" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-se-ink3" asChild>
          <Link href={`/secretary/shows/${showId}/schedule`}>
            Schedule
            <ChevronRight className="size-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ── Phase 3: Pre-Show ───────────────────────────────────────

function PreShowPanel({ show, showId }: { show: Show; showId: string }) {
  const { data: autoDetect } = trpc.secretary.getChecklistAutoDetect.useQuery(
    { showId },
    { staleTime: 60_000 },
  );

  const daysToGo = show.startDate ? formatDaysUntil(show.startDate) : null;
  const showDayInfo = show.startDate
    ? formatDeadline(show.startDate, 'Show day')
    : null;

  const hasCatalogueNumbers = !!autoDetect?.catalogue_numbers_assigned;
  const hasStewards = !!autoDetect?.stewards_assigned;
  const hasRings = !!autoDetect?.rings_created;

  return (
    <div className="space-y-3">
      {/* Countdown strip */}
      {showDayInfo && (
        showDayInfo.urgent ? (
          <HoneyBanner label="Show day" date={showDayInfo.text}>
            <CountdownCells target={new Date(show.startDate)} dark />
          </HoneyBanner>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <span className="text-sm font-medium text-primary">
              {showDayInfo.text}
            </span>
            {daysToGo && (
              <span className="shrink-0 rounded-full bg-se-surface px-2.5 py-1 text-xs font-semibold text-se-ink2 shadow-[inset_0_0_0_1px_var(--color-se-line)]">
                {daysToGo}
              </span>
            )}
          </div>
        )
      )}

      {/* Action cards grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ActionCard
          href={`/secretary/shows/${showId}/catalogue`}
          icon={BookOpen}
          label="Catalogue"
          description="Assign catalogue numbers and generate the show catalogue"
          accent="blue"
          badge={hasCatalogueNumbers ? 'Done' : undefined}
        />
        <ActionCard
          href={`/secretary/shows/${showId}/print-shop`}
          icon={Printer}
          label="Print Shop"
          description="Order catalogues, ring boards, prize cards, and ring numbers"
          accent="amber"
        />
        <ActionCard
          href={`/secretary/shows/${showId}/people`}
          icon={Users}
          label="People & Stewards"
          description="Confirm stewards, assign rings, and finalise judge details"
          accent={hasStewards && hasRings ? 'emerald' : 'default'}
          badge={hasStewards ? 'Stewards set' : undefined}
        />
        <ActionCard
          href={`/secretary/shows/${showId}/checklist`}
          icon={ClipboardList}
          label="Show Checklist"
          description="Track all pre-show preparation tasks and deadlines"
          accent="default"
        />
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="ghost" size="sm" className="h-8 text-xs text-se-ink3" asChild>
          <Link href={`/secretary/shows/${showId}/entries`}>
            Entries
            <ChevronRight className="size-3" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-se-ink3" asChild>
          <Link href={`/secretary/shows/${showId}/reports`}>
            Reports
            <ChevronRight className="size-3" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-se-ink3" asChild>
          <Link href={`/secretary/shows/${showId}/documents`}>
            Documents
            <ChevronRight className="size-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ── Phase 4: Show Day ───────────────────────────────────────

function ShowDayPanel({ show, showId }: { show: Show; showId: string }) {
  return (
    <div className="space-y-3">
      {/* Hero card for results — the show's most exciting moment gets the
          fresh/live treatment */}
      <SECard className="overflow-hidden border-se-fresh-line/60 bg-gradient-to-br from-se-fresh-soft via-se-surface to-se-surface">
        <div className="px-5 py-6 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-se-fresh-soft">
              <Gavel className="size-7 text-se-fresh-deep" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Pulse />
                <h3 className={cn(SE_H, 'text-lg text-se-ink')}>
                  Judging is underway
                </h3>
              </div>
              <p className="mt-0.5 text-sm text-se-ink3">
                Record results as each class is judged
              </p>
            </div>
          </div>
          <div className="mt-5">
            <SEButton variant="fresh" size="default" className="w-full sm:w-auto" asChild>
              <Link href={`/secretary/shows/${showId}/results`}>
                <Trophy className="size-4" />
                Record Results
              </Link>
            </SEButton>
          </div>
        </div>
      </SECard>

      {/* Secondary actions */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ActionCard
          href={`/secretary/shows/${showId}/catalogue`}
          icon={BookOpen}
          label="Catalogue"
          description="Reference catalogue numbers during judging"
          accent="default"
        />
        <ActionCard
          href={`/secretary/shows/${showId}/entries`}
          icon={ClipboardList}
          label="Entries"
          description="Look up exhibitor and dog details"
          accent="default"
        />
      </div>
    </div>
  );
}

// ── Phase 5: Post-Show ──────────────────────────────────────

function PostShowPanel({ show, showId }: { show: Show; showId: string }) {
  const resultsPublished = !!show.resultsPublishedAt;
  const scheduleData = show.scheduleData as ScheduleData | null;
  const rkcSubmittedAt = scheduleData?.rkcSubmittedAt;
  const rkcSubmitted = !!rkcSubmittedAt;

  const utils = trpc.useUtils();

  const markRkcSubmitted = trpc.secretary.markRkcSubmitted.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success('Marked as submitted to RKC');
    },
    onError: (err) => toast.error(err.message),
  });

  // RKC deadline: 14 days after show end date
  const rkcDeadline = new Date(show.endDate);
  rkcDeadline.setDate(rkcDeadline.getDate() + 14);
  const rkcInfo = rkcSubmitted
    ? { text: `Submitted to RKC on ${new Date(rkcSubmittedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, urgent: false, overdue: false }
    : formatDeadline(rkcDeadline, 'RKC submission deadline');

  // Count completed tasks
  const tasks = [
    { done: resultsPublished, label: 'Publish results' },
    { done: rkcSubmitted, label: 'Submit to RKC' },
  ];
  const completedCount = tasks.filter(t => t.done).length;

  return (
    <div className="space-y-3">
      {/* Completion progress strip */}
      <SECard className="flex items-center justify-between gap-3 border-se-line bg-se-paper2/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <CheckCircle className={cn(
            'size-5',
            completedCount === tasks.length ? 'text-se-fresh-deep' : 'text-se-ink3',
          )} />
          <span className="text-sm font-medium text-se-ink">
            {completedCount === tasks.length
              ? 'All post-show tasks complete'
              : `${completedCount} of ${tasks.length} tasks complete`}
          </span>
        </div>
        {rkcSubmitted ? (
          <Chip tone="fresh">RKC submitted</Chip>
        ) : (
          <span className={cn(
            'text-xs font-medium',
            rkcInfo.overdue ? 'text-destructive' : rkcInfo.urgent ? 'text-se-honey-deep' : 'text-se-ink3',
          )}>
            {rkcInfo.text}
          </span>
        )}
      </SECard>

      {/* Action cards */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {!resultsPublished && (
          <ActionCard
            href={`/secretary/shows/${showId}/results`}
            icon={Trophy}
            label="Publish Results"
            description="Review and publish results for exhibitors to see"
            accent="amber"
          />
        )}
        {resultsPublished && (
          <ActionCard
            href={`/secretary/shows/${showId}/results`}
            icon={Trophy}
            label="Results"
            description="View and manage published results"
            accent="emerald"
            badge="Published"
          />
        )}

        {!rkcSubmitted ? (
          <ActionCard
            icon={Send}
            label="Mark RKC Submitted"
            description="Record that you've sent the marked catalogue to the RKC"
            accent="blue"
            onClick={() => markRkcSubmitted.mutate({ showId })}
          />
        ) : (
          <ActionCard
            href={`/secretary/shows/${showId}/documents`}
            icon={FileText}
            label="Documents"
            description="Download marked catalogue and other show documents"
            accent="default"
            badge="Submitted"
          />
        )}

        <ActionCard
          href={`/secretary/shows/${showId}/reports`}
          icon={FileText}
          label="Final Reports"
          description="Download entry reports, financial summaries, and breed stats"
          accent="default"
        />
        <ActionCard
          href={`/secretary/shows/${showId}/sponsors`}
          icon={Megaphone}
          label="Sponsors & Awards"
          description="Record best in show, best puppy, and other awards"
          accent="default"
        />
      </div>
    </div>
  );
}

// ── Cancelled ───────────────────────────────────────────────

function CancelledPanel() {
  return (
    <SECard className="flex items-center gap-3 border-destructive/20 bg-destructive/5 px-5 py-4">
      <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10">
        <X className="size-5 text-destructive" />
      </div>
      <div>
        <h3 className={cn(SE_H, 'text-base text-se-ink')}>
          Show cancelled
        </h3>
        <p className="mt-0.5 text-xs text-se-ink3">
          This show has been cancelled and is no longer visible to exhibitors.
        </p>
      </div>
    </SECard>
  );
}
