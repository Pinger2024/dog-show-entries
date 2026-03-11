'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  CalendarDays,
  Ticket,
  PoundSterling,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  UserPlus,
  MessageSquare,
  CheckCircle,
  Clock,
  Timer,
  ChevronRight,
  ClipboardCheck,
  AlertCircle,
  Dog,
  Building2,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { formatCurrency } from '@/lib/date-utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ── Helpers ──────────────────────────────────────────────────────

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function fillChartDays(
  sparse: { date: string; count?: number; amount?: number }[],
  key: 'count' | 'amount',
  days = 30
): { date: string; value: number }[] {
  const map = new Map(sparse.map((d) => [d.date, d[key] ?? 0]));
  const result: { date: string; value: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    result.push({ date: dateKey, value: map.get(dateKey) ?? 0 });
  }
  return result;
}

// ── Config ───────────────────────────────────────────────────────

const ACTIVITY_CONFIG = {
  entry: { icon: Ticket, bg: 'bg-primary/10', color: 'text-primary' },
  signup: { icon: UserPlus, bg: 'bg-blue-100', color: 'text-blue-600' },
  payment: { icon: PoundSterling, bg: 'bg-emerald-100', color: 'text-emerald-600' },
  feedback: { icon: MessageSquare, bg: 'bg-amber-100', color: 'text-amber-600' },
} as const;

const PIPELINE_STAGES = [
  { key: 'draft', label: 'Draft', bar: 'bg-gray-300' },
  { key: 'published', label: 'Published', bar: 'bg-blue-400' },
  { key: 'entries_open', label: 'Open', bar: 'bg-emerald-400' },
  { key: 'entries_closed', label: 'Closed', bar: 'bg-amber-400' },
  { key: 'in_progress', label: 'Live', bar: 'bg-primary' },
  { key: 'completed', label: 'Done', bar: 'bg-gray-400' },
  { key: 'cancelled', label: 'Cancelled', bar: 'bg-red-400' },
];

// ── Reusable sub-components ──────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  formatValue: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-popover-foreground">
      <p className="text-xs text-muted-foreground">
        {formatChartDate(label ?? '')}
      </p>
      <p className="text-sm font-semibold">{formatValue(payload[0].value)}</p>
    </div>
  );
}

