'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { format, parseISO } from 'date-fns';
import {
  Dog,
  Ticket,
  CalendarDays,
  Plus,
  ArrowRight,
  Loader2,
  MapPin,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc/client';

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  withdrawn: 'bg-gray-100 text-gray-600',
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

  const { data: dogsList, isLoading: dogsLoading } = trpc.dogs.list.useQuery();
  const { data: entriesData, isLoading: entriesLoading } =
    trpc.entries.list.useQuery({ limit: 50, cursor: 0 });
  const { data: upcomingData, isLoading: showsLoading } =
    trpc.shows.upcoming.useQuery({ limit: 5 });

  const dogCount = dogsList?.length ?? 0;
  const entryCount = entriesData?.total ?? 0;
  const upcomingCount = upcomingData?.total ?? 0;

  const isLoading = dogsLoading || entriesLoading || showsLoading;

  const stats = [
    { label: 'My Dogs', value: dogCount, icon: Dog, href: '/dogs' },
    {
      label: 'Upcoming Shows',
      value: upcomingCount,
      icon: CalendarDays,
      href: '/shows',
    },
    { label: 'My Entries', value: entryCount, icon: Ticket, href: '/entries' },
  ];

  // Get upcoming entries (entries for shows that haven't happened yet)
  const upcomingEntries = (entriesData?.items ?? []).filter(
    (entry) =>
      entry.status !== 'withdrawn' &&
      entry.status !== 'cancelled' &&
      entry.show &&
      new Date(entry.show.startDate) >= new Date()
  );

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      {/* Welcome */}
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Here&apos;s what&apos;s happening with your shows and dogs.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-all hover:border-primary/20 hover:shadow-md hover:shadow-primary/5">
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardDescription className="text-[0.9375rem] font-medium">
                  {stat.label}
                </CardDescription>
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="size-4.5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                ) : (
                  <p className="text-3xl font-bold">{stat.value}</p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button className="h-12 px-6 text-[0.9375rem]" asChild>
          <Link href="/shows">
            <Plus className="size-4" />
            Enter a Show
          </Link>
        </Button>
        <Button variant="outline" className="h-12 px-6 text-[0.9375rem]" asChild>
          <Link href="/dogs/new">
            <Plus className="size-4" />
            Add a Dog
          </Link>
        </Button>
      </div>

      {/* Upcoming entries */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Upcoming Entries</CardTitle>
          <CardDescription>
            Your confirmed entries for upcoming shows
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entriesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : upcomingEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-14 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
                <Ticket className="size-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No upcoming entries</h3>
              <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
                You haven&apos;t entered any upcoming shows yet. Browse
                available shows to find your next ring.
              </p>
              <Button className="mt-5 h-11 px-6" asChild>
                <Link href="/shows">
                  Find a Show
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingEntries.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/entries/${entry.id}`}
                  className="block rounded-lg border p-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{entry.show.name}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="size-4" />
                          {format(
                            parseISO(entry.show.startDate),
                            'd MMM yyyy'
                          )}
                        </span>
                        {entry.show.venue && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-4" />
                            {entry.show.venue.name}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[0.9375rem]">
                        <Dog className="size-4 text-muted-foreground" />
                        <span>{entry.dog?.registeredName ?? 'Junior Handler'}</span>
                        <span className="text-muted-foreground">&middot;</span>
                        <span className="text-muted-foreground">
                          {entry.entryClasses.length} class
                          {entry.entryClasses.length !== 1 ? 'es' : ''}
                        </span>
                      </div>
                    </div>
                    <Badge
                      className={
                        statusColors[entry.status] ?? 'bg-gray-100 text-gray-600'
                      }
                    >
                      {entry.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming shows */}
      {upcomingData && upcomingData.items.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-serif text-xl">Shows Coming Up</CardTitle>
                <CardDescription>
                  Browse and enter upcoming shows
                </CardDescription>
              </div>
              <Button variant="outline" className="h-10" asChild>
                <Link href="/shows">
                  View All
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingData.items.map((show) => (
                <Link
                  key={show.id}
                  href={`/shows/${show.id}`}
                  className="block rounded-lg border p-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{show.name}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="size-4" />
                          {format(parseISO(show.startDate), 'd MMM yyyy')}
                        </span>
                        {show.venue && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-4" />
                            {show.venue.name}
                          </span>
                        )}
                        {(show as typeof show & { startTime?: string | null })
                          .startTime && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="size-4" />
                            {
                              (
                                show as typeof show & {
                                  startTime?: string | null;
                                }
                              ).startTime
                            }
                          </span>
                        )}
                      </div>
                    </div>
                    {show.status === 'entries_open' && (
                      <Badge className="bg-primary text-xs shrink-0">
                        <Ticket className="mr-1 size-3" />
                        Open for Entry
                      </Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
