'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  CalendarDays,
  Building2,
  Ticket,
  PoundSterling,
  Search,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { formatCurrency } from '@/lib/date-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader, PageTitle, PageDescription } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-se-paper2 text-se-ink3' },
  published: { label: 'Published', className: 'bg-blue-100 text-blue-700' },
  entries_open: { label: 'Entries open', className: 'bg-se-fresh-soft text-se-fresh-deep' },
  entries_closed: { label: 'Entries closed', className: 'bg-se-honey-soft text-se-honey-deep' },
  in_progress: { label: 'Live', className: 'bg-primary/15 text-primary' },
  completed: { label: 'Completed', className: 'bg-se-paper2 text-se-ink3' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Active' },
  { key: 'entries_open', label: 'Open' },
  { key: 'entries_closed', label: 'Closed' },
  { key: 'completed', label: 'Completed' },
  { key: 'draft', label: 'Draft' },
];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminShowsPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const { data: allShows, isLoading } = trpc.admin.listAllShows.useQuery(undefined, {
    enabled: session?.user?.role === 'admin',
  });

  const filtered = useMemo(() => {
    if (!allShows) return [];
    const q = search.trim().toLowerCase();
    return allShows.filter((s) => {
      if (filter === 'live' && ['completed', 'cancelled', 'draft'].includes(s.status)) return false;
      if (filter !== 'all' && filter !== 'live' && s.status !== filter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.organisationName.toLowerCase().includes(q)
      );
    });
  }, [allShows, search, filter]);

  const totals = useMemo(() => {
    const src = allShows ?? [];
    return {
      shows: src.length,
      entries: src.reduce((a, s) => a + s.confirmedEntries, 0),
      collected: src.reduce((a, s) => a + s.collectedPence, 0),
      income: src.reduce((a, s) => a + s.platformFeePence, 0),
    };
  }, [allShows]);

  if (session && session.user?.role !== 'admin') {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-muted-foreground">
        This page is for platform owners only.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageTitle>All Shows</PageTitle>
        <PageDescription>
          Every show on the platform — including clubs you&apos;re not a member of. Tap any show to open it.
        </PageDescription>
      </PageHeader>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by show or club…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'min-h-[2.25rem] rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                filter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Shows" value={totals.shows} icon={CalendarDays} />
        <StatCard label="Paid entries" value={totals.entries} icon={Ticket} />
        <StatCard
          label="Collected for clubs"
          value={formatCurrency(totals.collected)}
          icon={PoundSterling}
        />
        <StatCard
          label="Our booking-fee income"
          value={formatCurrency(totals.income)}
          icon={TrendingUp}
          iconColor={{ bg: 'bg-se-fresh-soft', fg: 'text-se-fresh-deep' }}
        />
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading shows…</p>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No shows match.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => {
            const meta = STATUS_META[s.status] ?? {
              label: s.status,
              className: 'bg-muted text-foreground',
            };
            const cats = s.printedCatalogues + s.onlineCatalogues;
            return (
              <Link key={s.id} href={`/secretary/shows/${s.id}`} className="group block">
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 font-semibold leading-snug text-foreground">
                        {s.name}
                      </h3>
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="size-3.5 shrink-0" />
                      <span className="truncate">{s.organisationName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn('font-medium', meta.className)} variant="secondary">
                        {meta.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{fmtDate(s.startDate)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 border-t pt-3 text-sm">
                      <Stat label="Entries" value={s.confirmedEntries} />
                      <Stat label="Catalogues" value={cats} />
                      <Stat label="Collected" value={formatCurrency(s.collectedPence)} />
                      <Stat label="Our income" value={formatCurrency(s.platformFeePence)} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-semibold tabular-nums">{value}</p>
    </div>
  );
}
