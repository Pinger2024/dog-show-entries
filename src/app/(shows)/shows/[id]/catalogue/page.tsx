'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  BookOpen,
  CalendarDays,
  Download,
  Eye,
  Loader2,
  Lock,
  ShoppingCart,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';

export default function CataloguePage() {
  const params = useParams();
  const idOrSlug = params.id as string;

  const { data, isLoading, error } = trpc.shows.getCatalogueAccess.useQuery(
    { showId: idOrSlug }
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-muted-foreground">
          {error?.message === 'UNAUTHORIZED'
            ? 'Please sign in to view your catalogue.'
            : 'Show not found.'}
        </p>
        <Button asChild className="mt-4 min-h-[2.75rem]">
          <Link href="/browse">Browse Shows</Link>
        </Button>
      </div>
    );
  }

  const { showId, showName, hasPurchased, isAvailable, startDate } = data;
  const catalogueUrl = `/api/catalogue/${showId}/standard`;

  // Not purchased
  if (!hasPurchased) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Card>
          <CardContent className="space-y-4 py-8 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
              <Lock className="size-7 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{showName}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                The online catalogue is available to exhibitors who purchased it when entering.
              </p>
            </div>
            <Button asChild className="min-h-[2.75rem] w-full">
              <Link href={`/shows/${idOrSlug}/enter`}>
                <ShoppingCart className="mr-2 size-4" />
                Enter This Show
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Purchased but not yet available
  if (!isAvailable) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Card>
          <CardContent className="space-y-4 py-8 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <CalendarDays className="size-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{showName}</h1>
              <h2 className="mt-1 text-base font-semibold text-muted-foreground">
                Catalogue Coming Soon
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your online catalogue will be available once entries close
                {startDate && (
                  <>, ahead of the show on{' '}
                  <span className="font-medium text-foreground">
                    {format(parseISO(startDate), 'dd MMMM yyyy')}
                  </span></>
                )}.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;ll include the link in your show reminder email too.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-[2.75rem]">
              <Link href="/entries">Back to My Entries</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Purchased and available
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card>
        <CardContent className="space-y-5 py-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <BookOpen className="size-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{showName}</h1>
            <h2 className="mt-1 text-base font-semibold text-emerald-600 dark:text-emerald-400">
              Online Catalogue
            </h2>
          </div>
          <div className="flex flex-col gap-3">
            <Button asChild className="min-h-[2.75rem] w-full">
              <a href={`${catalogueUrl}?preview`} target="_blank" rel="noopener noreferrer">
                <Eye className="mr-2 size-4" />
                View Catalogue
              </a>
            </Button>
            <Button asChild variant="outline" className="min-h-[2.75rem] w-full">
              <a href={catalogueUrl} download>
                <Download className="mr-2 size-4" />
                Download PDF
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Opens as a PDF. On mobile, your phone&apos;s PDF viewer will open automatically.
          </p>
        </CardContent>
      </Card>

      <div className="mt-4 text-center">
        <Button asChild variant="ghost" className="min-h-[2.75rem] text-sm">
          <Link href="/entries">Back to My Entries</Link>
        </Button>
      </div>
    </div>
  );
}
