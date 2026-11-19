'use client';

import { use, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { formatCurrency } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { StripeProvider } from '@/components/providers/stripe-provider';
import { PaymentForm } from '@/app/(shows)/shows/[id]/enter/payment-form';
import { cn } from '@/lib/utils';
import { SE_H } from '@/components/show-experience/tokens';

/**
 * Add extras to an entry that's already confirmed and paid for — design doc
 * research/DESIGN-add-extras-to-entry-2026-09-21.md. Mirrors the class-change
 * edit page: read-only server pricing (`orders.previewExtras`), reuses
 * `PaymentForm`/`StripeProvider`, defers anything with a cost to the Stripe
 * webhook exactly as the class-change top-up does.
 */
export default function AddExtrasPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id: showId, entryId } = use(params);
  const router = useRouter();

  // sundryItemId -> quantity. null quantity (0) means "not selected".
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState<number | null>(null);

  const { data: entry, isLoading: entryLoading } = trpc.entries.getById.useQuery({ id: entryId });
  const orderId = entry?.orderId ?? undefined;

  const { data: sundryItems, isLoading: itemsLoading } = trpc.shows.getSundryItems.useQuery(
    { showId },
    { enabled: !!entry },
  );

  const alreadyOnOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const osi of entry?.order?.orderSundryItems ?? []) {
      map.set(osi.sundryItemId, (map.get(osi.sundryItemId) ?? 0) + osi.quantity);
    }
    return map;
  }, [entry]);

  const items = useMemo(
    () =>
      Object.entries(selection)
        .filter(([, qty]) => qty > 0)
        .map(([sundryItemId, quantity]) => ({ sundryItemId, quantity })),
    [selection],
  );

  const { data: preview, isFetching: previewLoading } = trpc.orders.previewExtras.useQuery(
    { orderId: orderId!, items },
    { enabled: !!orderId && items.length > 0 },
  );

  const addExtras = trpc.orders.addExtras.useMutation({
    onSuccess: (result) => {
      if (result.requiresPayment && 'clientSecret' in result) {
        setPayAmount(preview?.grossPence ?? 0);
        setClientSecret(result.clientSecret);
      } else {
        toast.success('Extras added', {
          description: "You'll get an email receipt shortly.",
        });
        router.push(`/entries/${entryId}`);
      }
    },
    onError: (error) => {
      toast.error('Could not add extras', { description: error.message });
    },
  });

  function setQty(sundryItemId: string, quantity: number) {
    setSelection((prev) => ({ ...prev, [sundryItemId]: Math.max(0, quantity) }));
  }

  function handleSubmit() {
    if (!orderId || items.length === 0) return;
    addExtras.mutate({ orderId, entryId, items });
  }

  if (entryLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p className="text-muted-foreground">Entry not found.</p>
      </div>
    );
  }

  if (!entry.orderId) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-8 text-center">
        <p className="text-muted-foreground">
          This entry doesn&apos;t have an order attached, so extras can&apos;t be added
          online — please contact the show secretary.
        </p>
        <Button variant="outline" asChild className="mt-4">
          <Link href={`/entries/${entryId}`}>Back to entry</Link>
        </Button>
      </div>
    );
  }

  if (clientSecret) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-6">
        <h1 className={cn(SE_H, 'mb-6 text-lg sm:text-2xl')}>Pay for Extras</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pay {formatCurrency(payAmount ?? 0)}</CardTitle>
            <CardDescription>Confirm payment to add these extras to your entry.</CardDescription>
          </CardHeader>
          <CardContent>
            <StripeProvider clientSecret={clientSecret}>
              <PaymentForm
                amount={payAmount ?? 0}
                onSuccess={() => {
                  toast.success('Extras added — you\'ll get an email receipt.');
                  router.push(`/entries/${entryId}`);
                }}
                onBack={() => setClientSecret(null)}
              />
            </StripeProvider>
          </CardContent>
        </Card>
      </div>
    );
  }

  // shows.getSundryItems already filters to enabled: true server-side.
  const availableItems = sundryItems ?? [];

  return (
    <div className="container mx-auto max-w-lg px-3 py-6 pb-24 sm:px-4">
      <div className="mb-6">
        <Link
          href={`/entries/${entryId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to entry
        </Link>
        <h1 className={cn(SE_H, 'mt-2 text-lg sm:text-2xl')}>Add Extras</h1>
        <p className="text-sm text-muted-foreground">
          {entry.show.name} &middot; {entry.dog?.registeredName ?? 'Junior Handler'}
        </p>
      </div>

      <div className="space-y-4">
        {itemsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : availableItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            There&apos;s nothing extra available for this show right now.
          </p>
        ) : (
          availableItems.map((item) => {
            const existing = alreadyOnOrder.get(item.id) ?? 0;
            const selectedQty = selection[item.id] ?? 0;
            const isCheckbox = item.maxPerOrder === 1;
            const alreadyMaxed = item.maxPerOrder != null && existing >= item.maxPerOrder;

            if (isCheckbox) {
              return (
                <label
                  key={item.id}
                  className={cn(
                    'flex min-h-[2.75rem] items-start gap-3 rounded-lg border p-3',
                    alreadyMaxed ? 'opacity-60' : 'cursor-pointer hover:bg-accent/50',
                  )}
                >
                  <Checkbox
                    checked={alreadyMaxed || selectedQty > 0}
                    disabled={alreadyMaxed}
                    onCheckedChange={(checked) => setQty(item.id, checked ? 1 : 0)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                    {alreadyMaxed && (
                      <p className="text-xs font-medium text-se-fresh-deep">Already added</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    {formatCurrency(item.priceInPence)}
                  </span>
                </label>
              );
            }

            const remaining = item.maxPerOrder != null ? Math.max(0, item.maxPerOrder - existing) : null;
            const atLimit = remaining !== null && selectedQty >= remaining;

            return (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.name}</p>
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(item.priceInPence)} each
                    {remaining !== null ? ` · ${remaining} left this order` : ''}
                    {existing > 0 ? ` · already added ×${existing}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Decrease ${item.name} quantity`}
                    disabled={selectedQty === 0}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-40"
                    onClick={() => setQty(item.id, selectedQty - 1)}
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-6 text-center text-sm font-medium">{selectedQty}</span>
                  <button
                    type="button"
                    aria-label={`Increase ${item.name} quantity`}
                    disabled={atLimit}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-40"
                    onClick={() => setQty(item.id, selectedQty + 1)}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}

        {items.length > 0 && (
          <Card>
            <CardContent className="space-y-2 py-4">
              {previewLoading && !preview ? (
                <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Calculating…
                </p>
              ) : (
                <>
                  {preview?.lines.map((line) => (
                    <div key={line.sundryItemId} className="flex justify-between text-sm">
                      <span>
                        {line.name}
                        {line.quantity > 1 ? ` ×${line.quantity}` : ''}
                      </span>
                      <span>{formatCurrency(line.unitPrice * line.quantity)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Booking fee</span>
                    <span>{formatCurrency(preview?.platformFeePence ?? 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(preview?.grossPence ?? 0)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/entries/${entryId}`}>Cancel</Link>
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={items.length === 0 || addExtras.isPending || (previewLoading && !preview)}
          >
            {addExtras.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Adding…
              </>
            ) : preview && preview.grossPence > 0 ? (
              `Pay ${formatCurrency(preview.grossPence)}`
            ) : (
              'Add Extras'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
