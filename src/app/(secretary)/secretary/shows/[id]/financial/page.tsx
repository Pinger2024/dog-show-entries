'use client';

import { use, useState, useMemo } from 'react';
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

export default function FinancialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);
  const { data: stats } = trpc.secretary.getShowStats.useQuery({ showId });
  const { data: entriesData } = trpc.entries.getForShow.useQuery({ showId, limit: 100 });
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

  // Per-class breakdown from entry report
  const classBreakdown = useMemo(() => {
    if (!entryReport) return [];
    const classMap = new Map<string, { name: string; entries: number; revenue: number }>();
    for (const entry of entryReport) {
      if (entry.status === 'cancelled' || entry.status === 'withdrawn') continue;
      for (const ec of entry.entryClasses ?? []) {
        const className = ec.showClass?.classDefinition?.name ?? 'Unknown';
        const existing = classMap.get(className) ?? { name: className, entries: 0, revenue: 0 };
        existing.entries += 1;
        existing.revenue += ec.fee;
        classMap.set(className, existing);
      }
    }
    return Array.from(classMap.values()).sort((a, b) => b.entries - a.entries);
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
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">
              Total Fees
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(stats?.totalRevenue ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              from {stats?.totalEntries ?? 0} entries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">
              Confirmed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(confirmedRevenue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats?.confirmedEntries ?? 0} entries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">
              Pending
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(pendingRevenue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats?.pendingEntries ?? 0} entries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">
              Catalogues
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {catalogueOrders?.length ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              requested
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Export */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={entries.length === 0}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      {/* Per-class breakdown */}
      {classBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Entries by Class</CardTitle>
            <CardDescription>
              Number of entries and revenue per class
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classBreakdown.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">{c.entries}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.revenue)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total (class entries)</TableCell>
                  <TableCell className="text-right">
                    {classBreakdown.reduce((s, c) => s + c.entries, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(classBreakdown.reduce((s, c) => s + c.revenue, 0))}
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
          <CardContent>
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
        <CardContent>
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
        <CardContent>
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

      {/* Catalogue requests */}
      {(catalogueOrders?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5" />
              Catalogue Requests
            </CardTitle>
            <CardDescription>
              Exhibitors who requested a printed catalogue
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Mobile */}
            <div className="space-y-2 sm:hidden">
              {catalogueOrders?.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {entry.exhibitor?.name ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.dog ? formatDogName(entry.dog) : 'Unknown dog'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exhibitor</TableHead>
                    <TableHead>Dog</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalogueOrders?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {entry.exhibitor?.name ?? 'Unknown'}
                      </TableCell>
                      <TableCell>
                        {entry.dog ? formatDogName(entry.dog) : 'Unknown dog'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
              <p className="text-xs text-muted-foreground">
                Max refundable: {formatCurrency(refundEntry?.totalFee ?? 0)}
              </p>
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
              Confirm Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
