'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { BookOpen, CalendarDays, Car, Download, MapPin, ShoppingBag } from 'lucide-react';
import { formatCurrency } from '@/lib/date-utils';
import type { RouterOutputs } from '@/server/trpc/router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type ExtrasOnlyOrder = RouterOutputs['orders']['myExtrasOnlyOrders'][number];
type CataloguePurchase = RouterOutputs['shows']['getMyCataloguePurchases'][number];
type ParkingPass = RouterOutputs['orders']['myParkingPasses'][number];

/**
 * A card for an order that has extras but NO dog (Mandy, 15 Oct 2026) — a
 * catalogue or parking pass bought on its own. It sits beside the dog cards
 * on My Entries so the buyer can still reach their catalogue link and
 * parking pass. The catalogue and parking logic is NOT repeated here: the
 * page passes in what the existing queries already worked out.
 */
export function ExtrasOnlyOrderCard({
  order,
  isPast,
  catalogue,
  parkingPasses,
}: {
  order: ExtrasOnlyOrder;
  isPast?: boolean;
  catalogue?: CataloguePurchase;
  parkingPasses: ParkingPass[];
}) {
  return (
    <Card className={isPast ? 'opacity-70' : ''}>
      <div className="border-b bg-muted/30 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold sm:text-lg">{order.show.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {format(parseISO(order.show.startDate), 'dd MMM yyyy')}
              </span>
              {order.show.venue && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {order.show.venue.name}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold">{formatCurrency(order.totalAmount)}</p>
            <p className="text-xs text-muted-foreground">extras only</p>
          </div>
        </div>
      </div>

      <div className="divide-y">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
            <ShoppingBag className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {item.name}
              {item.quantity > 1 ? ` × ${item.quantity}` : ''}
            </span>
            <span className="shrink-0 text-sm font-medium">
              {formatCurrency(item.unitPrice * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      {catalogue && (
        <div className="border-t bg-se-fresh-soft px-3 py-2.5 sm:px-4">
          <Link
            href={`/shows/${catalogue.showSlug ?? order.show.id}/catalogue`}
            className="flex min-h-[2.75rem] items-center gap-2 text-sm font-medium text-se-fresh-deep"
          >
            <BookOpen className="size-4" />
            {catalogue.isAvailable ? 'View Online Catalogue' : 'Catalogue — available soon'}
          </Link>
        </div>
      )}

      {parkingPasses.length > 0 && (
        <div className="border-t bg-muted/30 px-3 py-2.5 sm:px-4">
          <div className="space-y-2">
            {parkingPasses.map((pass) => (
              <div key={pass.orderId} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                  <Car className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    Parking pass{pass.quantity > 1 ? ` × ${pass.quantity}` : ''}
                  </span>
                </div>
                <Button asChild size="sm" variant="outline" className="min-h-[2.75rem] shrink-0">
                  <a href={`/api/parking-pass/${pass.orderId}`}>
                    <Download className="size-4" />
                    Download
                  </a>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
