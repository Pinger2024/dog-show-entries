'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Clock,
  Download,
  Loader2,
  Package,
  Printer,
  RefreshCw,
  Truck,
  XCircle,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useShowId } from '../../_lib/show-context';
import { formatCurrency } from '@/lib/date-utils';
import { CANCELLABLE_STATUSES, formatOrderRef } from '@/lib/print-products';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const STATUS_STEPS = [
  { key: 'draft', label: 'Created', icon: Clock },
  { key: 'paid', label: 'Paid', icon: Check },
  { key: 'submitted', label: 'Submitted', icon: Package },
  { key: 'in_production', label: 'Printing', icon: Printer },
  { key: 'dispatched', label: 'Dispatched', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: Check },
];

function getStatusIndex(status: string): number {
  const map: Record<string, number> = {
    draft: 0,
    awaiting_payment: 0,
    paid: 1,
    submitted: 2,
    in_production: 3,
    dispatched: 4,
    delivered: 5,
  };
  return map[status] ?? -1;
}

export default function PrintOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);
  const showId = useShowId();

  const { data: order, isLoading } = trpc.printOrders.getById.useQuery(
    { orderId },
    { staleTime: 15_000 }
  );

  const refreshStatus = trpc.printOrders.refreshStatus.useMutation();
  const cancelOrder = trpc.printOrders.cancelOrder.useMutation();
  const utils = trpc.useUtils();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Order not found.</p>
        <Button variant="outline" asChild>
          <Link href={`/secretary/shows/${showId}/print-shop`}>
            <ArrowLeft className="size-4" />
            Back to Print Shop
          </Link>
        </Button>
      </div>
    );
  }

  const statusIndex = getStatusIndex(order.status);
  const isFailed = order.status === 'failed';
  const isCancelled = order.status === 'cancelled';
  const canCancel = (CANCELLABLE_STATUSES as readonly string[]).includes(order.status);
  const canRefresh = ['submitted', 'in_production', 'dispatched'].includes(order.status);

  async function handleRefresh() {
    try {
      const result = await refreshStatus.mutateAsync({ orderId });
      toast.success(`Status: ${result.tradeprintStatus ?? result.status}`);
      utils.printOrders.getById.invalidate({ orderId });
    } catch {
      toast.error('Failed to refresh status');
    }
  }

  async function handleCancel() {
    try {
      await cancelOrder.mutateAsync({ orderId });
      toast.success('Order cancelled');
      utils.printOrders.getById.invalidate({ orderId });
    } catch {
      toast.error('Failed to cancel order');
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href={`/secretary/shows/${showId}/print-shop`}>
              <ArrowLeft className="size-4" />
              Back to Print Shop
            </Link>
          </Button>
          <h2 className="mt-1 font-serif text-lg font-semibold">
            Order #{formatOrderRef(order.id)}
          </h2>
          <p className="text-sm text-muted-foreground">
            Placed {new Date(order.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {order.orderedBy?.name && ` by ${order.orderedBy.name}`}
          </p>
        </div>
        <div className="flex gap-2">
          {canRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshStatus.isPending}
            >
              <RefreshCw className={`size-4 ${refreshStatus.isPending ? 'animate-spin' : ''}`} />
              Refresh Status
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={cancelOrder.isPending}
              className="text-destructive hover:text-destructive"
            >
              <XCircle className="size-4" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Status Timeline */}
      {!isFailed && !isCancelled && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between overflow-x-auto pb-1">
              {STATUS_STEPS.map((step, i) => {
                const isComplete = i <= statusIndex;
                const isCurrent = i === statusIndex;
                const StepIcon = step.icon;
                return (
                  <div key={step.key} className="flex flex-col items-center gap-1 px-1 min-w-[3.5rem]">
                    <div
                      className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                        isComplete
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      } ${isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    >
                      <StepIcon className="size-4" />
                    </div>
                    <span className={`text-[10px] text-center ${isComplete ? 'font-medium' : 'text-muted-foreground'}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {isFailed && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="size-5 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Payment Failed</p>
              <p className="text-xs text-muted-foreground">
                The payment for this order did not go through. Please create a new order.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isCancelled && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">This order was cancelled.</p>
          </CardContent>
        </Card>
      )}

      {/* Items */}
      <Card>
        <CardHeader className="pb-2 p-4">
          <CardTitle className="text-sm">Items</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.documentLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} copies × {formatCurrency(item.unitSellingPrice)}
                </p>
                {item.pdfPublicUrl && (
                  <a
                    href={item.pdfPublicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Download className="size-3" />
                    View PDF
                  </a>
                )}
              </div>
              <p className="font-medium">{formatCurrency(item.lineTotal)}</p>
            </div>
          ))}
          <div className="border-t pt-3 flex items-center justify-between">
            <p className="font-semibold">Total</p>
            <p className="text-lg font-bold">{formatCurrency(order.totalAmount)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Delivery */}
      <Card>
        <CardHeader className="pb-2 p-4">
          <CardTitle className="text-sm">Delivery</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 text-sm space-y-1">
          <p className="font-medium">{order.deliveryName}</p>
          <p className="text-muted-foreground">{order.deliveryAddress1}</p>
          {order.deliveryAddress2 && (
            <p className="text-muted-foreground">{order.deliveryAddress2}</p>
          )}
          <p className="text-muted-foreground">
            {order.deliveryTown}, {order.deliveryPostcode}
          </p>
          <p className="mt-2 text-xs text-muted-foreground capitalize">
            <Truck className="mr-1 inline size-3" />
            {order.serviceLevel} delivery
            {order.estimatedDeliveryDate && (
              <> — est. {new Date(order.estimatedDeliveryDate).toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}</>
            )}
          </p>
          {order.trackingUrl && (
            <a
              href={order.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Package className="size-3" />
              Track: {order.trackingNumber}
            </a>
          )}
        </CardContent>
      </Card>

      {/* Reference */}
      {order.tradeprintOrderRef && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Printer Reference</p>
              <p className="text-sm font-mono">{order.tradeprintOrderRef}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(order.tradeprintOrderRef!);
                toast.success('Copied');
              }}
            >
              <Copy className="size-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
