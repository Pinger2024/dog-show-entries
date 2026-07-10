'use client';

import Link from 'next/link';
import { format, parseISO, isSameDay, differenceInDays } from 'date-fns';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  Ticket,
  PoundSterling,
  Plus,
  ArrowRight,
  Archive,
  Clock,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/date-utils';
import { displayShowTitle } from '@/lib/show-types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Eyebrow,
  SecLabel,
  Pulse,
  SEButton,
  SECard,
  SEDarkPanel,
  HoneyBanner,
  CountdownCells,
} from '@/components/show-experience/kit';
import { SE_H } from '@/components/show-experience/tokens';

/* ============================================================
 * Secretary Dashboard — re-presented in the Show Experience (green)
 * design language. Same data, same actions, same states as before;
 * only the presentation layer changed. See kit.tsx / shows-list.tsx /
 * dashboard/page.tsx for the established patterns this borrows from.
 * ============================================================ */

type DashboardData = NonNullable<ReturnType<typeof trpc.secretary.getDashboard.useQuery>['data']>;
type DashboardShow = DashboardData['activeShows'][number];

/* ─── Status pill (secretary side — covers draft/published too, not
 * just the public-facing statuses shows-list.tsx's pill covers) ──── */

type PillTone = 'fresh' | 'honey' | 'light';

function getStatusPill(show: DashboardShow): {
  tone: PillTone;
  label: string;
  showPulse?: boolean;
  showClock?: boolean;
  dangerText?: boolean;
} {
  if (show.status === 'entries_open') {
    if (show.entryCloseDate) {
      const days = differenceInDays(new Date(show.entryCloseDate), new Date());
      if (days <= 0) return { tone: 'honey', label: 'Closes today!', showClock: true };
      if (days <= 7) return { tone: 'honey', label: `Closes in ${days}d`, showClock: true };
    }
    return { tone: 'fresh', label: 'Entries open', showPulse: true };
  }
  if (show.status === 'in_progress') return { tone: 'fresh', label: 'In progress', showPulse: true };
  if (show.status === 'published') {
    if (show.entriesOpenDate) {
      return { tone: 'light', label: `Opens ${format(new Date(show.entriesOpenDate), 'd MMM')}` };
    }
    return { tone: 'light', label: 'Published' };
  }
  if (show.status === 'entries_closed') return { tone: 'light', label: 'Entries closed' };
  if (show.status === 'completed') return { tone: 'light', label: 'Completed' };
  if (show.status === 'cancelled') return { tone: 'light', label: 'Cancelled', dangerText: true };
  return { tone: 'light', label: 'Draft' };
}

/* ─── Urgent fact — the single most pressing thing across the
 * secretary's active shows, surfaced in the brand band up top. ──── */

type UrgentFact =
  | { kind: 'today'; show: DashboardShow }
  | { kind: 'closing'; show: DashboardShow; closeDate: Date; days: number };

function getUrgentFact(shows: DashboardShow[]): UrgentFact | null {
  const now = new Date();

  const todayShow = shows.find(
    (s) => s.status !== 'draft' && isSameDay(parseISO(s.startDate), now)
  );
  if (todayShow) return { kind: 'today', show: todayShow };

  let soonest: { show: DashboardShow; closeDate: Date; days: number } | null = null;
  for (const s of shows) {
    if (s.status !== 'entries_open' || !s.entryCloseDate) continue;
    const closeDate = new Date(s.entryCloseDate);
    if (closeDate.getTime() <= now.getTime()) continue;
    const days = differenceInDays(closeDate, now);
    if (days > 7) continue;
    if (!soonest || closeDate.getTime() < soonest.closeDate.getTime()) {
      soonest = { show: s, closeDate, days };
    }
  }
  if (soonest) return { kind: 'closing', show: soonest.show, closeDate: soonest.closeDate, days: soonest.days };
  return null;
}

/* ─── Page ───────────────────────────────────────────────────────── */

