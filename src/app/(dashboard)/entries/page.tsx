'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, isPast, parseISO, compareAsc, compareDesc } from 'date-fns';
import {
  Ticket,
  CalendarDays,
  Dog,
  ChevronRight,
  ChevronDown,
  Loader2,
  MapPin,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { formatCurrency } from '@/lib/date-utils';
import type { RouterOutputs } from '@/server/trpc/router';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader, PageTitle, PageDescription } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending', variant: 'outline' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  withdrawn: { label: 'Withdrawn', variant: 'secondary' },
  transferred: { label: 'Transferred', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

type StatusFilter = 'all' | 'confirmed' | 'pending' | 'withdrawn';

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

type Entry = RouterOutputs['entries']['list']['items'][number];

type ShowGroup = {
  showId: string;
  showName: string;
  startDate: string;
  endDate: string;
  venue: { name: string } | null;
  entries: Entry[];
  totalFee: number;
};

function groupByShow(entries: Entry[]): ShowGroup[] {
  const map = new Map<string, ShowGroup>();
  for (const entry of entries) {
    const existing = map.get(entry.show.id);
    if (existing) {
      existing.entries.push(entry);
      existing.totalFee += entry.totalFee;
    } else {
      map.set(entry.show.id, {
        showId: entry.show.id,
        showName: entry.show.name,
        startDate: entry.show.startDate,
        endDate: entry.show.endDate,
        venue: entry.show.venue,
        entries: [entry],
        totalFee: entry.totalFee,
      });
    }
  }
  return Array.from(map.values());
}

export default function EntriesPage() {
  const { data, isLoading } = trpc.entries.list.useQuery({ limit: 100, cursor: 0 });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [collapsedPast, setCollapsedPast] = useState(true);

  const allEntries = data?.items ?? [];

  // Apply status filter
  const entries = statusFilter === 'all'
    ? allEntries
    : allEntries.filter((e) => e.status === statusFilter);

  // Group by show, then split into upcoming/past
  const grouped = useMemo(() => groupByShow(entries), [entries]);

  const upcoming = useMemo(
    () => grouped
      .filter((g) => !isPast(parseISO(g.endDate)))
      .sort((a, b) => compareAsc(parseISO(a.startDate), parseISO(b.startDate))),
    [grouped]
  );

  const past = useMemo(
    () => grouped
      .filter((g) => isPast(parseISO(g.endDate)))
      .sort((a, b) => compareDesc(parseISO(a.startDate), parseISO(b.startDate))),
    [grouped]
  );

  // Summary stats from unfiltered entries
  const confirmedCount = allEntries.filter((e) => e.status === 'confirmed').length;
  const pendingCount = allEntries.filter((e) => e.status === 'pending').length;
  const withdrawnCount = allEntries.filter((e) => e.status === 'withdrawn' || e.status === 'cancelled').length;
  const totalFees = allEntries
    .filter((e) => e.status === 'confirmed' || e.status === 'pending')
    .reduce((sum, e) => sum + e.totalFee, 0);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (allEntries.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader>
          <div>
            <PageTitle>My Entries</PageTitle>
          </div>
        </PageHeader>
        <EmptyState
          icon={Ticket}
          title="No entries yet"
          description="Browse upcoming shows and enter your dog."
          variant="card"
          action={<Button asChild className="min-h-[2.75rem]"><Link href="/browse">Find Shows</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <PageHeader>
        <div>
          <PageTitle>My Entries</PageTitle>
          <PageDescription className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-sm">
            {confirmedCount > 0 && <span className="font-medium text-emerald-600">{confirmedCount} confirmed</span>}
            {pendingCount > 0 && <span className="font-medium text-amber-600">{pendingCount} pending</span>}
            {withdrawnCount > 0 && <span>{withdrawnCount} withdrawn</span>}
            {totalFees > 0 && <span className="font-medium text-foreground">{formatCurrency(totalFees)} total</span>}
          </PageDescription>
        </div>
      </PageHeader>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((opt) => {
          const count = opt.value === 'all'
            ? allEntries.length
            : opt.value === 'withdrawn'
              ? withdrawnCount
              : allEntries.filter((e) => e.status === opt.value).length;

          if (count === 0 && opt.value !== 'all') return null;

          return (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-full px-3 py-2 min-h-[44px] text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {opt.label} ({count})
            </button>
          );
        })}
      </div>

      {entries.length === 0 && statusFilter !== 'all' && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No {statusFilter} entries found.
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="size-2 rounded-full bg-emerald-500" />
            Upcoming ({upcoming.reduce((sum, g) => sum + g.entries.length, 0)} entries)
          </h2>
          <div className="space-y-4">
            {upcoming.map((group) => (
              <ShowGroupCard key={group.showId} group={group} />
            ))}
          </div>
        </section>
      )}

      {/* Past */}
      {past.length > 0 && (
        <section>
          <button
            onClick={() => setCollapsedPast(!collapsedPast)}
            className="mb-3 flex w-full items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground min-h-[2.75rem]"
          >
            <div className="size-2 rounded-full bg-muted-foreground/30" />
            Past ({past.reduce((sum, g) => sum + g.entries.length, 0)} entries)
            <ChevronDown className={`ml-auto size-4 transition-transform ${collapsedPast ? '-rotate-90' : ''}`} />
          </button>
          {!collapsedPast && (
            <div className="space-y-4">
              {past.map((group) => (
                <ShowGroupCard key={group.showId} group={group} isPast />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ShowGroupCard({ group, isPast }: { group: ShowGroup; isPast?: boolean }) {
  return (
    <Card className={isPast ? 'opacity-70' : ''}>
      {/* Show header */}
      <div className="border-b bg-muted/30 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold sm:text-lg">{group.showName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {format(parseISO(group.startDate), 'dd MMM yyyy')}
              </span>
              {group.venue && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {group.venue.name}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold">{formatCurrency(group.totalFee)}</p>
            <p className="text-xs text-muted-foreground">
              {group.entries.length} {group.entries.length === 1 ? 'dog' : 'dogs'}
            </p>
          </div>
        </div>
      </div>

      {/* Dog entries */}
      <div className="divide-y">
        {group.entries.map((entry) => (
          <DogEntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </Card>
  );
}

function DogEntryRow({ entry }: { entry: Entry }) {
  const status = statusConfig[entry.status] ?? statusConfig.pending;
  const isInactive = entry.status === 'withdrawn' || entry.status === 'cancelled';
  const classLabels = entry.entryClasses
    .map((ec) => {
      const num = ec.showClass?.classNumber;
      const name = ec.showClass?.classDefinition?.name;
      if (!name) return null;
      return num != null ? `${num}. ${name}` : name;
    })
    .filter(Boolean);

  return (
    <Link
      href={`/entries/${entry.id}`}
      className={`flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent/30 active:bg-accent/40 sm:px-4 ${isInactive ? 'opacity-50' : ''}`}
    >
      {(entry as { dogPhotoUrl?: string | null }).dogPhotoUrl ? (
        <img src={(entry as { dogPhotoUrl?: string | null }).dogPhotoUrl!} alt="" className="size-8 shrink-0 rounded-full object-cover" />
      ) : (
        <Dog className="size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {entry.dog?.registeredName ?? 'Junior Handler'}
          </span>
          <Badge variant={status.variant} className="shrink-0 text-[10px]">
            {status.label}
          </Badge>
        </div>
        {classLabels.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {classLabels.join(' · ')}
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm font-medium">{formatCurrency(entry.totalFee)}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
