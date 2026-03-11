'use client';

import Link from 'next/link';
import { Package, Truck } from 'lucide-react';
import { formatCurrency } from '@/lib/date-utils';
import { PRINT_ORDER_STATUS_CONFIG, formatOrderRef } from '@/lib/print-products';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface PrintOrder {
  id: string;
  status: string;
  totalAmount: number;
  serviceLevel: string;
  estimatedDeliveryDate: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: Date;
  items: Array<{
    id: string;
    documentLabel: string;
    quantity: number;
    lineTotal: number;
  }>;
  orderedBy: { id: string; name: string | null } | null;
}

export function PrintOrderList({
  orders,
  showId,
}: {
  orders: PrintOrder[];
  showId: string;
}) {
  if (!orders.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Package className="mb-3 size-8 text-muted-foreground" />
          <p className="font-medium">No print orders yet</p>
          <p className="text-sm text-muted-foreground">
            Order professional printing for your show documents
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const config = PRINT_ORDER_STATUS_CONFIG[order.status] ?? PRINT_ORDER_STATUS_CONFIG.draft;

        return (
          <Link
            key={order.id}
            href={`/secretary/shows/${showId}/print-shop/${order.id}`}
            className="block"
          >
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    Order #{formatOrderRef(order.id)}
                  </CardTitle>
                  <Badge variant={config.variant} className="shrink-0">
                    {config.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">
                    {order.items.map((i) => `${i.quantity}× ${i.documentLabel}`).join(', ')}
                  </div>
                  <p className="font-medium">{formatCurrency(order.totalAmount)}</p>
                </div>
                {order.estimatedDeliveryDate && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Truck className="mr-1 inline size-3" />
                    Est. delivery: {new Date(order.estimatedDeliveryDate).toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                )}
                {order.trackingUrl && (
                  <p className="mt-1 text-xs text-primary">
                    Track: {order.trackingNumber}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
