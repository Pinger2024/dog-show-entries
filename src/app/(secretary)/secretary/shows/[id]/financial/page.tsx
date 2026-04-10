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
import { type EntryItem, entryStatusConfig, downloadCsv } from '../_lib/show-utils';
import { useShowId } from '../_lib/show-context';

export default function FinancialPage() {
  const showId = useShowId();
  const { data: show } = trpc.shows.getById.useQuery({ id: showId });
  const { data: stats } = trpc.secretary.getShowStats.useQuery({ showId });
  const { data: entriesData } = trpc.entries.getForShow.useQuery({ showId, limit: 500 });
  const { data: entryReport } = trpc.secretary.getEntryReport.useQuery({ showId });
  const { data: catalogueOrders } = trpc.secretary.getCatalogueOrders.useQuery({ showId });
  const { data: sundryReport } = trpc.secretary.getSundryItemReport.useQuery({ showId });
  const entries: EntryItem[] = entriesData?.items ?? [];

  const [refundEntry, setRefundEntry] = useState<EntryItem | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const utils = trpc.useUtils();

  const refundMutation = trpc.secretary.issueRefund.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.fullyRefunded
          ? `Full refund of ${formatCurrency(data.amount)} issued — entry cancelled`
          : `Partial refund of ${formatCurrency(data.amount)} issued`
      );
      setRefundEntry(null);
      setRefundAmount('');
      setRefundReason('');
      utils.entries.getForShow.invalidate({ showId });
      utils.secretary.getShowStats.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to issue refund'),
  });

  const confirmedRevenue = entries
    .filter((e) => e.status === 'confirmed')
    .reduce((sum, e) => sum + e.totalFee, 0);

  const pendingRevenue = entries
    .filter((e) => e.status === 'pending')
    .reduce((sum, e) => sum + e.totalFee, 0);

  const nfcEntries = entries.filter((e) => e.isNfc);
  const standardEntries = entries.filter((e) => !e.isNfc);

  const confirmedEntries = entries.filter((e) => e.status === 'confirmed');
  const refundableEntries = confirmedEntries.filter(
    (e) => e.paymentIntentId || e.payments?.some((p) => p.stripePaymentId)
  );

  type ClassBreakdownItem = { name: string; entries: number; revenue: number };
  type ClassTotals = { entries: number; revenue: number };
  const sumTotals = (items: ClassBreakdownItem[]): ClassTotals =>
    items.reduce((s, c) => ({ entries: s.entries + c.entries, revenue: s.revenue + c.revenue }), { entries: 0, revenue: 0 });

  // Per-class breakdown from entry report, grouped by sex.
  // Junior Handling classes have sex === null but should still appear in
  // the breakdown — they get their own bucket alongside Dogs and Bitches.
  const classBreakdown = useMemo(() => {
    const empty = {
      dogs: [] as ClassBreakdownItem[],
      bitches: [] as ClassBreakdownItem[],
      juniorHandlers: [] as ClassBreakdownItem[],
      combined: [] as ClassBreakdownItem[],
      dogTotals: { entries: 0, revenue: 0 },
      bitchTotals: { entries: 0, revenue: 0 },
      juniorHandlerTotals: { entries: 0, revenue: 0 },
      combinedTotals: { entries: 0, revenue: 0 },
    };
    if (!entryReport) return empty;
    const dogMap = new Map<string, ClassBreakdownItem>();
    const bitchMap = new Map<string, ClassBreakdownItem>();
    const jhMap = new Map<string, ClassBreakdownItem>();
    const combinedMap = new Map<string, ClassBreakdownItem>();
    for (const entry of entryReport) {
      if (entry.status === 'cancelled' || entry.status === 'withdrawn') continue;
      for (const ec of entry.entryClasses ?? []) {
        const className = ec.showClass?.classDefinition?.name ?? 'Unknown';
        const sex = ec.showClass?.sex;
        const classType = ec.showClass?.classDefinition?.type;
        const combined = combinedMap.get(className) ?? { name: className, entries: 0, revenue: 0 };
        combined.entries += 1;
        combined.revenue += ec.fee;
        combinedMap.set(className, combined);
        // Bucket selection: junior handler classes are never sex-keyed
        // (sex is null), so we have to check the class type explicitly
        // before falling back to the sex check. Without this JH entries
        // were silently dropped from the breakdown — Amanda flagged it
        // testing the Final Test Show.
        const targetMap =
          classType === 'junior_handler'
            ? jhMap
            : sex === 'dog'
              ? dogMap
              : sex === 'bitch'
                ? bitchMap
                : null;
        if (targetMap) {
          const existing = targetMap.get(className) ?? { name: className, entries: 0, revenue: 0 };
          existing.entries += 1;
          existing.revenue += ec.fee;
          targetMap.set(className, existing);
        }
      }
    }
    const sortByEntries = (a: ClassBreakdownItem, b: ClassBreakdownItem) => b.entries - a.entries;
    const dogs = Array.from(dogMap.values()).sort(sortByEntries);
    const bitches = Array.from(bitchMap.values()).sort(sortByEntries);
    const juniorHandlers = Array.from(jhMap.values()).sort(sortByEntries);
    const combined = Array.from(combinedMap.values()).sort(sortByEntries);
    return {
      dogs,
      bitches,
      juniorHandlers,
      combined,
      dogTotals: sumTotals(dogs),
      bitchTotals: sumTotals(bitches),
      juniorHandlerTotals: sumTotals(juniorHandlers),
      combinedTotals: sumTotals(combined),
    };
  }, [entryReport]);

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
    const headers = ['Dog', 'Exhibitor', 'Status', 'Classes', 'Fee', 'Catalogue Requested'];
    const rows = entries.map((e) => [
      e.dog ? formatDogName(e.dog) : 'Unknown',
      e.exhibitor?.name ?? 'Unknown',
      entryStatusConfig[e.status]?.label ?? e.status,
      (e.entryClasses ?? []).map((ec) => ec.showClass?.classDefinition?.name ?? '').join('; '),
      (e.totalFee / 100).toFixed(2),
      e.catalogueRequested ? 'Yes' : 'No',
    ]);
    downloadCsv(headers, rows, 'financial-report');
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <StatCard
          label="Total Fees"
          value={formatCurrency(stats?.totalRevenue ?? 0)}
          subtext={`from ${stats?.totalEntries ?? 0} entries`}
        />
        <StatCard
          label="Confirmed"
          value={<span className="text-green-600 dark:text-green-400">{formatCurrency(confirmedRevenue)}</span>}
          subtext={`${stats?.confirmedEntries ?? 0} entries`}
        />
        <StatCard
          label="Pending"
          value={<span className="text-amber-600 dark:text-amber-400">{formatCurrency(pendingRevenue)}</span>}
          subtext={`${stats?.pendingEntries ?? 0} entries`}
        />
        <StatCard
          label="Catalogues"
          value={(catalogueOrders?.printed?.length ?? 0) + (catalogueOrders?.online?.length ?? 0)}
          subtext={`${catalogueOrders?.printed?.length ?? 0} printed · ${catalogueOrders?.online?.length ?? 0} online`}
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

      {/* Breakdown by entry type */}
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

      {/* Payment status breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Status Breakdown</CardTitle>
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
              {(['confirmed', 'pending', 'withdrawn', 'cancelled'] as const).map(
                (status) => {
                  const statusEntries = entries.filter(
                    (e) => e.status === status
                  );
                  const statusTotal = statusEntries.reduce(
                    (s, e) => s + e.totalFee,
                    0
                  );
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
                }
              )}
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

      {/* Refund Management */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="size-5" />
                Issue Refund
              </CardTitle>
              <CardDescription>
                Refund a confirmed entry via Stripe. Full refunds auto-cancel the entry.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {refundableEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No confirmed entries with Stripe payments available for refund.
            </p>
          ) : (
            <>
            {/* Mobile card view */}
            <div className="space-y-2 sm:hidden">
              {refundableEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {entry.dog ? formatDogName(entry.dog) : 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cat #{entry.catalogueNumber ?? '—'} &middot; {formatCurrency(entry.totalFee)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[2.75rem] shrink-0"
                    onClick={() => {
                      setRefundEntry(entry);
                      setRefundAmount((entry.totalFee / 100).toFixed(2));
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                    Refund
                  </Button>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cat #</TableHead>
                    <TableHead>Dog</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refundableEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {entry.catalogueNumber ?? '—'}
                      </TableCell>
                      <TableCell>{entry.dog ? formatDogName(entry.dog) : 'Unknown'}</TableCell>
                      <TableCell>{formatCurrency(entry.totalFee)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRefundEntry(entry);
                            setRefundAmount((entry.totalFee / 100).toFixed(2));
                          }}
                        >
                          <RotateCcw className="size-3.5" />
                          Refund
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Refund dialog */}
      <Dialog open={!!refundEntry} onOpenChange={(open) => !open && setRefundEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Refund</DialogTitle>
            <DialogDescription>
              Refunding {refundEntry?.dog ? formatDogName(refundEntry.dog) : ''} — entry fee {formatCurrency(refundEntry?.totalFee ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Full Refund shortcut */}
            <Button
              variant="destructive"
              className="w-full min-h-[2.75rem]"
              disabled={refundMutation.isPending}
              onClick={() => {
                if (!refundEntry) return;
                refundMutation.mutate({
                  entryId: refundEntry.id,
                  amount: refundEntry.totalFee,
                  reason: 'Full refund',
                });
              }}
            >
              {refundMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Full Refund — {formatCurrency(refundEntry?.totalFee ?? 0)}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or partial refund</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (GBP)</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={(refundEntry?.totalFee ?? 0) / 100}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="e.g. 5.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g. Exhibitor withdrew"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundEntry(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={refundMutation.isPending || !refundAmount}
              onClick={() => {
                if (!refundEntry) return;
                const amountPence = Math.round(parseFloat(refundAmount) * 100);
                refundMutation.mutate({
                  entryId: refundEntry.id,
                  amount: amountPence,
                  reason: refundReason || undefined,
                });
              }}
            >
              {refundMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Partial Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
