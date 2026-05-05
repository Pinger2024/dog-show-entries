'use client';

import { Fragment, useState, useMemo } from 'react';
import { Download, Loader2, RotateCcw, BookOpen, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/lib/date-utils';
import { formatDogName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { entryStatusConfig, downloadCsv } from '../_lib/show-utils';
import { useShowId } from '../_lib/show-context';
import { computeClassBreakdown } from '@/lib/class-breakdown';
import type { RouterOutputs } from '@/server/trpc/router';

type RefundableOrder = RouterOutputs['secretary']['getRefundableOrders'][number];
type RefundableEntry = RefundableOrder['entries'][number];

export default function FinancialPage() {
  const showId = useShowId();
  const { data: show } = trpc.shows.getById.useQuery({ id: showId });
  const { data: stats } = trpc.secretary.getShowStats.useQuery({ showId });
  const { data: entryReport } = trpc.secretary.getEntryReport.useQuery({ showId });
  const { data: catalogueOrders } = trpc.secretary.getCatalogueOrders.useQuery({ showId });
  const { data: sundryReport } = trpc.secretary.getSundryItemReport.useQuery({ showId });
  const { data: refundableOrders } = trpc.secretary.getRefundableOrders.useQuery({ showId });

  const entries = entryReport ?? [];

  const [orderToRefund, setOrderToRefund] = useState<RefundableOrder | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [partialRefundEntry, setPartialRefundEntry] = useState<RefundableEntry | null>(null);
  const [partialAmount, setPartialAmount] = useState('');
  const utils = trpc.useUtils();

  const invalidateAll = () => {
    utils.secretary.getShowStats.invalidate({ showId });
    utils.secretary.getRefundableOrders.invalidate({ showId });
    utils.secretary.getEntryReport.invalidate({ showId });
    utils.secretary.getShowEntryStats.invalidate({ showId });
    utils.secretary.getCatalogueOrders.invalidate({ showId });
  };

  const orderRefund = trpc.secretary.refundOrder.useMutation({
    onSuccess: (data) => {
      toast.success(`Order refunded: ${formatCurrency(data.amount)} returned to exhibitor`);
      setOrderToRefund(null);
      setRefundReason('');
      invalidateAll();
    },
    onError: (err) => toast.error(err.message ?? 'Failed to refund order'),
  });

  const partialRefund = trpc.secretary.issueRefund.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.fullyRefunded
          ? `Refund of ${formatCurrency(data.amount)} issued — entry cancelled`
          : `Partial refund of ${formatCurrency(data.amount)} issued`
      );
      setPartialRefundEntry(null);
      setPartialAmount('');
      setRefundReason('');
      invalidateAll();
    },
    onError: (err) => toast.error(err.message ?? 'Failed to issue refund'),
  });

  // Entry-type split comes from entryReport (paid-only). We distinguish
  // junior-handler entries from standard because JH entries typically carry
  // no dog and may have £0 fee, so lumping them under "Standard" is noise.
  const nfcEntries = entries.filter((e) => e.isNfc);
  const jhEntries = entries.filter((e) => !e.isNfc && e.entryType === 'junior_handler');
  const standardEntries = entries.filter((e) => !e.isNfc && e.entryType !== 'junior_handler');

  // Confirmed-only counts for the headline stat cards. The headline "X
  // entries" subtext used to lump every status together, which let a
  // single £0 NFC or JH entry hide inside the count and made secretaries
  // suspect the entry-fee total was wrong (e.g. "10 entries × £18 ≠ £126
  // — what's broken?"). Showing the breakdown explicitly lets the maths
  // be sanity-checked at a glance.
  const confirmedStandardCount = standardEntries.filter((e) => e.status === 'confirmed').length;
  const confirmedNfcCount = nfcEntries.filter((e) => e.status === 'confirmed').length;
  const confirmedJhCount = jhEntries.filter((e) => e.status === 'confirmed').length;
  const entryBreakdownParts = [
    confirmedStandardCount > 0 ? `${confirmedStandardCount} paid` : null,
    confirmedNfcCount > 0 ? `${confirmedNfcCount} NFC` : null,
    confirmedJhCount > 0 ? `${confirmedJhCount} JH` : null,
  ].filter(Boolean);
  const entryBreakdownText = entryBreakdownParts.length > 0
    ? entryBreakdownParts.join(' · ')
    : `${stats?.confirmedEntries ?? 0} entries`;

  // Per-class breakdown — buckets dogs / bitches / junior handlers /
  // mixed (non-JH classes that accept both sexes — Veteran, Brace,
  // Team, Stakes). The four buckets are exhaustive so subtotals always
  // sum to the grand total. See src/lib/class-breakdown.ts.
  const classBreakdown = useMemo(
    () => computeClassBreakdown(entryReport),
    [entryReport]
  );

  // Per-breed breakdown with nested classes (for all-breed shows)
  const breedBreakdown = useMemo(() => {
    if (!entryReport) return [];
    const breedMap = new Map<string, {
      name: string;
      entries: number;
      revenue: number;
      classes: Map<string, { name: string; entries: number; revenue: number }>;
    }>();
    for (const entry of entryReport) {
      if (entry.status === 'cancelled' || entry.status === 'withdrawn') continue;
      const breedName = entry.dog?.breed?.name ?? 'Unknown';
      if (!breedMap.has(breedName)) {
        breedMap.set(breedName, { name: breedName, entries: 0, revenue: 0, classes: new Map() });
      }
      const breed = breedMap.get(breedName)!;
      breed.entries += 1;
      for (const ec of entry.entryClasses ?? []) {
        breed.revenue += ec.fee;
        const className = ec.showClass?.classDefinition?.name ?? 'Unknown';
        if (!breed.classes.has(className)) {
          breed.classes.set(className, { name: className, entries: 0, revenue: 0 });
        }
        const cls = breed.classes.get(className)!;
        cls.entries += 1;
        cls.revenue += ec.fee;
      }
    }
    return Array.from(breedMap.values())
      .sort((a, b) => b.entries - a.entries)
      .map((b) => ({
        ...b,
        classes: Array.from(b.classes.values()).sort((a, c) => c.entries - a.entries),
      }));
  }, [entryReport]);

  function handleExportCsv() {
    // Catalogues are bought as sundry items at the order level, not per
    // entry — the legacy `catalogueRequested` column on entries is dead
    // (always false). Resolve "did this exhibitor buy a catalogue?" via
    // the catalogueOrders feed, which is the same source the on-screen
    // "Catalogue Orders" card already uses.
    const catalogueBuyerEmails = new Set<string>([
      ...(catalogueOrders?.printed ?? []).map((o) => o.email.toLowerCase()),
      ...(catalogueOrders?.online ?? []).map((o) => o.email.toLowerCase()),
    ]);
    const headers = ['Dog', 'Exhibitor', 'Status', 'Classes', 'Fee', 'Catalogue Ordered'];
    const rows = entries.map((e) => [
      e.dog ? formatDogName(e.dog) : 'Unknown',
      e.exhibitor?.name ?? 'Unknown',
      entryStatusConfig[e.status]?.label ?? e.status,
      (e.entryClasses ?? []).map((ec) => ec.showClass?.classDefinition?.name ?? '').join('; '),
      (e.totalFee / 100).toFixed(2),
      e.exhibitor?.email && catalogueBuyerEmails.has(e.exhibitor.email.toLowerCase()) ? 'Yes' : 'No',
    ]);
    downloadCsv(headers, rows, 'financial-report');
  }

  return (
    <div className="space-y-6">
      {/* Summary cards — paid only, sundries included, net of refunds */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <StatCard
          label="Total Income"
          value={<span className="text-green-600 dark:text-green-400">{formatCurrency(stats?.clubReceivablePence ?? 0)}</span>}
          subtext={`${entryBreakdownText} + sundries`}
        />
        <StatCard
          label="Entry Fees"
          value={formatCurrency(stats?.paidEntryFeesPence ?? 0)}
          subtext={entryBreakdownText}
        />
        <StatCard
          label="Awaiting Payment"
          value={<span className="text-amber-600 dark:text-amber-400">{formatCurrency(stats?.pendingClubReceivablePence ?? 0)}</span>}
          subtext={`${stats?.pendingEntries ?? 0} started checkout`}
        />
        <StatCard
          label="Catalogues ordered"
          value={(stats?.paidPrintedCatalogueCount ?? 0) + (stats?.paidOnlineCatalogueCount ?? 0)}
          subtext={`${stats?.paidPrintedCatalogueCount ?? 0} printed · ${stats?.paidOnlineCatalogueCount ?? 0} online`}
        />
      </div>

      {/* Export */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={entries.length === 0}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      {/* Per-class breakdown by sex */}
      {classBreakdown.combined.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Entries by Class</CardTitle>
            <CardDescription>
              Number of entries and revenue per class, broken down by sex
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Dogs */}
                {classBreakdown.dogs.length > 0 && (
                  <>
                    <TableRow className="bg-primary/10">
                      <TableCell colSpan={3} className="font-bold uppercase tracking-wider text-xs">
                        Dogs
                      </TableCell>
                    </TableRow>
                    {classBreakdown.dogs.map((c) => (
                      <TableRow key={`dog-${c.name}`}>
                        <TableCell className="font-medium pl-6">{c.name}</TableCell>
                        <TableCell className="text-right">{c.entries}</TableCell>
                        <TableCell className="text-right">{formatCurrency(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t font-semibold">
                      <TableCell className="pl-6">Subtotal (Dogs)</TableCell>
                      <TableCell className="text-right">{classBreakdown.dogTotals.entries}</TableCell>
                      <TableCell className="text-right">{formatCurrency(classBreakdown.dogTotals.revenue)}</TableCell>
                    </TableRow>
                  </>
                )}
                {/* Bitches */}
                {classBreakdown.bitches.length > 0 && (
                  <>
                    <TableRow className="bg-primary/10">
                      <TableCell colSpan={3} className="font-bold uppercase tracking-wider text-xs">
                        Bitches
                      </TableCell>
                    </TableRow>
                    {classBreakdown.bitches.map((c) => (
                      <TableRow key={`bitch-${c.name}`}>
                        <TableCell className="font-medium pl-6">{c.name}</TableCell>
                        <TableCell className="text-right">{c.entries}</TableCell>
                        <TableCell className="text-right">{formatCurrency(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t font-semibold">
                      <TableCell className="pl-6">Subtotal (Bitches)</TableCell>
                      <TableCell className="text-right">{classBreakdown.bitchTotals.entries}</TableCell>
                      <TableCell className="text-right">{formatCurrency(classBreakdown.bitchTotals.revenue)}</TableCell>
                    </TableRow>
                  </>
                )}
                {/* Junior Handlers */}
                {classBreakdown.juniorHandlers.length > 0 && (
                  <>
                    <TableRow className="bg-primary/10">
                      <TableCell colSpan={3} className="font-bold uppercase tracking-wider text-xs">
                        Junior Handling
                      </TableCell>
                    </TableRow>
                    {classBreakdown.juniorHandlers.map((c) => (
                      <TableRow key={`jh-${c.name}`}>
                        <TableCell className="font-medium pl-6">{c.name}</TableCell>
                        <TableCell className="text-right">{c.entries}</TableCell>
                        <TableCell className="text-right">{formatCurrency(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t font-semibold">
                      <TableCell className="pl-6">Subtotal (Junior Handling)</TableCell>
                      <TableCell className="text-right">{classBreakdown.juniorHandlerTotals.entries}</TableCell>
                      <TableCell className="text-right">{formatCurrency(classBreakdown.juniorHandlerTotals.revenue)}</TableCell>
                    </TableRow>
                  </>
                )}
                {/* Mixed Classes — Veteran (when run mixed-sex), Brace, Team, Stakes etc. */}
                {classBreakdown.mixedClasses.length > 0 && (
                  <>
                    <TableRow className="bg-primary/10">
                      <TableCell colSpan={3} className="font-bold uppercase tracking-wider text-xs">
                        Mixed Classes
                      </TableCell>
                    </TableRow>
                    {classBreakdown.mixedClasses.map((c) => (
                      <TableRow key={`mixed-${c.name}`}>
                        <TableCell className="font-medium pl-6">{c.name}</TableCell>
                        <TableCell className="text-right">{c.entries}</TableCell>
                        <TableCell className="text-right">{formatCurrency(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t font-semibold">
                      <TableCell className="pl-6">Subtotal (Mixed Classes)</TableCell>
                      <TableCell className="text-right">{classBreakdown.mixedClassesTotals.entries}</TableCell>
                      <TableCell className="text-right">{formatCurrency(classBreakdown.mixedClassesTotals.revenue)}</TableCell>
                    </TableRow>
                  </>
                )}
                {/* Grand total */}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total (class entries)</TableCell>
                  <TableCell className="text-right">{classBreakdown.combinedTotals.entries}</TableCell>
                  <TableCell className="text-right">{formatCurrency(classBreakdown.combinedTotals.revenue)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Per-breed breakdown with classes (only for all-breed / group shows) */}
      {breedBreakdown.length > 0 && show?.showScope !== 'single_breed' && (
        <Card>
          <CardHeader>
            <CardTitle>Entries by Breed &amp; Class</CardTitle>
            <CardDescription>
              Breakdown of entries and revenue per breed, with class detail
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Breed / Class</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breedBreakdown.map((b) => (
                  <Fragment key={b.name}>
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-bold">{b.name}</TableCell>
                      <TableCell className="text-right font-bold">{b.entries}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(b.revenue)}</TableCell>
                    </TableRow>
                    {b.classes.map((cls) => (
                      <TableRow key={`${b.name}-${cls.name}`}>
                        <TableCell className="pl-8 text-muted-foreground">{cls.name}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{cls.entries}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(cls.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    {breedBreakdown.reduce((s, b) => s + b.entries, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(breedBreakdown.reduce((s, b) => s + b.revenue, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Sundry items revenue */}
      {sundryReport && sundryReport.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="size-5" />
              Sundry Items Revenue
            </CardTitle>
            <CardDescription>
              Add-on items purchased alongside entries (paid orders only)
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sundryReport.map((item) => (
                  <TableRow key={item.sundryItemId}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">{item.quantitySold}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.totalRevenue)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total Sundry Revenue</TableCell>
                  <TableCell className="text-right">
                    {sundryReport.reduce((s, i) => s + i.quantitySold, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(sundryReport.reduce((s, i) => s + i.totalRevenue, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Breakdown by entry type — paid orders only */}
      <Card>
        <CardHeader>
          <CardTitle>Breakdown by Entry Type</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>Total Fees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Standard Entries</TableCell>
                <TableCell>{standardEntries.length}</TableCell>
                <TableCell>
                  {formatCurrency(
                    standardEntries.reduce((s, e) => s + e.totalFee, 0)
                  )}
                </TableCell>
              </TableRow>
              {jhEntries.length > 0 && (
                <TableRow>
                  <TableCell className="font-medium">Junior Handler</TableCell>
                  <TableCell>{jhEntries.length}</TableCell>
                  <TableCell>
                    {formatCurrency(jhEntries.reduce((s, e) => s + e.totalFee, 0))}
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell className="font-medium">NFC Entries</TableCell>
                <TableCell>{nfcEntries.length}</TableCell>
                <TableCell>
                  {formatCurrency(
                    nfcEntries.reduce((s, e) => s + e.totalFee, 0)
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment status breakdown — all entries from paid orders only */}
      <Card>
        <CardHeader>
          <CardTitle>Entry Status Breakdown</CardTitle>
          <CardDescription>Entries on paid orders only</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(['confirmed', 'withdrawn', 'cancelled'] as const).map((status) => {
                const statusEntries = entries.filter((e) => e.status === status);
                if (statusEntries.length === 0) return null;
                const statusTotal = statusEntries.reduce((s, e) => s + e.totalFee, 0);
                const config = entryStatusConfig[status];
                return (
                  <TableRow key={status}>
                    <TableCell>
                      <Badge variant={config?.variant ?? 'outline'}>
                        {config?.label ?? status}
                      </Badge>
                    </TableCell>
                    <TableCell>{statusEntries.length}</TableCell>
                    <TableCell>{formatCurrency(statusTotal)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Catalogue requests — split by printed vs online */}
      {((catalogueOrders?.printed?.length ?? 0) + (catalogueOrders?.online?.length ?? 0)) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5" />
              Catalogue Orders
            </CardTitle>
            <CardDescription>
              Exhibitors who ordered a catalogue (from sundry items)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {([
              { label: 'Printed', orders: catalogueOrders?.printed ?? [] },
              { label: 'Online', orders: catalogueOrders?.online ?? [] },
            ] as const).filter((g) => g.orders.length > 0).map((g) => (
              <div key={g.label}>
                <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label} ({g.orders.length})
                </h4>
                <div className="space-y-1">
                  {g.orders.map((order, idx) => (
                    <div key={`${g.label}-${idx}`} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{order.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{order.email}</p>
                      </div>
                      {order.quantity > 1 && (
                        <Badge variant="outline">&times;{order.quantity}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Orders & Refunds — one card per paid order, full line-item view */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="size-5" />
            Orders &amp; Refunds
          </CardTitle>
          <CardDescription>
            Each paid order shows every line the exhibitor was charged for.
            &ldquo;Refund entire order&rdquo; returns everything to the exhibitor
            and cancels all entries on the order.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(refundableOrders?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No paid orders yet.
            </p>
          ) : (
            refundableOrders!.map((order) => (
              <OrderRefundCard
                key={order.id}
                order={order}
                onRefundOrder={() => setOrderToRefund(order)}
                onRefundEntry={(entry) => {
                  setPartialRefundEntry(entry);
                  setPartialAmount((entry.totalFee / 100).toFixed(2));
                }}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Full-order refund confirmation */}
      <Dialog
        open={!!orderToRefund}
        onOpenChange={(open) => {
          if (!open) {
            setOrderToRefund(null);
            setRefundReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund entire order?</DialogTitle>
            <DialogDescription>
              {orderToRefund && (() => {
                const succeeded = orderToRefund.payments.find(
                  (p) => p.status === 'succeeded' || p.status === 'partially_refunded'
                );
                const remaining =
                  (succeeded?.amount ?? 0) - (succeeded?.refundAmount ?? 0);
                return (
                  <>
                    This will return <strong>{formatCurrency(remaining)}</strong> to{' '}
                    {orderToRefund.exhibitor?.name ?? 'the exhibitor'} via Stripe and
                    cancel every entry on this order. The club&apos;s share, sundry
                    items, and the platform fee all come back.
                  </>
                );
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Input
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. Exhibitor withdrew from show"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderToRefund(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={orderRefund.isPending}
              onClick={() => {
                if (!orderToRefund) return;
                orderRefund.mutate({
                  orderId: orderToRefund.id,
                  reason: refundReason || undefined,
                });
              }}
            >
              {orderRefund.isPending && <Loader2 className="size-4 animate-spin" />}
              Refund entire order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partial refund on a single entry */}
      <Dialog
        open={!!partialRefundEntry}
        onOpenChange={(open) => {
          if (!open) {
            setPartialRefundEntry(null);
            setRefundReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund entry fee</DialogTitle>
            <DialogDescription>
              {partialRefundEntry?.dog
                ? formatDogName(partialRefundEntry.dog)
                : partialRefundEntry?.juniorHandlerDetails?.handlerName ?? 'Entry'}{' '}
              — entry fee {formatCurrency(partialRefundEntry?.totalFee ?? 0)}.
              Sundry items on this order (catalogue, donations, sponsorships) stay with the exhibitor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Refund amount (GBP)</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={(partialRefundEntry?.totalFee ?? 0) / 100}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g. Withdrew one dog"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartialRefundEntry(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={partialRefund.isPending || !partialAmount}
              onClick={() => {
                if (!partialRefundEntry) return;
                const amountPence = Math.round(parseFloat(partialAmount) * 100);
                partialRefund.mutate({
                  entryId: partialRefundEntry.id,
                  amount: amountPence,
                  reason: refundReason || undefined,
                });
              }}
            >
              {partialRefund.isPending && <Loader2 className="size-4 animate-spin" />}
              Refund entry fee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── OrderRefundCard ────────────────────────────────────────

function OrderRefundCard({
  order,
  onRefundOrder,
  onRefundEntry,
}: {
  order: RefundableOrder;
  onRefundOrder: () => void;
  onRefundEntry: (entry: RefundableEntry) => void;
}) {
  const succeeded = order.payments.find(
    (p) => p.status === 'succeeded' || p.status === 'partially_refunded' || p.status === 'refunded'
  );
  const paid = succeeded?.amount ?? order.totalAmount + order.platformFeePence;
  const refunded = succeeded?.refundAmount ?? 0;
  const remaining = paid - refunded;
  const fullyRefunded = remaining <= 0;

  const entryFeesTotal = order.entries.reduce((s, e) => s + e.totalFee, 0);
  const sundryTotal = order.orderSundryItems.reduce(
    (s, i) => s + i.quantity * i.unitPrice,
    0
  );

  return (
    <div className="rounded-lg border p-4 space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate">
            {order.exhibitor?.name ?? 'Unknown exhibitor'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {order.exhibitor?.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {fullyRefunded ? (
            <Badge variant="outline">Fully refunded</Badge>
          ) : refunded > 0 ? (
            <Badge variant="outline">Partially refunded</Badge>
          ) : null}
          <p className="text-sm font-semibold">{formatCurrency(paid)}</p>
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-1 text-sm">
        {order.entries.map((entry) => {
          const dogName = entry.dog
            ? formatDogName(entry.dog)
            : entry.juniorHandlerDetails?.handlerName
              ? `${entry.juniorHandlerDetails.handlerName} (Junior Handler)`
              : 'Unnamed entry';
          const className = entry.entryClasses
            .map((ec) => ec.showClass?.classDefinition?.name)
            .filter(Boolean)
            .join(', ');
          return (
            <div key={entry.id} className="flex items-center justify-between gap-3 py-1">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {entry.catalogueNumber && (
                    <span className="font-mono text-xs text-muted-foreground mr-2">
                      #{entry.catalogueNumber}
                    </span>
                  )}
                  {dogName}
                  {entry.status !== 'confirmed' && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({entry.status})
                    </span>
                  )}
                </p>
                {className && (
                  <p className="text-xs text-muted-foreground truncate">{className}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm">{formatCurrency(entry.totalFee)}</span>
                {!fullyRefunded && entry.totalFee > 0 && entry.status === 'confirmed' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRefundEntry(entry)}
                    className="h-7 px-2 text-xs"
                  >
                    Refund fee
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {order.orderSundryItems.map((line) => (
          <div key={line.id} className="flex items-center justify-between gap-3 py-1 text-muted-foreground">
            <p className="truncate">
              {line.sundryItem.name}
              {line.quantity > 1 && ` × ${line.quantity}`}
            </p>
            <span>{formatCurrency(line.quantity * line.unitPrice)}</span>
          </div>
        ))}
        {order.platformFeePence > 0 && (
          <div className="flex items-center justify-between gap-3 py-1 text-muted-foreground text-xs">
            <p>Platform fee (£1 + 1%)</p>
            <span>{formatCurrency(order.platformFeePence)}</span>
          </div>
        )}
      </div>

      {/* Totals + actions */}
      <div className="border-t pt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {refunded > 0 && (
            <span>
              Refunded: {formatCurrency(refunded)} of {formatCurrency(paid)}
              {' · '}
              Remaining: {formatCurrency(remaining)}
            </span>
          )}
          {refunded === 0 && (
            <span>
              Entry fees {formatCurrency(entryFeesTotal)}
              {sundryTotal > 0 && ` + sundries ${formatCurrency(sundryTotal)}`}
              {' + platform fee'}
            </span>
          )}
        </div>
        {!fullyRefunded && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onRefundOrder}
            className="min-h-[2.75rem] sm:min-h-0"
          >
            <RotateCcw className="size-3.5" />
            Refund entire order ({formatCurrency(remaining)})
          </Button>
        )}
      </div>
    </div>
  );
}
