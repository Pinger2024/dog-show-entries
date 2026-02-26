'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  CalendarDays,
  MapPin,
  Building2,
  ChevronLeft,
  Loader2,
  Ticket,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

function formatFee(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

const showTypeLabels: Record<string, string> = {
  companion: 'Companion',
  primary: 'Primary',
  limited: 'Limited',
  open: 'Open',
  premier_open: 'Premier Open',
  championship: 'Championship',
};

export default function ShowDetailPage() {
  const params = useParams();
  const showId = params.id as string;

  const { data: show, isLoading } = trpc.shows.getById.useQuery({
    id: showId,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!show) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p className="text-muted-foreground">Show not found.</p>
      </div>
    );
  }

  const isOpen = show.status === 'entries_open';

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <Link
        href="/shows"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All shows
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl">{show.name}</h1>
            <Badge variant={isOpen ? 'default' : 'secondary'}>
              {isOpen ? 'Entries Open' : show.status.replace('_', ' ')}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-4" />
              {format(parseISO(show.startDate), 'dd MMM yyyy')}
              {show.startDate !== show.endDate &&
                ` – ${format(parseISO(show.endDate), 'dd MMM yyyy')}`}
            </span>
            {show.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="size-4" />
                {show.venue.name}
              </span>
            )}
            {show.organisation && (
              <span className="flex items-center gap-1">
                <Building2 className="size-4" />
                {show.organisation.name}
              </span>
            )}
          </div>
        </div>
        {isOpen && (
          <Button size="lg" asChild>
            <Link href={`/shows/${showId}/enter`}>
              <Ticket className="size-4" />
              Enter This Show
            </Link>
          </Button>
        )}
      </div>

      {show.description && (
        <p className="mt-4 text-muted-foreground">{show.description}</p>
      )}

      <Separator className="my-6" />

      {/* Details */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Show Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>{showTypeLabels[show.showType] ?? show.showType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scope</span>
              <span className="capitalize">
                {show.showScope.replace('_', ' ')}
              </span>
            </div>
            {show.kcLicenceNo && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">KC Licence</span>
                <span>{show.kcLicenceNo}</span>
              </div>
            )}
            {show.entryCloseDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entries Close</span>
                <span>
                  {format(new Date(show.entryCloseDate), 'dd MMM yyyy, HH:mm')}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {show.venue && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Venue</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{show.venue.name}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Classes */}
      {show.showClasses && show.showClasses.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">
            Classes ({show.showClasses.length})
          </h2>
          <div className="space-y-2">
            {show.showClasses.map((sc) => (
              <div
                key={sc.id}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {sc.classDefinition.name}
                  </span>
                  {sc.classDefinition.description && (
                    <p className="text-muted-foreground">
                      {sc.classDefinition.description}
                    </p>
                  )}
                  {sc.breed && (
                    <Badge variant="outline" className="mt-1 text-xs">
                      {sc.breed.name}
                    </Badge>
                  )}
                </div>
                <span className="shrink-0 font-semibold">
                  {formatFee(sc.entryFee)}
                </span>
              </div>
            ))}
          </div>

          {isOpen && (
            <div className="mt-6 text-center">
              <Button size="lg" asChild>
                <Link href={`/shows/${showId}/enter`}>
                  <Ticket className="size-4" />
                  Enter This Show
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
