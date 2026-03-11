'use client';

import { useState, useCallback } from 'react';
import { Loader2, Printer, Package, Truck, CreditCard, Check, ShoppingCart, ChevronLeft, AlertCircle, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useShowId } from '../_lib/show-context';
import { formatCurrency } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { StripeProvider } from '@/components/providers/stripe-provider';
import { PrintPaymentForm } from './_components/print-payment-form';
import { PrintOrderList } from './_components/print-order-list';

type Step = 'catalog' | 'select' | 'delivery' | 'review' | 'payment' | 'confirmation';

interface SelectedItem {
  documentType: string;
  documentFormat?: string;
  label: string;
  quantity: number;
}

export default function PrintShopPage() {
  const showId = useShowId();

  // All hooks before any returns
  const [step, setStep] = useState<Step>('catalog');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [delivery, setDelivery] = useState({
    name: '',
    address1: '',
    address2: '',
    town: '',
    postcode: '',
    phone: '',
  });
  const [serviceLevel, setServiceLevel] = useState<'saver' | 'standard' | 'express'>('standard');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);

  const { data: profile } = trpc.users.getProfile.useQuery(undefined, {
    enabled: step === 'delivery',
  });

  const { data: products, isLoading: productsLoading } = trpc.printOrders.getAvailableProducts.useQuery(
    { showId },
    { staleTime: 60_000 }
  );

  const { data: orders } = trpc.printOrders.listByShow.useQuery(
    { showId },
    { staleTime: 30_000 }
  );

  const { data: quote, isLoading: quoteLoading } = trpc.printOrders.getQuote.useQuery(
    {
      showId,
      items: selectedItems.map((i) => ({
        documentType: i.documentType,
        documentFormat: i.documentFormat,
        quantity: i.quantity,
      })),
      serviceLevel,
      postcode: delivery.postcode || 'G1 1AA',
    },
    {
      enabled: step === 'review' && selectedItems.length > 0 && delivery.postcode.length >= 3,
    }
  );

  const createOrder = trpc.printOrders.createDraftOrder.useMutation();
  const initiatePayment = trpc.printOrders.initiatePayment.useMutation();
  const utils = trpc.useUtils();

  const handleToggleItem = useCallback((documentType: string, label: string, suggestedQty: number, checked: boolean) => {
    if (checked) {
      setSelectedItems((prev) => [
        ...prev,
        {
          documentType,
          label,
          quantity: suggestedQty,
          documentFormat: documentType === 'catalogue' ? 'standard' : undefined,
        },
      ]);
    } else {
      setSelectedItems((prev) => prev.filter((i) => i.documentType !== documentType));
    }
  }, []);

  const handleQuantityChange = useCallback((documentType: string, quantity: number) => {
    setSelectedItems((prev) =>
      prev.map((i) => (i.documentType === documentType ? { ...i, quantity } : i))
    );
  }, []);

  const handleFormatChange = useCallback((documentType: string, format: string) => {
    setSelectedItems((prev) =>
      prev.map((i) => (i.documentType === documentType ? { ...i, documentFormat: format } : i))
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!products) return;
    setSelectedItems(
      products.map((p) => ({
        documentType: p!.documentType,
        label: p!.label,
        quantity: p!.suggestedQuantity,
        documentFormat: p!.documentType === 'catalogue' ? 'standard' : undefined,
      }))
    );
  }, [products]);

  const handleProceedToDelivery = useCallback(() => {
    if (selectedItems.length === 0) {
      toast.error('Select at least one document to print');
      return;
    }
    setStep('delivery');
  }, [selectedItems]);

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

  const handleProceedToReview = useCallback(() => {
    if (!delivery.name || !delivery.address1 || !delivery.town || !delivery.postcode) {
      toast.error('Please fill in all required delivery fields');
      return;
    }
    setStep('review');
  }, [delivery]);

  const handleProceedToPayment = useCallback(async () => {
    if (!quote) return;

    try {
      const { orderId: newOrderId } = await createOrder.mutateAsync({
        showId,
        items: quote.items.map((item) => ({
          documentType: item.documentType,
          documentFormat: item.documentFormat ?? undefined,
          documentLabel: item.label,
          quantity: item.quantity,
          unitTradeCost: item.unitTradeCost,
          unitSellingPrice: item.unitSellingPrice,
          lineTotal: item.lineTotal,
          tradeprintProductId: item.tradeprintProductId,
          printSpecs: item.printSpecs,
        })),
        serviceLevel,
        deliveryName: delivery.name,
        deliveryAddress1: delivery.address1,
        deliveryAddress2: delivery.address2 || undefined,
        deliveryTown: delivery.town,
        deliveryPostcode: delivery.postcode,
        deliveryPhone: delivery.phone || undefined,
        estimatedDeliveryDate: quote.deliveryEstimate ?? undefined,
      });

      setOrderId(newOrderId);

      const { clientSecret: cs } = await initiatePayment.mutateAsync({
        orderId: newOrderId,
      });

      setClientSecret(cs);
      setStep('payment');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create order';
      toast.error(msg);
    }
  }, [quote, createOrder, initiatePayment, showId, serviceLevel, delivery]);

  const handlePaymentSuccess = useCallback(() => {
    setStep('confirmation');
    utils.printOrders.listByShow.invalidate({ showId });
  }, [utils, showId]);

  // Show existing orders if any and not starting new order
  const hasOrders = orders && orders.length > 0;
  const allSelected = !!products?.length && selectedItems.length === products.length;

  if (productsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If there are existing orders and user hasn't clicked "New Order"
  if (hasOrders && !showNewOrder && step === 'catalog') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold">Print Shop</h2>
            <p className="text-sm text-muted-foreground">
              Professional printing for your show documents
            </p>
          </div>
          <Button onClick={() => setShowNewOrder(true)}>
            <Printer className="size-4" />
            New Order
          </Button>
        </div>
        <PrintOrderList orders={orders} showId={showId} />
      </div>
    );
  }

  // Step: Catalog / Product selection
  if (step === 'catalog' || step === 'select') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold">Print Shop</h2>
            <p className="text-sm text-muted-foreground">
              Select documents to print professionally
            </p>
          </div>
          {hasOrders && (
            <Button variant="outline" size="sm" onClick={() => setShowNewOrder(false)}>
              <ChevronLeft className="size-4" />
              Back to Orders
            </Button>
          )}
        </div>

        {/* Show Day Bundle card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2 p-4">
            <div className="flex items-center gap-2">
              <Package className="size-5 text-primary" />
              <CardTitle className="text-base">Show Day Bundle</CardTitle>
            </div>
            <CardDescription>
              Everything you need — select all documents with one tap
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Button
              onClick={handleSelectAll}
              variant={allSelected ? 'secondary' : 'default'}
              className="w-full sm:w-auto"
            >
              <ShoppingCart className="size-4" />
              {allSelected ? 'All Selected' : 'Select All Documents'}
            </Button>
          </CardContent>
        </Card>

        {/* Individual product cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {products?.map((product) => {
            if (!product) return null;
            const isSelected = selectedItems.some((i) => i.documentType === product.documentType);
            const selectedItem = selectedItems.find((i) => i.documentType === product.documentType);

            return (
              <Card
                key={product.documentType}
                className={isSelected ? 'border-primary ring-1 ring-primary/20' : ''}
              >
                <CardHeader className="pb-2 p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        handleToggleItem(
                          product.documentType,
                          product.label,
                          product.suggestedQuantity,
                          checked === true
                        )
                      }
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm">{product.label}</CardTitle>
                      <CardDescription className="text-xs">
                        {product.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                {isSelected && (
                  <CardContent className="px-4 pb-4 pt-0 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Quantity</Label>
                        <Select
                          value={String(selectedItem?.quantity ?? product.suggestedQuantity)}
                          onValueChange={(v) => handleQuantityChange(product.documentType, parseInt(v))}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {product.availableQuantities.map((qty) => (
                              <SelectItem key={qty} value={String(qty)}>
                                {qty} copies
                                {qty === product.suggestedQuantity && ' (suggested)'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {product.documentType === 'catalogue' && (
                        <div>
                          <Label className="text-xs">Format</Label>
                          <Select
                            value={selectedItem?.documentFormat ?? 'standard'}
                            onValueChange={(v) => handleFormatChange(product.documentType, v)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="by-class">By Class</SelectItem>
                              <SelectItem value="alphabetical">Alphabetical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {selectedItems.length > 0 && (
          <div className="sticky bottom-16 z-10 rounded-lg border bg-background p-4 shadow-lg md:bottom-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  {selectedItems.length} document{selectedItems.length !== 1 && 's'} selected
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedItems.map((i) => `${i.quantity}× ${i.label}`).join(', ')}
                </p>
              </div>
              <Button onClick={handleProceedToDelivery} className="w-full sm:w-auto">
                Continue to Delivery
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step: Delivery
  if (step === 'delivery') {
    return (
      <div className="space-y-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setStep('catalog')} className="-ml-2">
            <ChevronLeft className="size-4" />
            Back to Selection
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
            <div>
              <Label htmlFor="delivery-name">Recipient Name *</Label>
              <Input
                id="delivery-name"
                value={delivery.name}
                onChange={(e) => setDelivery((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Amanda Smith"
              />
            </div>
            <div>
              <Label htmlFor="delivery-address1">Address Line 1 *</Label>
              <Input
                id="delivery-address1"
                value={delivery.address1}
                onChange={(e) => setDelivery((d) => ({ ...d, address1: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="delivery-address2">Address Line 2</Label>
              <Input
                id="delivery-address2"
                value={delivery.address2}
                onChange={(e) => setDelivery((d) => ({ ...d, address2: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="delivery-town">Town/City *</Label>
                <Input
                  id="delivery-town"
                  value={delivery.town}
                  onChange={(e) => setDelivery((d) => ({ ...d, town: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="delivery-postcode">Postcode *</Label>
                <Input
                  id="delivery-postcode"
                  value={delivery.postcode}
                  onChange={(e) => setDelivery((d) => ({ ...d, postcode: e.target.value }))}
                  placeholder="e.g. G75 8TL"
                />
              </div>
            </div>
            <div>
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

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setStep('catalog')} className="sm:w-auto">
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <Button onClick={handleProceedToReview} className="flex-1 sm:flex-initial">
            Continue to Review
          </Button>
        </div>
      </div>
    );
  }

  // Step: Review
  if (step === 'review') {
    return (
      <div className="space-y-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setStep('delivery')} className="-ml-2">
            <ChevronLeft className="size-4" />
            Back to Delivery
          </Button>
          <h2 className="mt-2 font-serif text-lg font-semibold">Review Your Order</h2>
        </div>

        {/* Service Level */}
        <Card>
          <CardHeader className="pb-2 p-4">
            <CardTitle className="text-sm">Delivery Speed</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['saver', 'standard', 'express'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setServiceLevel(level)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    serviceLevel === level
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'hover:bg-muted'
                  }`}
                >
                  <p className="text-sm font-medium capitalize">{level}</p>
                  <p className="text-xs text-muted-foreground">
                    {level === 'saver' && '5-7 working days'}
                    {level === 'standard' && '3-5 working days'}
                    {level === 'express' && '1-2 working days'}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Items breakdown */}
        <Card>
          <CardHeader className="pb-2 p-4">
            <CardTitle className="text-sm">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {quoteLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Getting prices...</span>
              </div>
            ) : quote ? (
              <div className="space-y-3">
                {quote.items.map((item) => (
                  <div key={item.documentType} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} × {formatCurrency(item.unitSellingPrice)}
                      </p>
                    </div>
                    <p className="font-medium">{formatCurrency(item.lineTotal)}</p>
                  </div>
                ))}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Total</p>
                    <p className="text-lg font-bold">{formatCurrency(quote.total)}</p>
                  </div>
                  {quote.deliveryEstimate && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <Truck className="mr-1 inline size-3" />
                      Estimated delivery: {quote.deliveryEstimate}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertCircle className="size-4" />
                <p>Could not fetch prices. Check your postcode and try again.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delivery summary */}
        <Card>
          <CardHeader className="pb-2 p-4">
            <CardTitle className="text-sm">Delivering to</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-sm">
            <p className="font-medium">{delivery.name}</p>
            <p className="text-muted-foreground">{delivery.address1}</p>
            {delivery.address2 && <p className="text-muted-foreground">{delivery.address2}</p>}
            <p className="text-muted-foreground">
              {delivery.town}, {delivery.postcode}
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setStep('delivery')} className="sm:w-auto">
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <Button
            onClick={handleProceedToPayment}
            className="flex-1 sm:flex-initial"
            disabled={!quote || createOrder.isPending || initiatePayment.isPending}
          >
            {createOrder.isPending || initiatePayment.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Preparing...
              </>
            ) : (
              <>
                <CreditCard className="size-4" />
                Pay {quote ? formatCurrency(quote.total) : '...'}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Step: Payment
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
                amount={quote?.total ?? 0}
                onSuccess={handlePaymentSuccess}
                onBack={() => setStep('review')}
              />
            </StripeProvider>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step: Confirmation
  if (step === 'confirmation') {
    return (
      <div className="space-y-4">
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <Check className="size-6 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="font-serif text-lg font-semibold">Order Placed!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your print order has been submitted. We&apos;ll generate the PDFs,
              send them to the printer, and notify you when they&apos;re dispatched.
            </p>
            {quote?.deliveryEstimate && (
              <Badge variant="outline" className="mt-3">
                <Truck className="mr-1 size-3" />
                Estimated delivery: {quote.deliveryEstimate}
              </Badge>
            )}
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
          <Button
            onClick={() => {
              setStep('catalog');
              setShowNewOrder(false);
              setSelectedItems([]);
              setOrderId(null);
              setClientSecret(null);
            }}
            variant="outline"
            className="sm:w-auto"
          >
            Back to Print Shop
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
