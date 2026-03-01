'use client';

import { use, useState } from 'react';
import {
  BookOpen,
  Download,
  FileText,
  Loader2,
  PoundSterling,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { entryStatusConfig, formatDate, downloadCsv } from '../_lib/show-utils';

export default function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);
  const [activeReport, setActiveReport] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Report cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={() =>
            setActiveReport(activeReport === 'entries' ? null : 'entries')
          }
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                <FileText className="size-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">Entry Report</CardTitle>
                <CardDescription>
                  Full entry list with exhibitor, dog, classes, and fees
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={() =>
            setActiveReport(activeReport === 'payments' ? null : 'payments')
          }
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950">
                <PoundSterling className="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base">Payment Report</CardTitle>
                <CardDescription>
                  Revenue breakdown by status with payment reconciliation
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={() =>
            setActiveReport(
              activeReport === 'catalogueOrders' ? null : 'catalogueOrders'
            )
          }
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-950">
                <BookOpen className="size-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-base">Catalogue Orders</CardTitle>
                <CardDescription>
                  Entries that requested a printed catalogue
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Active report content */}
      {activeReport === 'entries' && <EntryReportContent showId={showId} />}
      {activeReport === 'payments' && <PaymentReportContent showId={showId} />}
      {activeReport === 'catalogueOrders' && (
        <CatalogueOrdersContent showId={showId} />
      )}

      {/* Audit Log */}
      <AuditLogViewer showId={showId} />
    </div>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function EntryReportContent({ showId }: { showId: string }) {
  const { data: entries, isLoading } =
    trpc.secretary.getEntryReport.useQuery({ showId });

  function exportCsv() {
    if (!entries) return;
    const headers = [
      'Entry Date',
      'Status',
      'Exhibitor',
      'Email',
      'Dog',
      'Breed',
      'Group',
      'Sex',
      'Classes',
      'Fee (£)',
      'NFC',
    ];
    const rows = entries.map((e) => [
      formatDate(e.entryDate),
      e.status,
      e.exhibitor?.name ?? '',
      e.exhibitor?.email ?? '',
      e.dog?.registeredName ?? 'Junior Handler',
      e.dog?.breed?.name ?? '',
      e.dog?.breed?.group?.name ?? '',
      e.dog?.sex ?? '',
      e.entryClasses
        .map((ec) => ec.showClass?.classDefinition?.name ?? '')
        .filter(Boolean)
        .join('; '),
      (e.totalFee / 100).toFixed(2),
      e.isNfc ? 'Yes' : 'No',
    ]);

    downloadCsv(headers, rows, `entry-report-${showId}`);
  }

  if (isLoading) return <LoadingCard />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>Entry Report ({entries?.length ?? 0} entries)</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile card view */}
        <div className="space-y-3 sm:hidden">
          {entries?.map((entry) => (
            <div key={entry.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">
                    {entry.dog?.registeredName ?? 'Junior Handler'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {entry.exhibitor?.name ?? '—'} · {entry.dog?.breed?.name ?? '—'}
                  </p>
                </div>
                <Badge
                  variant={entryStatusConfig[entry.status]?.variant ?? 'outline'}
                  className="shrink-0"
                >
                  {entryStatusConfig[entry.status]?.label ?? entry.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {entry.entryClasses.map((ec, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    {ec.showClass?.classDefinition?.name ?? '?'}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDate(entry.entryDate)}</span>
                <span className="font-medium text-foreground">{formatCurrency(entry.totalFee)}</span>
              </div>
            </div>
          ))}
        </div>
        {/* Desktop table */}
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Exhibitor</TableHead>
                <TableHead>Dog</TableHead>
                <TableHead className="hidden md:table-cell">Breed</TableHead>
                <TableHead>Classes</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries?.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(entry.entryDate)}
                  </TableCell>
                  <TableCell>{entry.exhibitor?.name ?? '—'}</TableCell>
                  <TableCell>
                    {entry.dog?.registeredName ?? 'Junior Handler'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{entry.dog?.breed?.name ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {entry.entryClasses.map((ec, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">
                          {ec.showClass?.classDefinition?.name ?? '?'}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(entry.totalFee)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        entryStatusConfig[entry.status]?.variant ?? 'outline'
                      }
                    >
                      {entryStatusConfig[entry.status]?.label ?? entry.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentReportContent({ showId }: { showId: string }) {
  const { data, isLoading } =
    trpc.secretary.getPaymentReport.useQuery({ showId });

  function exportCsv() {
    if (!data) return;
    const headers = [
      'Exhibitor',
      'Dog',
      'Status',
      'Fee (£)',
      'Payments',
    ];
    const rows = data.entries.map((e) => [
      e.exhibitor?.name ?? '',
      e.dog?.registeredName ?? 'Junior Handler',
      e.status,
      (e.totalFee / 100).toFixed(2),
      e.payments.map((p) => `${p.status}: £${(p.amount / 100).toFixed(2)}`).join('; '),
    ]);

    downloadCsv(headers, rows, `payment-report-${showId}`);
  }

  if (isLoading) return <LoadingCard />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Payment Report</CardTitle>
            <CardDescription>
              {data?.summary.totalEntries} entries, {data?.summary.paidCount}{' '}
              paid, {data?.summary.pendingCount} pending
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950/30">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-lg font-bold text-green-700 dark:text-green-400">
              {formatCurrency(data?.summary.totalRevenue ?? 0)}
            </p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
              {data?.summary.paidCount ?? 0} entries
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
              {data?.summary.pendingCount ?? 0} entries
            </p>
          </div>
        </div>

        {/* Mobile card view */}
        <div className="space-y-3 sm:hidden">
          {data?.entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{entry.exhibitor?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {entry.dog?.registeredName ?? 'Junior Handler'}
                  </p>
                </div>
                <Badge
                  variant={entryStatusConfig[entry.status]?.variant ?? 'outline'}
                  className="shrink-0"
                >
                  {entryStatusConfig[entry.status]?.label ?? entry.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{formatCurrency(entry.totalFee)}</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {entry.payments.map((p, i) => (
                    <Badge
                      key={i}
                      variant={p.status === 'succeeded' ? 'default' : 'outline'}
                      className="text-[10px]"
                    >
                      £{(p.amount / 100).toFixed(2)} ({p.status})
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Desktop table */}
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exhibitor</TableHead>
                <TableHead>Dog</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.exhibitor?.name ?? '—'}</TableCell>
                  <TableCell>
                    {entry.dog?.registeredName ?? 'Junior Handler'}
                  </TableCell>
                  <TableCell>{formatCurrency(entry.totalFee)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        entryStatusConfig[entry.status]?.variant ?? 'outline'
                      }
                    >
                      {entryStatusConfig[entry.status]?.label ?? entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {entry.payments.map((p, i) => (
                        <Badge
                          key={i}
                          variant={
                            p.status === 'succeeded' ? 'default' : 'outline'
                          }
                          className="text-[10px]"
                        >
                          £{(p.amount / 100).toFixed(2)} ({p.status})
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CatalogueOrdersContent({ showId }: { showId: string }) {
  const { data: orders, isLoading } =
    trpc.secretary.getCatalogueOrders.useQuery({ showId });

  if (isLoading) return <LoadingCard />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catalogue Orders ({orders?.length ?? 0})</CardTitle>
        <CardDescription>
          Entries that requested a printed catalogue
        </CardDescription>
      </CardHeader>
      <CardContent>
        {(orders?.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No catalogue orders yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exhibitor</TableHead>
                <TableHead>Dog</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders?.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.exhibitor?.name ?? '—'}</TableCell>
                  <TableCell>
                    {entry.dog?.registeredName ?? 'Junior Handler'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AuditLogViewer({ showId }: { showId: string }) {
  const { data: auditLog, isLoading } =
    trpc.secretary.getAuditLog.useQuery({ showId });

  if (isLoading) return <LoadingCard />;

  const actionLabels: Record<string, string> = {
    created: 'Created',
    classes_changed: 'Classes Changed',
    handler_changed: 'Handler Changed',
    withdrawn: 'Withdrawn',
    reinstated: 'Reinstated',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
        <CardDescription>
          Change history for entries in this show
        </CardDescription>
      </CardHeader>
      <CardContent>
        {(auditLog?.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No audit log entries yet.
          </p>
        ) : (
          <div className="space-y-3">
            {auditLog?.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">
                      {actionLabels[log.action] ?? log.action}
                    </Badge>
                    <span className="font-medium truncate">
                      {log.entry?.dog?.registeredName ?? 'Unknown dog'}
                    </span>
                    <span className="text-muted-foreground truncate">
                      ({log.entry?.exhibitor?.name ?? 'Unknown'})
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </span>
                </div>
                {log.reason && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reason: {log.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