export default function SecretaryDashboardPage() {
  const { data, isLoading } = trpc.secretary.getDashboard.useQuery();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const activeShows = data?.activeShows ?? [];
  const pastShows = data?.pastShows ?? [];
  const activeShowsCount = data?.activeShowsCount ?? 0;
  const totalEntries = data?.totalEntries ?? 0;
  const activeRevenue = data?.activeRevenue ?? 0;
  const urgent = getUrgentFact(activeShows);

  return (
    <div className="space-y-5 pb-16 md:pb-0">
      {/* Club setup prompt — shown when no shows exist yet */}
      {activeShows.length === 0 && pastShows.length === 0 && <ClubSetupPrompt />}

      {/* Urgent banner — only when there's something time-sensitive to
          surface. The club-context "Managing" switcher already lives in
          SecretaryShell's sidebar/mobile bar, so it isn't repeated here. */}
      {urgent && <UrgentBand urgent={urgent} />}

      {/* Stats — scoped to active shows */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <StatTile icon={CalendarDays} label="Active shows" value={activeShowsCount} tone="fresh" />
        <StatTile icon={Ticket} label="Total entries" value={totalEntries} tone="fresh" />
        <StatTile
          icon={PoundSterling}
          label="Active revenue"
          value={formatCurrency(activeRevenue)}
          tone="honey"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="flex justify-end">
        <SEButton asChild variant="primary" className="w-full justify-center sm:w-auto">
          <Link href="/secretary/shows/new">
            <Plus className="size-4" />
            Create Show
          </Link>
        </SEButton>
      </div>

      {/* Shows list with tabs */}
      <Tabs defaultValue="active" className="gap-3.5">
        <TabsList className="h-auto w-full gap-1 rounded-full border border-se-line bg-se-paper2 p-1 group-data-[orientation=horizontal]/tabs:h-auto sm:w-auto">
          <TabsTrigger
            value="active"
            className="flex-1 gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-se-ink2 hover:text-se-ink data-[state=active]:bg-se-green data-[state=active]:text-se-cream data-[state=active]:font-semibold group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none sm:flex-none"
          >
            Active shows
            <CountBubble n={activeShows.length} />
          </TabsTrigger>
          <TabsTrigger
            value="past"
            className="flex-1 gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-se-ink2 hover:text-se-ink data-[state=active]:bg-se-green data-[state=active]:text-se-cream data-[state=active]:font-semibold group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none sm:flex-none"
          >
            Past &amp; cancelled
            <CountBubble n={pastShows.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <SecLabel
            right={
              <span className="text-xs font-semibold text-se-ink3">
                {activeShows.length} show{activeShows.length !== 1 ? 's' : ''}
              </span>
            }
          >
            Active shows
          </SecLabel>
          {activeShows.length === 0 ? (
            <EmptyShowsState
              icon={CalendarDays}
              title="No active shows"
              description="Create your first show to start accepting entries."
              action={
                <SEButton asChild variant="fresh" size="sm">
                  <Link href="/secretary/shows/new">
                    Create Show
                    <ArrowRight className="size-3.5" />
                  </Link>
                </SEButton>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {activeShows.map((show) => (
                <ShowRow key={show.id} show={show} featured={urgent != null && urgent.show.id === show.id} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past">
          <SecLabel
            right={
              <span className="text-xs font-semibold text-se-ink3">
                {pastShows.length} show{pastShows.length !== 1 ? 's' : ''}
              </span>
            }
          >
            Past &amp; cancelled
          </SecLabel>
          {pastShows.length === 0 ? (
            <EmptyShowsState
              icon={Archive}
              title="No past shows"
              description="Completed and cancelled shows will appear here."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {pastShows.map((show) => (
                <ShowRow key={show.id} show={show} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Club setup prompt ──────────────────────────────────────────── */

function ClubSetupPrompt() {
  return (
    <SECard className="flex flex-col items-center gap-3 border-se-fresh-line bg-se-fresh-soft p-4 text-center sm:flex-row sm:text-left">
      <div className="min-w-0 flex-1">
        <p className={cn(SE_H, 'text-[15px] text-se-ink')}>Set up your club first</p>
        <p className="mt-1 text-[13px] leading-relaxed text-se-ink2">
          Add your officers, committee members, and contact details before creating your first
          show. This information flows into your schedule and official documents.
        </p>
      </div>
      <SEButton asChild variant="ghost" size="sm" className="w-full shrink-0 sm:w-auto">
        <Link href="/secretary/club">
          Complete Club Profile
          <ArrowRight className="size-4" />
        </Link>
      </SEButton>
    </SECard>
  );
}

/* ─── Urgent band — compact dark-pine urgency banner for the single
 * most pressing show (show-day-today, or entries closing within the
 * week). Renders nothing when neither applies — the club-context
 * "Managing" switcher already lives in SecretaryShell, so this band
 * is purely about "what needs my attention", not "which club". ──── */

function UrgentBand({ urgent }: { urgent: UrgentFact }) {
  const href = `/secretary/shows/${urgent.show.slug ?? urgent.show.id}`;
  const showTitle = displayShowTitle(urgent.show.name, urgent.show.organisation?.name);

  return (
    <Link href={href} className="block">
      <SEDarkPanel angle={172} className="rounded-3xl px-5 py-5 sm:px-6 sm:py-6">
        <Eyebrow className="relative text-se-cream/70">
          {urgent.kind === 'today' ? 'Show day' : 'Next deadline'}
        </Eyebrow>

        {urgent.kind === 'today' ? (
          <div className="relative mt-2 flex items-center gap-2">
            <Pulse />
            <span className={cn(SE_H, 'truncate text-xl text-se-cream sm:text-2xl')}>{showTitle}</span>
          </div>
        ) : (
          <HoneyBanner
            className="relative mt-2"
            label={showTitle}
            date={
              urgent.days <= 0
                ? 'Closes today!'
                : urgent.days === 1
                  ? 'Closes tomorrow'
                  : `Closes ${format(urgent.closeDate, 'd MMM')}`
            }
          >
            <CountdownCells target={urgent.closeDate} dark />
          </HoneyBanner>
        )}
      </SEDarkPanel>
    </Link>
  );
}

/* ─── Stat tile ──────────────────────────────────────────────────── */

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone: 'fresh' | 'honey';
  className?: string;
}) {
  return (
    <SECard className={cn('p-3.5 sm:p-4', className)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            tone === 'fresh' ? 'bg-se-fresh-soft text-se-fresh-deep' : 'bg-se-honey-soft text-se-honey-deep'
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <Eyebrow className="truncate">{label}</Eyebrow>
      </div>
      <p className={cn(SE_H, 'mt-2 truncate text-[24px] leading-none tabular-nums text-se-ink sm:text-[26px]')}>
        {value}
      </p>
    </SECard>
  );
}

/* ─── Tab count bubble ───────────────────────────────────────────── */

function CountBubble({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-se-surface/85 px-1 text-[10.5px] font-bold text-se-ink2">
      {n}
    </span>
  );
}

/* ─── Show row — the date-tile card pattern from shows-list.tsx,
 * adapted for the secretary's own shows (entry count + revenue meta
 * instead of venue distance / entry fee). ───────────────────────── */

function ShowRow({ show, featured }: { show: DashboardShow; featured?: boolean }) {
  const pill = getStatusPill(show);
  const start = parseISO(show.startDate);
  const dayNum = format(start, 'd');
  const monthShort = format(start, 'MMM').toUpperCase();
  const entryCount = show.entryCount ?? 0;
  const revenue = show.showRevenue ?? 0;
  const metaLine = [show.organisation?.name, show.venue?.name].filter(Boolean).join(' · ');

  return (
    <Link href={`/secretary/shows/${show.slug ?? show.id}`} className="group block">
      <SECard interactive className={cn('flex gap-[13px] p-3.5', featured && 'border-se-fresh-line')}>
        {/* Date tile */}
        <div
          className={cn(
            'flex w-[58px] shrink-0 flex-col items-center self-start rounded-xl py-2.5',
            featured ? 'bg-se-fresh-soft' : 'bg-se-paper2'
          )}
        >
          <span
            className={cn('text-2xl font-bold leading-[0.95]', featured ? 'text-se-fresh-deep' : 'text-se-ink')}
          >
            {dayNum}
          </span>
          <span className="mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-se-ink3">
            {monthShort}
          </span>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-bold leading-[1.15] tracking-[-0.015em] text-se-ink transition-colors group-hover:text-se-green">
            {displayShowTitle(show.name, show.organisation?.name)}
          </h3>
          {metaLine && <p className="mt-0.5 truncate text-[12.5px] text-se-ink3">{metaLine}</p>}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex h-6 items-center gap-[5px] rounded-full px-[9px] text-[11.5px] font-semibold',
                pill.tone === 'honey' && 'bg-se-honey-soft text-se-honey-deep',
                pill.tone === 'fresh' && 'bg-se-fresh-soft text-se-fresh-deep',
                pill.tone === 'light' &&
                  cn('bg-se-surface text-se-ink2 shadow-[inset_0_0_0_1px_var(--color-se-line)]', pill.dangerText && 'text-red-600')
              )}
            >
              {pill.showPulse && <Pulse />}
              {pill.showClock && <Clock className="size-3" />}
              {pill.label}
            </span>

            {entryCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-se-fresh-deep">
                <Ticket className="size-3" />
                {entryCount} entr{entryCount !== 1 ? 'ies' : 'y'}
              </span>
            )}

            {revenue > 0 && (
              <span className="ml-auto shrink-0 whitespace-nowrap text-[12.5px] font-bold text-se-fresh-deep">
                {formatCurrency(revenue)}
              </span>
            )}
          </div>
        </div>
      </SECard>
    </Link>
  );
}

/* ─── Empty state ────────────────────────────────────────────────── */

function EmptyShowsState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-se-line2 bg-se-surface/60 px-5 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-se-fresh-soft">
        <Icon className="size-5 text-se-fresh-deep" />
      </div>
      <div>
        <p className={cn(SE_H, 'text-[15px] text-se-ink')}>{title}</p>
        {description && <p className="mt-1 max-w-xs text-[13px] text-se-ink3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ─── Loading skeleton ───────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="space-y-5 pb-16 md:pb-0">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn('se-skeleton h-[88px] rounded-[18px]', i === 3 && 'col-span-2 sm:col-span-1')}
          />
        ))}
      </div>
      <div className="se-skeleton ml-auto h-[52px] w-full rounded-[13px] sm:w-40" />
      <div className="se-skeleton h-11 w-full rounded-full sm:w-64" />
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="se-skeleton h-[86px] rounded-[18px]" />
        ))}
      </div>
    </div>
  );
}
