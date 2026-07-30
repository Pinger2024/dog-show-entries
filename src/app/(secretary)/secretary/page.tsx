'use client';

import Link from 'next/link';
import {
  CalendarDays,
  Ticket,
  PoundSterling,
  Plus,
  ArrowRight,
  Archive,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { effectiveShowStatus } from '@/lib/show-status';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader, PageTitle, PageDescription, PageActions } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { displayShowTitle } from '@/lib/show-types';

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  published: { label: 'Published', variant: 'outline' },
  entries_open: { label: 'Open', variant: 'default' },
  entries_closed: { label: 'Closed', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}


export default function SecretaryDashboardPage() {
  const { data, isLoading } = trpc.secretary.getDashboard.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6 pb-16 md:pb-0">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-10 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const activeShows = data?.activeShows ?? [];
  const pastShows = data?.pastShows ?? [];
  const activeShowsCount = data?.activeShowsCount ?? 0;
  const totalEntries = data?.totalEntries ?? 0;
  const activeRevenue = data?.activeRevenue ?? 0;

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      {/* Club setup prompt — shown when no shows exist yet */}
      {activeShows.length === 0 && pastShows.length === 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-3 py-6 text-center sm:flex-row sm:text-left">
            <div className="flex-1">
              <p className="font-serif text-base font-semibold">Set up your club first</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your officers, committee members, and contact details before creating your first show. This information flows into your schedule and official documents.
              </p>
            </div>
            <Button variant="outline" className="min-h-[2.75rem] shrink-0" asChild>
              <Link href="/secretary/club">
                Complete Club Profile
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <PageHeader>
        <div>
          <PageTitle>Your shows</PageTitle>
          <PageDescription>Everything you&rsquo;re running, in one place.</PageDescription>
        </div>
        <PageActions>
          <Button asChild className="rounded-full shadow-sm shadow-primary/20">
            <Link href="/secretary/shows/new">
              <Plus className="size-4" />
              Create Show
            </Link>
          </Button>
        </PageActions>
      </PageHeader>

      {/* Stats — scoped to active shows */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Active shows" value={activeShowsCount} icon={CalendarDays} />
        <StatCard label="Entries so far" value={totalEntries} icon={Ticket} />
        <StatCard
          label="Raised for clubs"
          value={formatCurrency(activeRevenue)}
          icon={PoundSterling}
          iconColor={{ bg: 'bg-emerald-100 dark:bg-emerald-900/30', fg: 'text-emerald-600 dark:text-emerald-400' }}
        />
      </div>

      {/* Shows list with tabs */}
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active" className="text-xs sm:text-sm">
            Active Shows
            {activeShows.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeShows.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="past" className="text-xs sm:text-sm">
            Past & Cancelled
            {pastShows.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pastShows.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <ShowList shows={activeShows} emptyMessage="No active shows" />
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          {pastShows.length === 0 ? (
            <EmptyState icon={Archive} title="No past shows" description="Completed and cancelled shows will appear here." />
          ) : (
            <ShowList shows={pastShows} emptyMessage="No past shows" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ShowList({
  shows,
  emptyMessage,
}: {
  shows: Array<{
    id: string;
    name: string;
    status: string;
    startDate: string;
    entryCloseDate?: Date | string | null;
    organisation?: { name: string } | null;
    venue?: { name: string } | null;
    entryCount?: number;
    showRevenue?: number;
  }>;
  emptyMessage: string;
}) {
  if (shows.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={emptyMessage}
        description="Create your first show to start accepting entries."
        action={
          <Button size="sm" asChild>
            <Link href="/secretary/shows/new">
              Create Show
              <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {shows.map((show) => {
        // Derive the badge from the close date so a show whose entries have
        // closed reads "Closed" instantly, without waiting on the daily cron.
        const displayStatus = effectiveShowStatus(show.status, show.entryCloseDate);
        const status = statusConfig[displayStatus] ?? {
          label: displayStatus,
          variant: 'outline' as const,
        };
        const entryCount = show.entryCount ?? 0;
        const revenue = show.showRevenue ?? 0;

        return (
          <Link
            key={show.id}
            href={`/secretary/shows/${show.slug ?? show.id}`}
            className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-[0_18px_36px_-28px_rgba(20,60,40,0.5)] sm:p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-serif text-base font-semibold">{displayShowTitle(show.name, show.organisation?.name)}</p>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                <span>{formatDate(show.startDate)}</span>
                {show.organisation && (
                  <>
                    <span>&middot;</span>
                    <span className="truncate">
                      {show.organisation.name}
                    </span>
                  </>
                )}
                {show.venue && (
                  <>
                    <span>&middot;</span>
                    <span className="truncate">{show.venue.name}</span>
                  </>
                )}
              </div>
              {entryCount > 0 && (
                <div className="mt-1.5 flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    <Ticket className="size-3" />
                    {entryCount} entr{entryCount !== 1 ? 'ies' : 'y'}
                  </span>
                  {revenue > 0 && (
                    <span className="font-medium text-emerald-600">
                      {formatCurrency(revenue)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <ArrowRight className="ml-4 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        );
      })}
    </div>
  );
}
