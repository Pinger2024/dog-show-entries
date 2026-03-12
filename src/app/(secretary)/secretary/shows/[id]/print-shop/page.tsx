'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Loader2, Printer, Package, Truck, CreditCard, Check,
  ChevronLeft, ChevronDown, AlertCircle, MapPin, Sparkles, Star,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useShowId } from '../_lib/show-context';
import { formatCurrency } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { StripeProvider } from '@/components/providers/stripe-provider';
import { PostcodeLookup } from '@/components/postcode-lookup';
import { PrintPaymentForm } from './_components/print-payment-form';
import { PrintOrderList } from './_components/print-order-list';

type Step = 'catalog' | 'delivery' | 'review' | 'payment' | 'confirmation';

interface SelectedItem {
  documentType: string;
  documentFormat?: string;
  label: string;
  quantity: number;
  presetId: string;
  customSpecs?: Record<string, string>;
  customUnitPrice?: number | null;
}

// ── Tier visuals ──
const TIER_STYLES = {
  standard: { icon: Star, colour: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', ring: 'ring-blue-200' },
  premium: { icon: Sparkles, colour: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', ring: 'ring-amber-200' },
  budget: { icon: Package, colour: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', ring: 'ring-slate-200' },
} as const;

export default function PrintShopPage() {
  const showId = useShowId();

  // All hooks before any returns
  const [step, setStep] = useState<Step>('catalog');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [delivery, setDelivery] = useState({
    name: '', address1: '', address2: '', town: '', postcode: '', phone: '',
  });
  const [serviceLevel, setServiceLevel] = useState<'saver' | 'standard' | 'express'>('standard');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);

  const { data: profile } = trpc.users.getProfile.useQuery(undefined, {
    enabled: step === 'delivery',
  });

  const { data: productData, isLoading: productsLoading } = trpc.printOrders.getAvailableProducts.useQuery(
    { showId, serviceLevel },
    { staleTime: 60_000 }
  );

  const products = productData?.products;

  const { data: orders } = trpc.printOrders.listByShow.useQuery(
    { showId },
    { staleTime: 30_000 }
  );

  const quoteItems = useMemo(
    () => selectedItems.map((i) => ({
      documentType: i.documentType,
      documentFormat: i.documentFormat,
      quantity: i.quantity,
      presetId: i.presetId,
      customSpecs: i.customSpecs,
    })),
    [selectedItems]
  );

  const { data: quote, isLoading: quoteLoading } = trpc.printOrders.getQuote.useQuery(
    {
      showId,
      items: quoteItems,
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

  // ── Handlers ──

  const handleOrderEverything = useCallback(() => {
    if (!products) return;
    setSelectedItems(
      products.map((p) => ({
        documentType: p.documentType,
        label: p.label,
        quantity: p.suggestedQuantity,
        presetId: 'standard',
        documentFormat: p.documentType === 'catalogue' ? 'standard' : undefined,
      }))
    );
    setStep('delivery');
  }, [products]);

  const handleToggleItem = useCallback((product: NonNullable<typeof products>[number], checked: boolean) => {
    if (checked) {
      setSelectedItems((prev) => [
        ...prev,
        {
          documentType: product.documentType,
          label: product.label,
          quantity: product.suggestedQuantity,
          presetId: 'standard',
          documentFormat: product.documentType === 'catalogue' ? 'standard' : undefined,
        },
      ]);
    } else {
      setSelectedItems((prev) => prev.filter((i) => i.documentType !== product.documentType));
    }
  }, []);

  const handleUpdateItem = useCallback((documentType: string, updates: Partial<SelectedItem>) => {
    setSelectedItems((prev) =>
      prev.map((i) => (i.documentType === documentType ? { ...i, ...updates } : i))
    );
  }, []);

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
      toast.error(err instanceof Error ? err.message : 'Failed to create order');
    }
  }, [quote, createOrder, initiatePayment, showId, serviceLevel, delivery]);

  const handlePaymentSuccess = useCallback(() => {
    setStep('confirmation');
    utils.printOrders.listByShow.invalidate({ showId });
  }, [utils, showId]);

  const resetOrder = useCallback(() => {
    setStep('catalog');
    setShowNewOrder(false);
    setSelectedItems([]);
    setOrderId(null);
    setClientSecret(null);
    setExpandedProduct(null);
  }, []);

  // ── Derived state ──
  const hasOrders = orders && orders.length > 0;

  // ── Computed total from cached prices for the sticky bar ──
  const estimatedTotal = useMemo(() => {
    if (!products || selectedItems.length === 0) return null;
    let total = 0;
    for (const item of selectedItems) {
      const product = products.find((p) => p.documentType === item.documentType);
      if (!product) continue;
      // Custom price (from configurator) > preset price > default price
      if (item.customUnitPrice != null && item.customUnitPrice > 0) {
        total += item.customUnitPrice * item.quantity;
      } else {
        const preset = product.presets.find((p) => p.id === item.presetId);
        if (preset?.unitSellingPrice) {
          total += preset.unitSellingPrice * item.quantity;
        } else if (product.unitSellingPrice) {
          total += product.unitSellingPrice * item.quantity;
        }
      }
    }
    return total > 0 ? total : null;
  }, [products, selectedItems]);

  // ── Loading ──
  if (productsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // EXISTING ORDERS VIEW
  // ══════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════
  // STEP 1: PRODUCT CATALOG
  // ══════════════════════════════════════════════════════
  if (step === 'catalog') {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold">Print Shop</h2>
            <p className="text-sm text-muted-foreground">
              Professional printing delivered to your door
            </p>
          </div>
          {hasOrders && (
            <Button variant="outline" size="sm" onClick={() => setShowNewOrder(false)}>
              <ChevronLeft className="size-4" />
              Back to Orders
            </Button>
          )}
        </div>

        {/* ── HERO: Order Everything ── */}
        <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Package className="size-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-serif text-base font-semibold">Show Day Bundle</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Everything you need for show day — catalogues, prize cards, schedules, ring boards, and ring numbers.
                  We&apos;ll suggest the right quantities based on your entries.
                </p>
                {products && products.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {products.map((p) => `${p.suggestedQuantity}× ${p.label}`).join(' · ')}
                  </p>
                )}
                <Button
                  onClick={handleOrderEverything}
                  className="mt-3 w-full sm:w-auto"
                  size="lg"
                >
                  <Package className="size-4" />
                  Order Everything
                  {estimatedTotal === null && products && (
                    <span className="ml-1 text-primary-foreground/70">
                      — prices on next step
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── OR: Pick individual items ── */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-xs uppercase tracking-wider text-muted-foreground">
              or pick individual items
            </span>
          </div>
        </div>

        {/* ── Product cards ── */}
        <div className="space-y-3">
          {products?.map((product) => {
            const isSelected = selectedItems.some((i) => i.documentType === product.documentType);
            const selectedItem = selectedItems.find((i) => i.documentType === product.documentType);
            const isExpanded = expandedProduct === product.documentType;
            const activePreset = product.presets.find((p) => p.id === (selectedItem?.presetId ?? 'standard'));

            return (
              <Card
                key={product.documentType}
                className={`transition-all ${isSelected ? 'border-primary/40 shadow-sm' : ''}`}
              >
                {/* Product header — always visible */}
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleToggleItem(product, !isSelected)}
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/30 hover:border-primary/50'
                      }`}
                    >
                      {isSelected && <Check className="size-3" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm">{product.label}</CardTitle>
                        {isSelected && activePreset && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {activePreset.label}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        {product.description}
                        {product.unitSellingPrice != null && product.unitSellingPrice > 0 && !isSelected && (
                          <span className="ml-1 text-foreground/70">
                            — from {formatCurrency(product.unitSellingPrice)} each
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                {/* Expanded options — only when selected */}
                {isSelected && (
                  <CardContent className="px-4 pb-4 pt-1 space-y-3">
                    {/* Quantity + Format row */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Quantity</Label>
                        <Select
                          value={String(selectedItem?.quantity ?? product.suggestedQuantity)}
                          onValueChange={(v) => handleUpdateItem(product.documentType, { quantity: parseInt(v) })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {product.availableQuantities.map((qty) => (
                              <SelectItem key={qty} value={String(qty)}>
                                {qty} copies{qty === product.suggestedQuantity ? ' (suggested)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {product.documentType === 'catalogue' && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Format</Label>
                          <Select
                            value={selectedItem?.documentFormat ?? 'standard'}
                            onValueChange={(v) => handleUpdateItem(product.documentType, { documentFormat: v })}
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

                    {/* Presets — only show if product has multiple */}
                    {product.presets.length > 1 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Quality</Label>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          {product.presets.filter((p) => p.available).map((preset) => {
                            const isActive = (selectedItem?.presetId ?? 'standard') === preset.id;
                            const tierStyle = TIER_STYLES[preset.tier];
                            const TierIcon = tierStyle.icon;

                            return (
                              <button
                                key={preset.id}
                                onClick={() => handleUpdateItem(product.documentType, {
                                  presetId: preset.id,
                                  customSpecs: undefined,
                                })}
                                className={`rounded-lg border p-3 text-left transition-all ${
                                  isActive
                                    ? `${tierStyle.bg} ring-1 ${tierStyle.ring}`
                                    : 'hover:bg-muted/50'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <TierIcon className={`size-3.5 ${tierStyle.colour}`} />
                                  <span className="text-sm font-medium">{preset.label}</span>
                                </div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {preset.description}
                                </p>
                                {preset.unitSellingPrice != null && preset.unitSellingPrice > 0 && (
                                  <p className={`mt-1 text-xs font-medium ${tierStyle.colour}`}>
                                    {formatCurrency(preset.unitSellingPrice)} each
                                  </p>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Advanced customisation toggle */}
                    {product.configurableSpecs.length > 0 && (
                      <button
                        onClick={() => {
                          if (!isExpanded && !selectedItem?.customSpecs) {
                            // Seed custom specs from active preset so user starts from a valid combination
                            const preset = product.presets.find((p) => p.id === (selectedItem?.presetId ?? 'standard'));
                            if (preset?.specs) {
                              handleUpdateItem(product.documentType, { customSpecs: preset.specs });
                            }
                          }
                          setExpandedProduct(isExpanded ? null : product.documentType);
                        }}
                        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Settings2 className="size-3" />
                        <span>Customise specs</span>
                        <ChevronDown className={`size-3 ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    )}

                    {/* Advanced spec selectors */}
                    {isExpanded && selectedItem && (
                      <SpecConfigurator
                        product={product}
                        selectedItem={selectedItem}
                        onUpdate={(updates) => handleUpdateItem(product.documentType, updates)}
                        serviceLevel={serviceLevel}
                      />
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Sticky action bar */}
        {selectedItems.length > 0 && (
          <div className="sticky bottom-16 z-10 rounded-lg border bg-background p-4 shadow-lg md:bottom-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">
                  {selectedItems.length} item{selectedItems.length !== 1 && 's'} selected
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedItems.map((i) => `${i.quantity}× ${i.label}`).join(', ')}
                </p>
                {estimatedTotal && (
                  <p className="text-xs font-medium text-primary">
                    Est. {formatCurrency(estimatedTotal)}
                  </p>
                )}
              </div>
              <Button onClick={() => setStep('delivery')} className="w-full shrink-0 sm:w-auto">
                Continue to Delivery
              </Button>
            </div>
          </div>
        )}
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
          <Button variant="ghost" size="sm" onClick={() => setStep('catalog')} className="-ml-2">
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
            <PostcodeLookup
              compact
              onSelect={(result) => {
                setDelivery((d) => ({
                  ...d,
                  address1: result.address,
                  town: result.town,
                  postcode: result.postcode,
                }));
              }}
            />
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

  // ══════════════════════════════════════════════════════
  // STEP 3: REVIEW
  // ══════════════════════════════════════════════════════
  if (step === 'review') {
    return (
      <div className="space-y-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setStep('delivery')} className="-ml-2">
            <ChevronLeft className="size-4" />
            Back
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
                      <p className="font-medium">
                        {item.label}
                        {item.presetId && item.presetId !== 'standard' && (
                          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                            {item.presetId}
                          </Badge>
                        )}
                      </p>
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
            <p className="text-muted-foreground">{delivery.town}, {delivery.postcode}</p>
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

  // ══════════════════════════════════════════════════════
  // STEP 4: PAYMENT
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

  // ══════════════════════════════════════════════════════
  // STEP 5: CONFIRMATION
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
              Your documents are being generated and sent to the printer.
              We&apos;ll notify you when they&apos;re dispatched.
            </p>
            {quote?.deliveryEstimate && (
              <Badge variant="outline" className="mt-3">
                <Truck className="mr-1 size-3" />
                Estimated delivery: {quote.deliveryEstimate}
              </Badge>
            )}

            {/* What happens next */}
            <div className="mt-5 w-full max-w-xs space-y-2 text-left">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">What happens next</p>
              {[
                { icon: '📄', text: 'PDFs generated from your show data' },
                { icon: '🖨️', text: 'Sent to professional printer' },
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

// ══════════════════════════════════════════════════════
// SPEC CONFIGURATOR (advanced options)
// ══════════════════════════════════════════════════════

function SpecConfigurator({
  product,
  selectedItem,
  onUpdate,
  serviceLevel,
}: {
  product: { tradeprintProductName: string; configurableSpecs: Array<{ key: string; label: string; description?: string }> };
  selectedItem: SelectedItem;
  onUpdate: (updates: Partial<SelectedItem>) => void;
  serviceLevel: string;
}) {
  const currentSpecs = selectedItem.customSpecs;
  const sl = serviceLevel as 'saver' | 'standard' | 'express';
  const lastReportedPrice = useRef<number | null | undefined>(undefined);

  // Single query for both spec options AND price (avoids tRPC batch bug)
  const { data, isLoading, isFetching, isError } = trpc.printOrders.getSpecOptions.useQuery(
    {
      productName: product.tradeprintProductName,
      serviceLevel: sl,
      currentSpecs: currentSpecs ?? undefined,
      quantity: currentSpecs ? selectedItem.quantity : undefined,
    },
    { staleTime: 60_000, retry: 1, placeholderData: (prev) => prev }
  );

  const specOptions = data?.options;
  const customPrice = data?.price;

  // Report custom price back to parent — only when it actually changes
  // On error, clear the price so the parent doesn't keep a stale value
  const unitPrice = isError ? null : (customPrice?.unitSellingPrice ?? null);
  useEffect(() => {
    if (isFetching || !currentSpecs) return;
    if (lastReportedPrice.current === unitPrice) return;
    lastReportedPrice.current = unitPrice;
    onUpdate({ customUnitPrice: unitPrice });
  }, [unitPrice, isFetching, currentSpecs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Loading options...
      </div>
    );
  }

  if (!specOptions || Object.keys(specOptions).length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Advanced Options
        </p>
        {currentSpecs && (
          <p className="text-xs font-medium">
            {isFetching ? (
              <span className="text-muted-foreground">
                <Loader2 className="mr-1 inline size-3 animate-spin" />
                Checking price...
              </span>
            ) : isError ? (
              <span className="text-amber-600">
                Price unavailable
              </span>
            ) : customPrice ? (
              <span className="text-primary">{formatCurrency(customPrice.unitSellingPrice)} each</span>
            ) : (
              <span className="text-amber-600">This combination isn&apos;t available</span>
            )}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {product.configurableSpecs.map((spec) => {
          const options = specOptions[spec.key];
          if (!options || options.length <= 1) return null;

          const currentValue = currentSpecs?.[spec.key] ?? '';

          return (
            <div key={spec.key}>
              <Label className="text-xs text-muted-foreground">
                {spec.label}
                {spec.description && (
                  <span className="ml-1 text-[10px] text-muted-foreground/70">
                    — {spec.description}
                  </span>
                )}
              </Label>
              <Select
                value={currentValue}
                onValueChange={(v) => {
                  const newSpecs = { ...(currentSpecs ?? {}), [spec.key]: v };
                  onUpdate({ customSpecs: newSpecs, presetId: 'custom', customUnitPrice: undefined });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose..." />
                </SelectTrigger>
                <SelectContent>
                  {options.map((val) => (
                    <SelectItem key={val} value={val} className="text-xs">
                      {val}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
