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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

function formatCurrency(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
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
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl lg:text-3xl">
            Secretary Dashboard
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage your shows, entries, and organisation details.
          </p>
        </div>
        <Button asChild>
          <Link href="/secretary/shows/new">
            <Plus className="size-4" />
            Create Show
          </Link>
        </Button>
      </div>

      {/* Stats — scoped to active shows */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Active Shows
            </CardDescription>
            <CalendarDays className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold sm:text-3xl">{activeShowsCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Total Entries
            </CardDescription>
            <Ticket className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold sm:text-3xl">{totalEntries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Active Revenue
            </CardDescription>
            <PoundSterling className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold sm:text-3xl">{formatCurrency(activeRevenue)}</p>
          </CardContent>
        </Card>
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

        <TabsContent value="active">
          <Card>
            <CardHeader>
              <CardTitle>Active Shows</CardTitle>
              <CardDescription>
                Shows that are in progress, accepting entries, or being prepared
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ShowList shows={activeShows} emptyMessage="No active shows" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="past">
          <Card>
            <CardHeader>
              <CardTitle>Past & Cancelled Shows</CardTitle>
              <CardDescription>
                Completed and cancelled shows
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pastShows.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                  <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                    <Archive className="size-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold">No past shows</h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Completed and cancelled shows will appear here.
                  </p>
                </div>
              ) : (
                <ShowList shows={pastShows} emptyMessage="No past shows" />
              )}
            </CardContent>
          </Card>
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
    organisation?: { name: string } | null;
    venue?: { name: string } | null;
  }>;
  emptyMessage: string;
}) {
  if (shows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <CalendarDays className="size-6 text-primary" />
        </div>
        <h3 className="font-semibold">{emptyMessage}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Create your first show to start accepting entries.
        </p>
        <Button className="mt-4" size="sm" asChild>
          <Link href="/secretary/shows/new">
            Create Show
            <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {shows.map((show) => {
        const status = statusConfig[show.status] ?? {
          label: show.status,
          variant: 'outline' as const,
        };
        return (
          <Link
            key={show.id}
            href={`/secretary/shows/${show.id}`}
            className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{show.name}</p>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
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
            </div>
            <ArrowRight className="ml-4 size-4 shrink-0 text-muted-foreground" />
          </Link>
        );
      })}
    </div>
  );
}
