'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, differenceInDays } from 'date-fns';
import { formatDateRange } from '@/lib/date-utils';
import {
  CalendarDays,
  MapPin,
  Building2,
  Search,
  Loader2,
  Ticket,
  ArrowRight,
  Dog,
  X,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* ─── Show type config ──────────────────────────────── */

const showTypeLabels: Record<string, string> = {
  companion: 'Companion',
  primary: 'Primary',
  limited: 'Limited',
  open: 'Open',
  premier_open: 'Premier Open',
  championship: 'Championship',
};

const showTypeMeta: Record<string, { accent: string; bg: string; ring: string }> = {
  companion:    { accent: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700', ring: 'ring-emerald-200' },
  primary:      { accent: 'bg-sky-500',     bg: 'bg-sky-50 text-sky-700',         ring: 'ring-sky-200' },
  limited:      { accent: 'bg-amber-500',   bg: 'bg-amber-50 text-amber-700',     ring: 'ring-amber-200' },
  open:         { accent: 'bg-violet-500',   bg: 'bg-violet-50 text-violet-700',   ring: 'ring-violet-200' },
  premier_open: { accent: 'bg-rose-500',     bg: 'bg-rose-50 text-rose-700',       ring: 'ring-rose-200' },
  championship: { accent: 'bg-indigo-600',   bg: 'bg-indigo-50 text-indigo-700',   ring: 'ring-indigo-200' },
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

/* ─── Closing countdown ─────────────────────────────── */

function ClosingCountdown({ date }: { date: string | Date | null }) {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  const days = differenceInDays(d, new Date());

  if (days < 0)
    return (
      <span className="text-xs font-medium text-destructive/80">Closed</span>
    );
  if (days === 0)
    return (
      <span className="animate-pulse text-xs font-semibold text-destructive">
        Closing today!
      </span>
    );
  if (days <= 7)
    return (
      <span className="text-xs font-semibold text-amber-600">
        {days}d left to enter
      </span>
    );
  return (
    <span className="text-xs text-muted-foreground">
      Closes {format(d, 'dd MMM')}
    </span>
  );
}

/* ─── Active filter pills ───────────────────────────── */

function FilterPills({
  search,
  showType,
  status,
  onClearSearch,
  onClearShowType,
  onClearStatus,
}: {
  search: string;
  showType: string;
  status: string;
  onClearSearch: () => void;
  onClearShowType: () => void;
  onClearStatus: () => void;
}) {
  const hasFilters = search || showType !== 'all' || status !== 'all';
  if (!hasFilters) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Active filters:</span>
      {search && (
        <button
          onClick={onClearSearch}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          &ldquo;{search}&rdquo;
          <X className="size-3" />
        </button>
      )}
      {showType !== 'all' && (
        <button
          onClick={onClearShowType}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          {showTypeLabels[showType]}
          <X className="size-3" />
        </button>
      )}
      {status !== 'all' && (
        <button
          onClick={onClearStatus}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          {statusLabels[status]}
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/* ─── Main component ────────────────────────────────── */

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

  /* Split into entries-open vs others for visual grouping */
  const openShows = filteredShows.filter((s) => s.status === 'entries_open');
  const otherShows = filteredShows.filter((s) => s.status !== 'entries_open');

  return (
    <>
      {/* ─── Filters ─────────────────────────────── */}
      <div className="mb-2 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search shows, venues, societies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl border-border/60 bg-white pl-10 shadow-sm transition-shadow focus-visible:shadow-md"
          />
        </div>
        <Select value={showType} onValueChange={setShowType}>
          <SelectTrigger className="h-11 w-full rounded-xl border-border/60 bg-white shadow-sm sm:w-[170px]">
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
          <SelectTrigger className="h-11 w-full rounded-xl border-border/60 bg-white shadow-sm sm:w-[170px]">
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

      <FilterPills
        search={search}
        showType={showType}
        status={status}
        onClearSearch={() => setSearch('')}
        onClearShowType={() => setShowType('all')}
        onClearStatus={() => setStatus('all')}
      />

      {/* ─── Loading ─────────────────────────────── */}
      {isLoading ? (
        <div className="flex min-h-[45vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary/40" />
            <p className="text-sm text-muted-foreground">Loading shows...</p>
          </div>
        </div>
      ) : filteredShows.length === 0 ? (
        /* ─── Empty state ──────────────────────── */
        <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 text-center">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-muted">
            <Dog className="size-10 text-muted-foreground/40" />
          </div>
          <div>
            <p className="text-lg font-semibold">No shows found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || showType !== 'all' || status !== 'all'
                ? 'Try adjusting your filters'
                : 'Check back soon for upcoming shows'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ─── Results count ───────────────────── */}
          <p className="mb-6 text-sm text-muted-foreground">
            {filteredShows.length} show{filteredShows.length !== 1 ? 's' : ''}
            {openShows.length > 0 && (
              <span className="ml-1">
                · <span className="font-medium text-emerald-600">{openShows.length} accepting entries</span>
              </span>
            )}
          </p>

          {/* ─── Entries open section ────────────── */}
          {openShows.length > 0 && (
            <div className="mb-10">
              <div className="mb-4 flex items-center gap-2">
                <div className="size-2 rounded-full bg-emerald-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/70">
                  Accepting Entries
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {openShows.map((show) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            </div>
          )}

          {/* ─── Other shows section ─────────────── */}
          {otherShows.length > 0 && (
            <div>
              {openShows.length > 0 && (
                <div className="mb-4 flex items-center gap-2">
                  <div className="size-2 rounded-full bg-muted-foreground/30" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/70">
                    Coming Soon
                  </h2>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {otherShows.map((show) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ─── Show Card ─────────────────────────────────────── */

function ShowCard({ show }: { show: {
  id: string;
  name: string;
  showType: string;
  status: string;
  startDate: string;
  endDate: string;
  entriesOpenDate: string | Date | null;
  entryCloseDate: string | Date | null;
  organisation: { name: string } | null;
  venue: { name: string } | null;
}}) {
  const meta = showTypeMeta[show.showType];
  const isOpen = show.status === 'entries_open';

  return (
    <Link href={`/shows/${show.id}`} className="group block">
      <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm transition-all duration-200 hover:border-border hover:shadow-md">
        {/* Colored top accent bar */}
        <div className={`h-1 w-full ${meta?.accent ?? 'bg-gray-300'}`} />

        <div className="flex flex-1 flex-col p-5">
          {/* Header: type badge + status */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <Badge
              variant="secondary"
              className={`text-[11px] font-semibold uppercase tracking-wide ${meta?.bg ?? ''}`}
            >
              {showTypeLabels[show.showType] ?? show.showType}
            </Badge>
            {isOpen && (
              <ClosingCountdown date={show.entryCloseDate} />
            )}
          </div>

          {/* Title */}
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary transition-colors">
            {show.name}
          </h3>

          {/* Organisation */}
          {show.organisation && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="size-3 shrink-0" />
              <span className="truncate">{show.organisation.name}</span>
            </p>
          )}

          {/* Spacer pushes date/venue to bottom */}
          <div className="mt-auto pt-4">
            <div className="space-y-1.5 border-t border-dashed border-border/60 pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0 text-muted-foreground/60" />
                <span>{formatDateRange(show.startDate, show.endDate)}</span>
              </div>
              {show.venue && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0 text-muted-foreground/60" />
                  <span className="truncate">{show.venue.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer action indicator */}
          <div className="mt-4">
            {isOpen ? (
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20">
                  <Ticket className="size-3" />
                  Enter Now
                </span>
                <ArrowRight className="size-4 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <Badge variant="outline" className="w-fit text-[11px] font-medium">
                    {statusLabels[show.status] ?? show.status}
                  </Badge>
                  {show.status === 'published' && show.entriesOpenDate && (
                    <span className="text-[11px] text-muted-foreground">
                      Entries open {format(new Date(show.entriesOpenDate), 'd MMM yyyy')}
                    </span>
                  )}
                </div>
                <ArrowRight className="size-4 text-muted-foreground/30 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
