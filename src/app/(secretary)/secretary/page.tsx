'use client';

import Link from 'next/link';
import {
  CalendarDays,
  Ticket,
  PoundSterling,
  Plus,
  ArrowRight,
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

  const totalShows = data?.totalShows ?? 0;
  const totalEntries = data?.totalEntries ?? 0;
  const totalRevenue = data?.totalRevenue ?? 0;
  const shows = data?.shows ?? [];

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
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

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Total Shows
            </CardDescription>
            <CalendarDays className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalShows}</p>
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
            <p className="text-3xl font-bold">{totalEntries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Revenue
            </CardDescription>
            <PoundSterling className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Shows list */}
      <Card>
        <CardHeader>
          <CardTitle>Your Shows</CardTitle>
          <CardDescription>
            All shows across your organisations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <CalendarDays className="size-6 text-primary" />
              </div>
              <h3 className="font-semibold">No shows yet</h3>
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
          ) : (
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
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
