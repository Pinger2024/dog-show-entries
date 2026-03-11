'use client';

import Link from 'next/link';
import { ExternalLink, Printer, Truck, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { useShowId } from '../../_lib/show-context';
import type { ActionPanelProps } from '../checklist-action-registry';

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  awaiting_payment: { label: 'Awaiting Payment', variant: 'outline' },
  paid: { label: 'Paid', variant: 'secondary' },
  submitted: { label: 'With Printer', variant: 'secondary' },
  in_production: { label: 'Printing', variant: 'default' },
  dispatched: { label: 'Dispatched', variant: 'default' },
  delivered: { label: 'Delivered', variant: 'default' },
};

export function PrintOrderAction(_props: ActionPanelProps) {
  const showId = useShowId();

  const { data: orders, isLoading } = trpc.printOrders.listByShow.useQuery(
    { showId },
    { staleTime: 30_000 }
  );

  if (isLoading) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }

  // Find most recent active order
  const activeOrder = orders?.find((o) =>
    !['cancelled', 'failed'].includes(o.status)
  );

  if (activeOrder) {
    const config = statusLabels[activeOrder.status] ?? statusLabels.draft;
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Badge variant={config.variant} className="w-fit">
          {activeOrder.status === 'dispatched' ? (
            <Truck className="mr-1 size-3" />
          ) : activeOrder.status === 'delivered' ? (
            <Check className="mr-1 size-3" />
          ) : (
            <Printer className="mr-1 size-3" />
          )}
          {config.label}
        </Badge>
        {activeOrder.estimatedDeliveryDate && (
          <span className="text-xs text-muted-foreground">
            Est. {new Date(activeOrder.estimatedDeliveryDate).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs w-fit" asChild>
          <Link href={`/secretary/shows/${showId}/print-shop/${activeOrder.id}`}>
            <ExternalLink className="size-3" />
            View Order
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button size="sm" variant="outline" className="h-7 text-xs w-fit" asChild>
        <Link href={`/secretary/shows/${showId}/print-shop`}>
          <Printer className="size-3" />
          Order Professional Printing
        </Link>
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs w-fit" asChild>
        <Link href={`/secretary/shows/${showId}/catalogue`}>
          <ExternalLink className="size-3" />
          Go to Catalogue
        </Link>
      </Button>
    </div>
  );
}
