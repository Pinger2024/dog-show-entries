'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, isPast, parseISO, compareAsc, compareDesc } from 'date-fns';
import { Ticket, CalendarDays, Dog, ChevronRight, Loader2, MapPin } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/server/trpc/router';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function formatFee(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending Payment', variant: 'outline' },
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

export default function EntriesPage() {
  const { data, isLoading } = trpc.entries.list.useQuery({ limit: 100, cursor: 0 });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const allEntries = data?.items ?? [];

  // Apply status filter
  const entries = statusFilter === 'all'
    ? allEntries
    : allEntries.filter((e) => e.status === statusFilter);

  // Split and sort: upcoming by soonest first, past by most recent first
  const upcoming = entries
    .filter((e) => !isPast(parseISO(e.show.endDate)))
    .sort((a, b) => compareAsc(parseISO(a.show.startDate), parseISO(b.show.startDate)));
  const past = entries
    .filter((e) => isPast(parseISO(e.show.endDate)))
    .sort((a, b) => compareDesc(parseISO(a.show.startDate), parseISO(b.show.startDate)));

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
        <h1 className="text-2xl font-bold">My Entries</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <Ticket className="mx-auto mb-3 size-10 text-muted-foreground" />
            <h2 className="font-semibold">No entries yet</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Browse upcoming shows and enter your dog.
            </p>
            <Button asChild>
              <Link href="/shows">Find Shows</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">My Entries</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {confirmedCount > 0 && <span className="font-medium text-emerald-600">{confirmedCount} confirmed</span>}
          {confirmedCount > 0 && pendingCount > 0 && ' · '}
          {pendingCount > 0 && <span className="font-medium text-amber-600">{pendingCount} pending</span>}
          {(confirmedCount > 0 || pendingCount > 0) && withdrawnCount > 0 && ' · '}
          {withdrawnCount > 0 && <span>{withdrawnCount} withdrawn</span>}
          {totalFees > 0 && <span className="ml-1"> · {formatFee(totalFees)} total</span>}
        </p>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2">
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
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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
            Upcoming
          </h2>
          <div className="space-y-3">
            {upcoming.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      )}

      {/* Past */}
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="size-2 rounded-full bg-muted-foreground/30" />
            Past
          </h2>
          <div className="space-y-3">
            {past.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EntryCard({ entry }: { entry: RouterOutputs['entries']['list']['items'][number] }) {
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
    <Link href={`/entries/${entry.id}`}>
      <Card className={`transition-colors hover:bg-accent/30 active:bg-accent/40 ${isInactive ? 'opacity-60' : ''}`}>
        <CardContent className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4 lg:px-6">
          <div className="hidden size-12 items-center justify-center rounded-lg bg-primary/10 sm:flex">
            <CalendarDays className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium sm:text-base">{entry.show.name}</span>
              <Badge variant={status.variant} className="shrink-0">
                {status.label}
              </Badge>
            </div>
            <div className="flex flex-col gap-0.5 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
              <span className="flex items-center gap-1">
                <Dog className="size-3.5" />
                {entry.dog?.registeredName ?? 'Junior Handler'}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {format(parseISO(entry.show.startDate), 'dd MMM yyyy')}
              </span>
              {entry.show.venue && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {entry.show.venue.name}
                </span>
              )}
              <span className="font-medium text-foreground">
                {formatFee(entry.totalFee)}
              </span>
            </div>
            {classLabels.length > 0 && (
              <p className="text-xs text-muted-foreground/70">
                {classLabels.join(' · ')}
              </p>
            )}
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}
