'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { CalendarDays, MapPin, Eye, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const statusConfig: Record<string, { label: string; className: string }> = {
  entries_closed: { label: 'Entries Closed', className: 'bg-amber-100 text-amber-800' },
  in_progress: { label: 'Live', className: 'bg-green-100 text-green-800' },
  completed: { label: 'Completed', className: 'bg-gray-100 text-gray-800' },
};

export default function StewardDashboard() {
  const { data: shows, isLoading } = trpc.steward.getMyShows.useQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!shows || shows.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 sm:gap-3 text-center px-3 sm:px-4">
        <Eye className="size-10 sm:size-12 text-muted-foreground/40" />
        <h2 className="font-serif text-lg sm:text-xl font-semibold">No Shows Assigned</h2>
        <p className="max-w-sm text-xs sm:text-sm text-muted-foreground">
          You haven&apos;t been assigned as a steward for any shows yet. A show
          secretary will assign you when needed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-lg sm:text-xl lg:text-2xl font-bold tracking-tight">
        My Shows
      </h1>
      <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
        Shows you&apos;re assigned to steward
      </p>

      <div className="mt-4 sm:mt-6 space-y-2 sm:space-y-3">
        {shows.map((show) => {
          const status = statusConfig[show.status];
          return (
            <Link key={show.id} href={`/steward/shows/${show.id}`}>
              <Card className="transition-colors hover:bg-muted/30">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm sm:text-base font-semibold">{show.name}</h3>
                      <div className="mt-1 sm:mt-1.5 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="size-3 sm:size-3.5" />
                          {format(parseISO(show.startDate), 'd MMM yyyy')}
                        </span>
                        {show.venue && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3 sm:size-3.5" />
                            {show.venue.name}
                          </span>
                        )}
                      </div>
                      {show.ring && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Ring {show.ring.number}
                        </p>
                      )}
                    </div>
                    {status && (
                      <Badge
                        variant="secondary"
                        className={`text-xs shrink-0 ${status.className}`}
                      >
                        {status.label}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
