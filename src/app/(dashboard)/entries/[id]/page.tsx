'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  ChevronLeft,
  CalendarDays,
  MapPin,
  Dog,
  Loader2,
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

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending Payment', variant: 'outline' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  withdrawn: { label: 'Withdrawn', variant: 'secondary' },
  transferred: { label: 'Transferred', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

const paymentStatusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending', variant: 'outline' },
  succeeded: { label: 'Paid', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
  refunded: { label: 'Refunded', variant: 'secondary' },
  partially_refunded: { label: 'Partially Refunded', variant: 'secondary' },
};

export default function EntryDetailPage() {
  const params = useParams();
  const entryId = params.id as string;

  const { data: entry, isLoading } = trpc.entries.getById.useQuery({
    id: entryId,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="text-center">
        <p className="text-muted-foreground">Entry not found.</p>
      </div>
    );
  }

  const status = statusConfig[entry.status] ?? statusConfig.pending;
  const latestPayment = entry.payments?.[0];
  const paymentStatus = latestPayment
    ? paymentStatusConfig[latestPayment.status] ?? paymentStatusConfig.pending
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/entries"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to entries
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{entry.show.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {format(parseISO(entry.show.startDate), 'dd MMM yyyy')}
            </span>
            {entry.show.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {entry.show.venue.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          {paymentStatus && (
            <Badge variant={paymentStatus.variant}>
              {paymentStatus.label}
            </Badge>
          )}
        </div>
      </div>

      {/* Entry Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entry Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reference</span>
            <span className="font-mono font-medium">
              {entry.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entry Date</span>
            <span>
              {format(new Date(entry.entryDate), 'dd MMM yyyy, HH:mm')}
            </span>
          </div>
          {entry.isNfc && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Competition</span>
              <Badge variant="secondary">Not For Competition</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dog */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Dog className="size-4" />
            Dog
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{entry.dog.registeredName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Breed</span>
            <span>{entry.dog.breed?.name}</span>
          </div>
          {entry.dog.kcRegNumber && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">KC Registration</span>
              <span>{entry.dog.kcRegNumber}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Classes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classes Entered</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {entry.entryClasses.map((ec) => (
            <div key={ec.id} className="flex justify-between text-sm">
              <span>{ec.showClass?.classDefinition?.name ?? 'Class'}</span>
              <span className="font-medium">{formatFee(ec.fee)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>{formatFee(entry.totalFee)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" asChild>
          <Link href={`/shows/${entry.showId}`}>View Show</Link>
        </Button>
      </div>
    </div>
  );
}