function MetricChart({
  title,
  description,
  data,
  color,
  gradientId,
  yFormatter,
  yWidth,
  tooltipFormatter,
}: {
  title: string;
  description: string;
  data: { date: string; value: number }[];
  color: string;
  gradientId: string;
  yFormatter?: (v: number) => string;
  yWidth?: number;
  tooltipFormatter: (v: number) => string;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={yFormatter}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={yWidth ?? 30}
                allowDecimals={false}
              />
              <Tooltip
                content={
                  <ChartTooltip formatValue={tooltipFormatter} />
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fill={`url(#${gradientId})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaBadge({
  delta,
}: {
  delta: { label: string; positive: boolean } | null;
}) {
  if (!delta) {
    return <p className="text-xs text-muted-foreground mt-1">this month</p>;
  }
  return (
    <p
      className={cn(
        'text-xs font-medium mt-1 flex items-center gap-0.5',
        delta.positive ? 'text-emerald-600' : 'text-red-500'
      )}
    >
      {delta.positive ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {delta.label} vs last month
    </p>
  );
}

// ── Main component ───────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { data: session } = useSession();
  const { data, isLoading } = trpc.adminDashboard.getDashboard.useQuery();

  // Admin-only guard
  if (
    session?.user &&
    (session.user as Record<string, unknown>).role !== 'admin'
  ) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return <DashboardSkeleton />;
  }

  const { stats, attention, activity, showPipeline, charts } = data;
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';
  const totalPending = stats.pendingFeedback + stats.pendingApplications;

  const entryChartData = useMemo(
    () => fillChartDays(charts.dailyEntries, 'count'),
    [charts.dailyEntries]
  );
  const revenueChartData = useMemo(
    () => fillChartDays(charts.dailyRevenue, 'amount'),
    [charts.dailyRevenue]
  );

  const hasAttention =
    attention.failedPayments.length > 0 ||
    attention.agingFeedback.length > 0 ||
    attention.showsClosingSoon.length > 0 ||
    attention.pendingApplications.length > 0;

  return (
    <div className="space-y-6 sm:space-y-8 pb-16 md:pb-0">
      {/* ── Header ────────────────────────────────────────────── */}
      <div>
        <h1 className="font-serif text-lg sm:text-xl lg:text-2xl font-bold tracking-tight">
          {getGreeting()}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening across Remi today.
        </p>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Users */}
        <Card className="transition-all hover:shadow-md hover:shadow-primary/5">
          <CardHeader className="flex-row items-center justify-between pb-2 p-3 sm:p-4">
            <CardDescription className="text-xs sm:text-sm font-medium">
              Users
            </CardDescription>
            <div className="flex size-8 sm:size-9 items-center justify-center rounded-lg bg-blue-100">
              <Users className="size-4 sm:size-4.5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 pt-0">
            <p className="text-2xl sm:text-3xl font-bold">
              {stats.totalUsers.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.newUsersThisWeek > 0
                ? `+${stats.newUsersThisWeek} this week`
                : 'No new signups this week'}
            </p>
          </CardContent>
        </Card>

        {/* Active Shows */}
        <Card className="transition-all hover:shadow-md hover:shadow-primary/5">
          <CardHeader className="flex-row items-center justify-between pb-2 p-3 sm:p-4">
            <CardDescription className="text-xs sm:text-sm font-medium">
              Active Shows
            </CardDescription>
            <div className="flex size-8 sm:size-9 items-center justify-center rounded-lg bg-primary/10">
              <CalendarDays className="size-4 sm:size-4.5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 pt-0">
            <p className="text-2xl sm:text-3xl font-bold">
              {stats.activeShows}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              of {stats.totalShows} total
            </p>
          </CardContent>
        </Card>

        {/* Entries This Month */}
        <Card className="transition-all hover:shadow-md hover:shadow-primary/5">
          <CardHeader className="flex-row items-center justify-between pb-2 p-3 sm:p-4">
            <CardDescription className="text-xs sm:text-sm font-medium">
              Entries
            </CardDescription>
            <div className="flex size-8 sm:size-9 items-center justify-center rounded-lg bg-primary/10">
              <Ticket className="size-4 sm:size-4.5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 pt-0">
            <p className="text-2xl sm:text-3xl font-bold">
              {stats.entriesThisMonth.toLocaleString()}
            </p>
            <DeltaBadge delta={stats.entryDelta} />
          </CardContent>
        </Card>

        {/* Revenue This Month */}
        <Card className="transition-all hover:shadow-md hover:shadow-primary/5">
          <CardHeader className="flex-row items-center justify-between pb-2 p-3 sm:p-4">
            <CardDescription className="text-xs sm:text-sm font-medium">
              Revenue
            </CardDescription>
            <div className="flex size-8 sm:size-9 items-center justify-center rounded-lg bg-emerald-100">
              <PoundSterling className="size-4 sm:size-4.5 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 pt-0">
            <p className="text-2xl sm:text-3xl font-bold">
              {formatCurrency(stats.revenueThisMonth)}
            </p>
            <DeltaBadge delta={stats.revenueDelta} />
          </CardContent>
        </Card>

        {/* Pending Actions */}
        <Card
          className={cn(
            'transition-all hover:shadow-md',
            totalPending > 0
              ? 'border-amber-200 hover:shadow-amber-100'
              : 'hover:shadow-primary/5'
          )}
        >
          <CardHeader className="flex-row items-center justify-between pb-2 p-3 sm:p-4">
            <CardDescription className="text-xs sm:text-sm font-medium">
              Pending
            </CardDescription>
            <div
              className={cn(
                'flex size-8 sm:size-9 items-center justify-center rounded-lg',
                totalPending > 0 ? 'bg-amber-100' : 'bg-emerald-100'
              )}
            >
              {totalPending > 0 ? (
                <AlertCircle className="size-4 sm:size-4.5 text-amber-600" />
              ) : (
                <CheckCircle className="size-4 sm:size-4.5 text-emerald-600" />
              )}
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 pt-0">
            <p className="text-2xl sm:text-3xl font-bold">{totalPending}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {totalPending === 0 ? 'All clear' : 'need attention'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Secondary stats row ───────────────────────────────── */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <PoundSterling className="size-3.5" />
          {formatCurrency(stats.totalRevenue)} lifetime revenue
        </span>
        <span className="flex items-center gap-1.5">
          <Dog className="size-3.5" />
          {stats.totalDogs.toLocaleString()} registered dogs
        </span>
        <span className="flex items-center gap-1.5">
          <Building2 className="size-3.5" />
          {stats.totalOrganisations} organisations
        </span>
      </div>

      {/* ── Attention Required ─────────────────────────────────── */}
      {hasAttention && (
        <Card className="border-amber-200/60 bg-amber-50/30">
          <CardHeader className="pb-3 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              <CardTitle className="text-base font-semibold">
                Needs Your Attention
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-1">
            {attention.failedPayments.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm"
              >
                <AlertCircle className="size-4 text-red-500 shrink-0" />
                <span className="flex-1 min-w-0 truncate">
                  Payment of {formatCurrency(p.amount ?? 0)} failed for{' '}
                  {p.exhibitorName ?? 'unknown'} ({p.showName})
                </span>
              </div>
            ))}

            {attention.agingFeedback.length > 0 && (
              <Link
                href="/feedback"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-amber-100/50 transition-colors group"
              >
                <Clock className="size-4 text-amber-500 shrink-0" />
                <span className="flex-1">
                  {attention.agingFeedback.length} feedback{' '}
                  {attention.agingFeedback.length === 1 ? 'item' : 'items'}{' '}
                  waiting more than 3 days
                </span>
                <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}

            {attention.showsClosingSoon.map((s) => {
              const daysLeft = Math.ceil(
                (new Date(s.entryCloseDate!).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24)
              );
              return (
                <Link
                  key={s.id}
                  href={`/secretary/shows/${s.slug ?? s.id}`}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-amber-100/50 transition-colors group"
                >
                  <Timer className="size-4 text-blue-500 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">
                    {s.name} closes in {daysLeft} day
                    {daysLeft !== 1 ? 's' : ''} ({s.entryCount} entries)
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              );
            })}

            {attention.pendingApplications.length > 0 && (
              <Link
                href="/admin/applications"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-amber-100/50 transition-colors group"
              >
                <ClipboardCheck className="size-4 text-purple-500 shrink-0" />
                <span className="flex-1">
                  {attention.pendingApplications.length} pending secretary{' '}
                  {attention.pendingApplications.length === 1
                    ? 'application'
                    : 'applications'}
                </span>
                <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Charts + Activity Feed (two-column) ───────────────── */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Charts column */}
        <div className="lg:col-span-3 space-y-6">
          <MetricChart
            title="Entry Volume"
            description="Last 30 days"
            data={entryChartData}
            color="hsl(142, 40%, 28%)"
            gradientId="entryGradient"
            tooltipFormatter={(v) =>
              `${v} ${v === 1 ? 'entry' : 'entries'}`
            }
          />
          <MetricChart
            title="Revenue"
            description="Last 30 days"
            data={revenueChartData}
            color="#10b981"
            gradientId="revenueGradient"
            yFormatter={(v) => (v === 0 ? '£0' : `£${Math.round(v / 100)}`)}
            yWidth={45}
            tooltipFormatter={formatCurrency}
          />
        </div>

        {/* Activity feed column */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base font-semibold">
              Recent Activity
            </CardTitle>
            <CardDescription className="text-xs">
              Latest events across the platform
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
                  <Ticket className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No activity yet
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {activity.map((item, i) => {
                  const config = ACTIVITY_CONFIG[item.type];
                  return (
                    <div
                      key={`${item.type}-${i}`}
                      className="flex items-start gap-3 py-3 first:pt-1"
                    >
                      <div
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full mt-0.5',
                          config.bg
                        )}
                      >
                        <config.icon
                          className={cn('size-4', config.color)}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">
                        {timeAgo(item.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Show Pipeline ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold">
            Show Pipeline
          </CardTitle>
          <CardDescription className="text-xs">
            All shows by status
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3">
            {PIPELINE_STAGES.map((stage) => {
              const count = showPipeline[stage.key] ?? 0;
              return (
                <div
                  key={stage.key}
                  className="rounded-lg border text-center p-3 sm:p-4"
                >
                  <div
                    className={cn(
                      'mx-auto mb-2 h-1.5 w-8 rounded-full',
                      stage.bar
                    )}
                  />
                  <p className="text-xl sm:text-2xl font-bold">{count}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                    {stage.label}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 pb-16 md:pb-0">
      <div>
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-5 w-80 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-4">
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-8 w-20 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-4 w-32 animate-pulse rounded bg-muted mb-4" />
                <div className="h-[200px] animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-4">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="size-8 rounded-full animate-pulse bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="h-4 w-32 animate-pulse rounded bg-muted mb-4" />
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border text-center p-3 sm:p-4"
              >
                <div className="mx-auto mb-2 h-1.5 w-8 animate-pulse rounded-full bg-muted" />
                <div className="h-7 w-8 mx-auto animate-pulse rounded bg-muted" />
                <div className="mt-1 h-3 w-10 mx-auto animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
