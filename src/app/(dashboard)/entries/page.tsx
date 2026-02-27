'use client';

import Link from 'next/link';
import { format, isPast, parseISO } from 'date-fns';
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

export default function EntriesPage() {
  const { data, isLoading } = trpc.entries.list.useQuery({ limit: 50, cursor: 0 });

  const entries = data?.items ?? [];
  const upcoming = entries.filter(
    (e) => !isPast(parseISO(e.show.endDate))
  );
  const past = entries.filter((e) => isPast(parseISO(e.show.endDate)));

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
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
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My Entries</h1>
        <p className="mt-1 text-muted-foreground">
          {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'} total
          {upcoming.length > 0 && ` · ${upcoming.length} upcoming`}
        </p>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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
  const classNames = entry.entryClasses
    .map((ec) => ec.showClass?.classDefinition?.name)
    .filter(Boolean)
    .join(', ');

  return (
    <Link href={`/entries/${entry.id}`}>
      <Card className={`transition-colors hover:bg-accent/30 ${isInactive ? 'opacity-60' : ''}`}>
        <CardContent className="flex items-center gap-4 py-4">
          <div className="hidden size-12 items-center justify-center rounded-lg bg-primary/10 sm:flex">
            <CalendarDays className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{entry.show.name}</span>
              <Badge variant={status.variant} className="shrink-0">
                {status.label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
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
            {classNames && (
              <p className="truncate text-xs text-muted-foreground/70">
                {classNames}
              </p>
            )}
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}
