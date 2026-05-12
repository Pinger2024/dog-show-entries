'use client';

import { useState, useCallback } from 'react';
import {
  Loader2, Printer, Check, CreditCard,
  ChevronLeft, RefreshCw, MessageCircle, MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { PENDING_STATUSES, calculatePrintOrderFee } from '@/lib/print-products';
import { trpc } from '@/lib/trpc';
import { useShowId } from '../_lib/show-context';
import { formatCurrency } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StripeProvider } from '@/components/providers/stripe-provider';
import { PrintPaymentForm } from './_components/print-payment-form';
import { PrintOrderList } from './_components/print-order-list';

type Step = 'packages' | 'delivery' | 'payment' | 'confirmation';

const BUNDLE_CONTENTS = [
  'Show catalogue — printed & delivered',
  'Prize cards — A3 silk, ready to guillotine',
  'Ring boards — download & print',
  'Ring numbers — download & print',
  "Judges books — download",
];

export default function PrintShopPage() {
  const showId = useShowId();

  const [step, setStep] = useState<Step>('packages');
  const [selectedQty, setSelectedQty] = useState<number | null>(null);
  const [delivery, setDelivery] = useState({
    name: '', address1: '', address2: '', town: '', postcode: '', phone: '',
  });
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);

  const { data: profile } = trpc.users.getProfile.useQuery(undefined, {
    enabled: step === 'delivery',
  });

  const { data: packageData, isLoading: packagesLoading } = trpc.printOrders.getPackageOptions.useQuery(
    { showId },
    { staleTime: 60_000, enabled: step === 'packages' || showNewOrder }
  );

  const { data: orders } = trpc.printOrders.listByShow.useQuery(
    { showId },
    { staleTime: 30_000 }
  );

  const createPackageOrder = trpc.printOrders.createPackageOrder.useMutation();
  const initiatePayment = trpc.printOrders.initiatePayment.useMutation();
  const cancelOrder = trpc.printOrders.cancelOrder.useMutation();
  const refreshAllOrders = trpc.printOrders.refreshAllPendingOrders.useMutation();
  const utils = trpc.useUtils();

  const handleFillFromProfile = useCallback(() => {
    if (!profile) return;
    setDelivery((d) => ({
      ...d,
      name: profile.name ?? d.name,
      address1: profile.address ?? d.address1,
      postcode: profile.postcode ?? d.postcode,
      phone: profile.phone ?? d.phone,
    }));
  }, [profile]);

  const handleProceedToPayment = useCallback(async () => {
    if (!selectedQty || !packageData?.tier) return;

    if (!delivery.name || !delivery.address1 || !delivery.town || !delivery.postcode) {
      toast.error('Please fill in all required delivery fields');
      return;
    }

    try {
      const { orderId: newOrderId } = await createPackageOrder.mutateAsync({
        showId,
        catalogueQty: selectedQty,
        deliveryName: delivery.name,
        deliveryAddress1: delivery.address1,
        deliveryAddress2: delivery.address2 || undefined,
        deliveryTown: delivery.town,
        deliveryPostcode: delivery.postcode,
        deliveryPhone: delivery.phone || undefined,
      });

      setOrderId(newOrderId);

      const { clientSecret: cs } = await initiatePayment.mutateAsync({ orderId: newOrderId });
      setClientSecret(cs);
      setStep('payment');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order');
    }
  }, [selectedQty, packageData, delivery, createPackageOrder, initiatePayment, showId]);

  const handleBackFromPayment = useCallback(async () => {
    if (orderId) {
      cancelOrder.mutateAsync({ orderId }).catch(() => {});
    }
    setOrderId(null);
    setClientSecret(null);
    setStep('delivery');
  }, [orderId, cancelOrder]);

  const handlePaymentSuccess = useCallback(() => {
    setStep('confirmation');
    utils.printOrders.listByShow.invalidate({ showId });
  }, [utils, showId]);

  const resetOrder = useCallback(() => {
    setStep('packages');
    setShowNewOrder(false);
    setSelectedQty(null);
    setOrderId(null);
    setClientSecret(null);
  }, []);

  const hasOrders = orders && orders.length > 0;

  // ══════════════════════════════════════════════════════
  // EXISTING ORDERS VIEW
  // ══════════════════════════════════════════════════════
  if (hasOrders && !showNewOrder && step === 'packages') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold">Print Shop</h2>
            <p className="text-sm text-muted-foreground">
              Professional printing for your show documents
            </p>
          </div>
          <div className="flex gap-2">
            {orders.some((o) => (PENDING_STATUSES as readonly string[]).includes(o.status)) && (
              <Button
                variant="outline"
                size="sm"
                disabled={refreshAllOrders.isPending}
                onClick={async () => {
                  const result = await refreshAllOrders.mutateAsync({ showId });
                  utils.printOrders.listByShow.invalidate({ showId });
                  if (result.updated > 0) {
                    toast.success(`Updated ${result.updated} order${result.updated > 1 ? 's' : ''}`);
                  } else {
                    toast.info('All orders are up to date');
                  }
                }}
              >
                <RefreshCw className={`size-4 ${refreshAllOrders.isPending ? 'animate-spin' : ''}`} />
                Refresh Status
              </Button>
            )}
            <Button onClick={() => setShowNewOrder(true)}>
              <Printer className="size-4" />
              New Order
            </Button>
          </div>
        </div>
        <PrintOrderList orders={orders} showId={showId} />
      </div>
    );
  }

  // ── Loading ──
  if (packagesLoading && step === 'packages') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // STEP 1: PACKAGE SELECTION
  // ══════════════════════════════════════════════════════
  if (step === 'packages') {
    const tier = packageData?.tier ?? null;
    const tooLarge = packageData?.tooLarge ?? false;

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold">Print Shop</h2>
            <p className="text-sm text-muted-foreground">
              Everything you need for show day, in one order
            </p>
          </div>
          {hasOrders && (
            <Button variant="outline" size="sm" onClick={() => setShowNewOrder(false)}>
              <ChevronLeft className="size-4" />
              Back to Orders
            </Button>
          )}
        </div>

        {tooLarge ? (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
            <CardContent className="p-5 text-center">
              <MessageCircle className="mx-auto mb-3 size-8 text-amber-600" />
              <h3 className="font-serif text-base font-semibold">Your show is too large for standard pricing</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Get in touch and we&apos;ll put together a bespoke quote for your show.
              </p>
              <Button className="mt-4" asChild>
                <a href="mailto:hello@remishowmanager.co.uk">Contact Us</a>
              </Button>
            </CardContent>
          </Card>
        ) : tier ? (
          <>
            {/* Bundle contents */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <h3 className="font-serif text-sm font-semibold">What&apos;s included in every order</h3>
                <ul className="mt-2 space-y-1.5">
                  {BUNDLE_CONTENTS.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-3.5 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Quantity options */}
            <div>
              <h3 className="mb-2 text-sm font-medium">How many catalogues do you need?</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {tier.options.map((option) => {
                  const isSelected = selectedQty === option.catalogueQty;
                  const fee = calculatePrintOrderFee(option.pricePence);
                  const total = option.pricePence + fee;
                  return (
                    <button
                      key={option.catalogueQty}
                      onClick={() => setSelectedQty(option.catalogueQty)}
                      className={`rounded-lg border p-4 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <p className="text-lg font-bold">{option.catalogueQty}</p>
                      <p className="text-xs text-muted-foreground">catalogues</p>
                      <p className={`mt-2 text-sm font-semibold ${isSelected ? 'text-primary' : ''}`}>
                        {formatCurrency(total)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        inc. {formatCurrency(fee)} service fee
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedQty && (
              <Button className="w-full" size="lg" onClick={() => setStep('delivery')}>
                Continue to Delivery
              </Button>
            )}
          </>
        ) : null}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // STEP 2: DELIVERY
  // ══════════════════════════════════════════════════════
  if (step === 'delivery') {
    return (
      <div className="space-y-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setStep('packages')} className="-ml-2">
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <h2 className="mt-2 font-serif text-lg font-semibold">Delivery Details</h2>
          <p className="text-sm text-muted-foreground">
            Where should we send the printed documents?
          </p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            {profile?.address && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleFillFromProfile}
              >
                <MapPin className="size-4" />
                Use {profile.name ? `${profile.name.split(' ')[0]}'s` : 'my'} address
              </Button>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="delivery-name">Recipient Name *</Label>
              <Input
                id="delivery-name"
                value={delivery.name}
                onChange={(e) => setDelivery((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Amanda Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery-address1">Address Line 1 *</Label>
              <Input
                id="delivery-address1"
                value={delivery.address1}
                onChange={(e) => setDelivery((d) => ({ ...d, address1: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery-address2">Address Line 2</Label>
              <Input
                id="delivery-address2"
                value={delivery.address2}
                onChange={(e) => setDelivery((d) => ({ ...d, address2: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="delivery-town">Town/City *</Label>
                <Input
                  id="delivery-town"
                  value={delivery.town}
                  onChange={(e) => setDelivery((d) => ({ ...d, town: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delivery-postcode">Postcode *</Label>
                <Input
                  id="delivery-postcode"
                  value={delivery.postcode}
                  onChange={(e) => setDelivery((d) => ({ ...d, postcode: e.target.value }))}
                  placeholder="e.g. G75 8TL"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery-phone">Phone Number</Label>
              <Input
                id="delivery-phone"
                value={delivery.phone}
                onChange={(e) => setDelivery((d) => ({ ...d, phone: e.target.value }))}
                placeholder="For delivery notifications"
              />
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleProceedToPayment}
          className="w-full"
          size="lg"
          disabled={createPackageOrder.isPending || initiatePayment.isPending}
        >
          {createPackageOrder.isPending || initiatePayment.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Preparing your order...
            </>
          ) : (
            <>
              <CreditCard className="size-4" />
              Continue to Payment
            </>
          )}
        </Button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // STEP 3: PAYMENT
  // ══════════════════════════════════════════════════════
  if (step === 'payment' && clientSecret) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-serif text-lg font-semibold">Payment</h2>
          <p className="text-sm text-muted-foreground">
            Complete your payment to place the print order
          </p>
        </div>
        <Card>
          <CardContent className="p-4">
            <StripeProvider clientSecret={clientSecret}>
              <PrintPaymentForm
                amount={(() => {
                  const opt = packageData?.tier?.options.find((o) => o.catalogueQty === selectedQty);
                  return opt ? opt.pricePence + calculatePrintOrderFee(opt.pricePence) : 0;
                })()}
                onSuccess={handlePaymentSuccess}
                onBack={handleBackFromPayment}
              />
            </StripeProvider>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // STEP 4: CONFIRMATION
  // ══════════════════════════════════════════════════════
  if (step === 'confirmation') {
    return (
      <div className="space-y-4">
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <Check className="size-7 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="font-serif text-lg font-semibold">Order Placed!</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Your print order has been received. We&apos;re preparing your documents and will be in touch shortly.
            </p>

            <div className="mt-5 w-full max-w-xs space-y-2 text-left">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">What happens next</p>
              {[
                { icon: '📄', text: 'PDFs generated from your show data' },
                { icon: '✉️', text: "We'll review and send to the printer" },
                { icon: '📦', text: 'Printed, packed and dispatched' },
                { icon: '🚚', text: 'Delivered to your address' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row">
          {orderId && (
            <Button variant="outline" asChild className="sm:w-auto">
              <a href={`/secretary/shows/${showId}/print-shop/${orderId}`}>
                View Order Details
              </a>
            </Button>
          )}
          <Button onClick={resetOrder} variant="outline" className="sm:w-auto">
            Back to Print Shop
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
