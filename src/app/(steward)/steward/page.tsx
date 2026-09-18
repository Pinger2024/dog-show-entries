'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { CalendarDays, MapPin, Eye, Loader2, ChevronRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SE_H } from '@/components/show-experience/tokens';

const statusConfig: Record<string, { label: string; className: string }> = {
  entries_closed: { label: 'Entries Closed', className: 'bg-se-honey-soft text-se-honey-deep' },
  in_progress: { label: 'Live', className: 'bg-se-fresh-soft text-se-fresh-deep' },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground' },
};

export default function StewardDashboard() {
  const { data: shows, isLoading } = trpc.steward.getMyShows.useQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!shows || shows.length === 0) {
    return (
      <EmptyState
        icon={Eye}
        title="No Shows Assigned"
        description="You haven't been assigned as a steward for any shows yet. A show secretary will assign you when needed."
        variant="centered"
      />
    );
  }

  return (
    <div>
      <h1 className={cn(SE_H, 'text-lg sm:text-xl lg:text-2xl')}>
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
              <Card className="transition-all hover:bg-muted/30 hover:border-primary/20 hover:shadow-sm active:bg-muted/50">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm sm:text-base font-semibold">{show.name}</h3>
                        {status && (
                          <Badge
                            variant="secondary"
                            className={`text-xs shrink-0 ${status.className}`}
                          >
                            {status.label}
                          </Badge>
                        )}
                      </div>
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
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground/40" />
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
