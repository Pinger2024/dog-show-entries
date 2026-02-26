'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO, differenceInDays } from 'date-fns';
import {
  CalendarDays,
  MapPin,
  Building2,
  Search,
  Loader2,
  Ticket,
  Filter,
  Dog,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const showTypeLabels: Record<string, string> = {
  companion: 'Companion',
  primary: 'Primary',
  limited: 'Limited',
  open: 'Open',
  premier_open: 'Premier Open',
  championship: 'Championship',
};

const showTypeColors: Record<string, string> = {
  companion: 'bg-emerald-100 text-emerald-800',
  primary: 'bg-sky-100 text-sky-800',
  limited: 'bg-amber-100 text-amber-800',
  open: 'bg-violet-100 text-violet-800',
  premier_open: 'bg-rose-100 text-rose-800',
  championship: 'bg-indigo-100 text-indigo-800',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  entries_open: 'Entries Open',
  entries_closed: 'Entries Closed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function ClosingCountdown({ date }: { date: string | Date | null }) {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  const days = differenceInDays(d, new Date());
  if (days < 0) return <span className="text-xs text-destructive">Closed</span>;
  if (days === 0)
    return (
      <span className="text-xs font-medium text-destructive">
        Closing today!
      </span>
    );
  if (days <= 7)
    return (
      <span className="text-xs font-medium text-amber-600">
        {days} day{days !== 1 ? 's' : ''} left
      </span>
    );
  return (
    <span className="text-xs text-muted-foreground">
      Closes {format(d, 'dd MMM')}
    </span>
  );
}

export default function ShowsList() {
  const [search, setSearch] = useState('');
  const [showType, setShowType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');

  const { data, isLoading } = trpc.shows.list.useQuery({
    showType:
      showType !== 'all'
        ? (showType as
            | 'companion'
            | 'primary'
            | 'limited'
            | 'open'
            | 'premier_open'
            | 'championship')
        : undefined,
    status:
      status !== 'all'
        ? (status as
            | 'draft'
            | 'published'
            | 'entries_open'
            | 'entries_closed'
            | 'in_progress'
            | 'completed'
            | 'cancelled')
        : undefined,
    limit: 50,
  });

  const shows = data?.items ?? [];

  const filteredShows = search
    ? shows.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.organisation?.name?.toLowerCase().includes(search.toLowerCase()) ||
          s.venue?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : shows;

  return (
    <>
      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search shows, venues, societies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={showType} onValueChange={setShowType}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="mr-2 size-4" />
            <SelectValue placeholder="Show Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(showTypeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(statusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredShows.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <Dog className="size-12 text-muted-foreground/50" />
          <div>
            <p className="text-lg font-medium">No shows found</p>
            <p className="text-sm text-muted-foreground">
              {search || showType !== 'all' || status !== 'all'
                ? 'Try adjusting your filters'
                : 'Check back soon for upcoming shows'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {filteredShows.length} show{filteredShows.length !== 1 ? 's' : ''}{' '}
            found
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredShows.map((show) => {
              const isOpen = show.status === 'entries_open';
              return (
                <Link key={show.id} href={`/shows/${show.id}`}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold leading-tight">
                            {show.name}
                          </h3>
                          {show.organisation && (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              <Building2 className="mr-1 inline size-3" />
                              {show.organisation.name}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="secondary"
                          className={`shrink-0 text-xs ${showTypeColors[show.showType] ?? ''}`}
                        >
                          {showTypeLabels[show.showType] ?? show.showType}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pb-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="size-4 shrink-0" />
                        <span>
                          {format(parseISO(show.startDate), 'dd MMM yyyy')}
                          {show.startDate !== show.endDate &&
                            ` – ${format(parseISO(show.endDate), 'dd MMM')}`}
                        </span>
                      </div>
                      {show.venue && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="size-4 shrink-0" />
                          <span className="truncate">{show.venue.name}</span>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="flex items-center justify-between border-t pt-3">
                      {isOpen ? (
                        <>
                          <Badge
                            variant="default"
                            className="bg-emerald-600 text-xs"
                          >
                            <Ticket className="mr-1 size-3" />
                            Entries Open
                          </Badge>
                          <ClosingCountdown date={show.entryCloseDate} />
                        </>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {statusLabels[show.status] ?? show.status}
                        </Badge>
                      )}
                    </CardFooter>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
