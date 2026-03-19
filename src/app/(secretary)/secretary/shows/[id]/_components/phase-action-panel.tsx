'use client';

import Link from 'next/link';
import {
  BookOpen,
  Check,
  CheckCircle,
  ChevronRight,
  CircleDot,
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
import { Badge } from '@/components/ui/badge';
import type { ScheduleData } from '@/server/db/schema/shows';
import type { RouterOutputs } from '@/server/trpc/router';
import {
  derivePhase,
  formatDaysUntil,
  formatDeadline,
} from '../_lib/phase-utils';
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
  const accentStyles = {
    default: 'bg-muted/40 hover:bg-muted/60 border-border/60',
    emerald: 'bg-emerald-50/60 hover:bg-emerald-50 border-emerald-200/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30 dark:border-emerald-800/40',
    blue: 'bg-blue-50/60 hover:bg-blue-50 border-blue-200/60 dark:bg-blue-950/20 dark:hover:bg-blue-950/30 dark:border-blue-800/40',
    amber: 'bg-amber-50/60 hover:bg-amber-50 border-amber-200/60 dark:bg-amber-950/20 dark:hover:bg-amber-950/30 dark:border-amber-800/40',
    primary: 'bg-primary/5 hover:bg-primary/10 border-primary/20',
    rose: 'bg-rose-50/60 hover:bg-rose-50 border-rose-200/60 dark:bg-rose-950/20 dark:hover:bg-rose-950/30 dark:border-rose-800/40',
  };

  const iconStyles = {
    default: 'bg-muted text-muted-foreground',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    primary: 'bg-primary/10 text-primary',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
  };

  const content = (
    <div className={cn(
      'group relative flex items-start gap-3.5 rounded-2xl border p-4 transition-all duration-200',
      'hover:shadow-sm hover:-translate-y-0.5',
      accentStyles[accent],
    )}>
      <div className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
        iconStyles[accent],
      )}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-serif text-sm font-semibold tracking-tight text-foreground">
            {label}
          </p>
          {badge && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {badge}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {external ? (
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
      ) : (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
      )}
    </div>
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

  const autoKeys: { key: string; label: string }[] = [
    { key: 'classes_created', label: 'Classes created' },
    ...(isChampionship ? [{ key: 'championship_classes_complete', label: 'Open + Limit classes for each sex' }] : []),
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
    <div className="overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 shadow-sm dark:border-amber-800/30 dark:from-amber-950/20 dark:via-background dark:to-orange-950/10">
      <div className="px-5 pb-5 pt-5 sm:px-6">
        {/* Header with progress */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
              <ClipboardList className="size-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-serif text-base font-semibold tracking-tight">
                Getting ready
              </h3>
              <p className="text-xs text-muted-foreground">
                {completedCount} of {totalCount} items complete
              </p>
            </div>
          </div>
          {totalCount > 0 && (
            <div className="text-right">
              <span className="text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
                {progressPct}%
              </span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/30">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {/* Checklist */}
        {isLoading ? (
          <div className="mt-4 flex items-center gap-2 py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking requirements...</span>
          </div>
        ) : (
          <div className="mt-4 space-y-1">
            {checklist.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/60 dark:hover:bg-white/5 min-h-[2.75rem]"
              >
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

                {item.auto && item.done && (
                  <Badge variant="secondary" className="h-4 shrink-0 px-1.5 py-0 text-[10px]">
                    Auto
                  </Badge>
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
        <div className="mt-4 flex flex-col gap-3 border-t border-amber-200/40 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800/20">
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
              `Complete ${requiredBlockerCount} required item${requiredBlockerCount !== 1 ? 's' : ''} to open`
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
      </div>
    </div>
  );
}

// ── Phase 2: Entries Open ───────────────────────────────────

function EntriesOpenPanel({ show, showId }: { show: Show; showId: string }) {
  const closeInfo = show.entryCloseDate
    ? formatDeadline(show.entryCloseDate, 'Entries close')
    : null;

  const showUrl = `https://remishowmanager.co.uk/shows/${show.slug ?? showId}`;

  function handleCopyLink() {
    navigator.clipboard.writeText(showUrl).then(
      () => toast.success('Show link copied'),
      () => toast.error('Failed to copy link'),
    );
  }

  return (
    <div className="space-y-3">
      {/* Countdown strip */}
      {closeInfo && (
        <div className={cn(
          'flex items-center gap-2.5 rounded-xl px-4 py-3',
          closeInfo.overdue
            ? 'bg-rose-50 border border-rose-200/60 dark:bg-rose-950/20 dark:border-rose-800/40'
            : closeInfo.urgent
              ? 'bg-amber-50 border border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-800/40'
              : 'bg-emerald-50/60 border border-emerald-200/40 dark:bg-emerald-950/10 dark:border-emerald-800/30',
        )}>
          <span className="relative flex size-2.5">
            <span className={cn(
              'absolute inline-flex size-full animate-ping rounded-full opacity-75',
              closeInfo.overdue ? 'bg-rose-400' : closeInfo.urgent ? 'bg-amber-400' : 'bg-emerald-400',
            )} />
            <span className={cn(
              'relative inline-flex size-2.5 rounded-full',
              closeInfo.overdue ? 'bg-rose-500' : closeInfo.urgent ? 'bg-amber-500' : 'bg-emerald-500',
            )} />
          </span>
          <span className={cn(
            'text-sm font-medium',
            closeInfo.overdue
              ? 'text-rose-700 dark:text-rose-400'
              : closeInfo.urgent
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400',
          )}>
            {closeInfo.text}
          </span>
        </div>
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
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" asChild>
          <Link href={`/secretary/shows/${showId}/reports`}>
            Reports
            <ChevronRight className="size-3" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" asChild>
          <Link href={`/secretary/shows/${showId}/checklist`}>
            Checklist
            <ChevronRight className="size-3" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" asChild>
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
        <div className={cn(
          'flex items-center justify-between gap-3 rounded-xl px-4 py-3',
          showDayInfo.urgent
            ? 'bg-amber-50 border border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-800/40'
            : 'bg-blue-50/60 border border-blue-200/40 dark:bg-blue-950/10 dark:border-blue-800/30',
        )}>
          <span className={cn(
            'text-sm font-medium',
            showDayInfo.urgent
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-blue-700 dark:text-blue-400',
          )}>
            {showDayInfo.text}
          </span>
          {daysToGo && (
            <Badge variant="secondary" className="text-xs">
              {daysToGo}
            </Badge>
          )}
        </div>
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
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" asChild>
          <Link href={`/secretary/shows/${showId}/entries`}>
            Entries
            <ChevronRight className="size-3" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" asChild>
          <Link href={`/secretary/shows/${showId}/reports`}>
            Reports
            <ChevronRight className="size-3" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" asChild>
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
      {/* Hero card for results */}
      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm">
        <div className="px-5 py-6 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15">
              <Gavel className="size-7 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-lg font-bold tracking-tight">
                Judging is underway
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Record results as each class is judged
              </p>
            </div>
          </div>
          <div className="mt-5">
            <Button size="lg" className="w-full sm:w-auto min-h-[2.75rem] gap-2" asChild>
              <Link href={`/secretary/shows/${showId}/results`}>
                <Trophy className="size-4" />
                Record Results
              </Link>
            </Button>
          </div>
        </div>
      </div>

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
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <CheckCircle className={cn(
            'size-5',
            completedCount === tasks.length ? 'text-emerald-600' : 'text-muted-foreground',
          )} />
          <span className="text-sm font-medium">
            {completedCount === tasks.length
              ? 'All post-show tasks complete'
              : `${completedCount} of ${tasks.length} tasks complete`}
          </span>
        </div>
        {rkcSubmitted ? (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
            RKC submitted
          </Badge>
        ) : (
          <span className={cn(
            'text-xs font-medium',
            rkcInfo.overdue ? 'text-destructive' : rkcInfo.urgent ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
          )}>
            {rkcInfo.text}
          </span>
        )}
      </div>

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
    <div className="flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-4">
      <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10">
        <X className="size-5 text-destructive" />
      </div>
      <div>
        <h3 className="font-serif text-base font-semibold tracking-tight text-foreground">
          Show cancelled
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This show has been cancelled and is no longer visible to exhibitors.
        </p>
      </div>
    </div>
  );
}
