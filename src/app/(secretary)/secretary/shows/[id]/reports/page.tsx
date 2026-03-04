'use client';

import { use, useState, useMemo } from 'react';
import {
  BookOpen,
  ClipboardList,
  Download,
  FileText,
  History,
  Loader2,
  PoundSterling,
  Search,
  Users,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { entryStatusConfig, formatDate, downloadCsv } from '../_lib/show-utils';

export default function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);

  return (
    <Tabs defaultValue="entries" className="space-y-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="entries" className="gap-1.5 text-xs sm:text-sm">
          <FileText className="size-3.5 hidden sm:block" />
          Entries
        </TabsTrigger>
        <TabsTrigger value="payments" className="gap-1.5 text-xs sm:text-sm">
          <PoundSterling className="size-3.5 hidden sm:block" />
          <span className="sm:hidden">Pay</span>
          <span className="hidden sm:inline">Payments</span>
        </TabsTrigger>
        <TabsTrigger value="catalogue" className="gap-1.5 text-xs sm:text-sm">
          <BookOpen className="size-3.5 hidden sm:block" />
          <span className="sm:hidden">Cat.</span>
          <span className="hidden sm:inline">Catalogues</span>
        </TabsTrigger>
        <TabsTrigger value="audit" className="gap-1.5 text-xs sm:text-sm">
          <History className="size-3.5 hidden sm:block" />
          <span className="sm:hidden">Audit</span>
          <span className="hidden sm:inline">Audit Log</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="entries">
        <EntryReportContent showId={showId} />
      </TabsContent>
      <TabsContent value="payments">
        <PaymentReportContent showId={showId} />
      </TabsContent>
      <TabsContent value="catalogue">
        <CatalogueOrdersContent showId={showId} />
      </TabsContent>
      <TabsContent value="audit">
        <AuditLogViewer showId={showId} />
      </TabsContent>
    </Tabs>
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
  const [search, setSearch] = useState('');
  const [groupByExhibitor, setGroupByExhibitor] = useState(false);

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.exhibitor?.name.toLowerCase().includes(q) ||
        e.dog?.registeredName?.toLowerCase().includes(q) ||
        e.dog?.breed?.name?.toLowerCase().includes(q)
    );
  }, [entries, search]);

  // Group entries by exhibitor
  const exhibitorGroups = useMemo(() => {
    if (!groupByExhibitor) return null;
    const groups = new Map<string, {
      name: string;
      email: string;
      entries: typeof filtered;
      totalFee: number;
    }>();
    for (const entry of filtered) {
      const key = entry.exhibitor?.email ?? 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          name: entry.exhibitor?.name ?? '—',
          email: key,
          entries: [],
          totalFee: 0,
        });
      }
      const group = groups.get(key)!;
      group.entries.push(entry);
      group.totalFee += entry.totalFee;
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, groupByExhibitor]);

  // Summary stats
  const stats = useMemo(() => {
    if (!entries) return null;
    const confirmed = entries.filter((e) => e.status === 'confirmed').length;
    const pending = entries.filter((e) => e.status === 'pending').length;
    const totalRevenue = entries.reduce((sum, e) => sum + e.totalFee, 0);
    const uniqueExhibitors = new Set(entries.map((e) => e.exhibitor?.email)).size;
    return { total: entries.length, confirmed, pending, totalRevenue, uniqueExhibitors };
  }, [entries]);

  function exportCsv() {
    if (!filtered) return;
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
    const rows = filtered.map((e) => [
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
    <div className="space-y-4">
      {/* Summary stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs font-medium text-muted-foreground">Total Entries</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs font-medium text-muted-foreground">Confirmed</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.confirmed}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs font-medium text-muted-foreground">Exhibitors</p>
              <p className="text-2xl font-bold">{stats.uniqueExhibitors}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs font-medium text-muted-foreground">Total Fees</p>
              <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              Entry Report {filtered.length !== (entries?.length ?? 0) ? `(${filtered.length} of ${entries?.length ?? 0})` : `(${entries?.length ?? 0})`}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56 sm:flex-initial">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Button
                variant={groupByExhibitor ? 'default' : 'outline'}
                size="sm"
                onClick={() => setGroupByExhibitor(!groupByExhibitor)}
                title="Group entries by exhibitor"
              >
                <Users className="size-4" />
                <span className="hidden sm:inline">By Exhibitor</span>
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="size-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? 'No entries match your search.' : 'No entries yet.'}
            </p>
          ) : groupByExhibitor && exhibitorGroups ? (
            /* Grouped by exhibitor view */
            <div className="space-y-4">
              {exhibitorGroups.map((group) => (
                <div key={group.email} className="rounded-lg border">
                  <div className="flex items-center justify-between bg-muted/50 px-3 py-2.5 sm:px-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{group.name}</p>
                      <p className="text-xs text-muted-foreground">{group.email}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium">{formatCurrency(group.totalFee)}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y">
                    {group.entries.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">
                              {entry.dog?.registeredName ?? 'Junior Handler'}
                            </p>
                            {entry.isNfc && (
                              <Badge variant="outline" className="text-[10px]">NFC</Badge>
                            )}
                            <Badge
                              variant={entryStatusConfig[entry.status]?.variant ?? 'outline'}
                              className="text-[10px]"
                            >
                              {entryStatusConfig[entry.status]?.label ?? entry.status}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {entry.dog?.breed?.name ?? '—'}
                            {entry.dog?.sex ? ` · ${entry.dog.sex}` : ''}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {entry.entryClasses.map((ec, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">
                                {ec.showClass?.classDefinition?.name ?? '?'}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium">{formatCurrency(entry.totalFee)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(entry.entryDate)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="space-y-3 sm:hidden">
                {filtered.map((entry) => (
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
                      <TableHead className="hidden lg:table-cell">Sex</TableHead>
                      <TableHead>Classes</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDate(entry.entryDate)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{entry.exhibitor?.name ?? '—'}</p>
                            <p className="text-xs text-muted-foreground">{entry.exhibitor?.email ?? ''}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.dog?.registeredName ?? 'Junior Handler'}
                          {entry.isNfc && (
                            <Badge variant="outline" className="ml-1.5 text-[10px]">NFC</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{entry.dog?.breed?.name ?? '—'}</TableCell>
                        <TableCell className="hidden lg:table-cell capitalize">{entry.dog?.sex ?? '—'}</TableCell>
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
                            variant={entryStatusConfig[entry.status]?.variant ?? 'outline'}
                          >
                            {entryStatusConfig[entry.status]?.label ?? entry.status}
                          </Badge>
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
    </div>
  );
}

function PaymentReportContent({ showId }: { showId: string }) {
  const { data, isLoading } =
    trpc.secretary.getPaymentReport.useQuery({ showId });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!data?.entries) return [];
    if (!search) return data.entries;
    const q = search.toLowerCase();
    return data.entries.filter(
      (e) =>
        e.exhibitor?.name.toLowerCase().includes(q) ||
        e.dog?.registeredName?.toLowerCase().includes(q)
    );
  }, [data, search]);

  function exportCsv() {
    if (!filtered) return;
    const headers = [
      'Exhibitor',
      'Email',
      'Dog',
      'Status',
      'Fee (£)',
      'Payment Method',
      'Payments',
    ];
    const rows = filtered.map((e) => [
      e.exhibitor?.name ?? '',
      e.exhibitor?.email ?? '',
      e.dog?.registeredName ?? 'Junior Handler',
      e.status,
      (e.totalFee / 100).toFixed(2),
      e.paymentMethod ?? '',
      e.payments.map((p) => `${p.status}: £${(p.amount / 100).toFixed(2)}`).join('; '),
    ]);

    downloadCsv(headers, rows, `payment-report-${showId}`);
  }

  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Total Revenue</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(data?.summary.totalRevenue ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Paid</p>
            <p className="text-2xl font-bold">{data?.summary.paidCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {data?.summary.pendingCount ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Total Entries</p>
            <p className="text-2xl font-bold">{data?.summary.totalEntries ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Payment Report</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56 sm:flex-initial">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="size-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? 'No payments match your search.' : 'No entries yet.'}
            </p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="space-y-3 sm:hidden">
                {filtered.map((entry) => {
                  const entryTotal = entry.totalFee + (entry.sundryTotal ?? 0);
                  return (
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
                        <div>
                          <span className="font-medium">{formatCurrency(entryTotal)}</span>
                          {(entry.sundryTotal ?? 0) > 0 && (
                            <span className="ml-1 text-muted-foreground">
                              (incl. {formatCurrency(entry.sundryTotal ?? 0)} add-ons)
                            </span>
                          )}
                        </div>
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
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exhibitor</TableHead>
                      <TableHead>Dog</TableHead>
                      <TableHead>Entry Fee</TableHead>
                      <TableHead>Add-ons</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((entry) => {
                      const entryTotal = entry.totalFee + (entry.sundryTotal ?? 0);
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{entry.exhibitor?.name ?? '—'}</p>
                              <p className="text-xs text-muted-foreground">{entry.exhibitor?.email ?? ''}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {entry.dog?.registeredName ?? 'Junior Handler'}
                          </TableCell>
                          <TableCell>{formatCurrency(entry.totalFee)}</TableCell>
                          <TableCell>
                            {(entry.sundryTotal ?? 0) > 0
                              ? formatCurrency(entry.sundryTotal ?? 0)
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="font-medium">{formatCurrency(entryTotal)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={entryStatusConfig[entry.status]?.variant ?? 'outline'}
                            >
                              {entryStatusConfig[entry.status]?.label ?? entry.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
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
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CatalogueOrdersContent({ showId }: { showId: string }) {
  const { data, isLoading } =
    trpc.secretary.getCatalogueOrders.useQuery({ showId });

  if (isLoading) return <LoadingCard />;

  const printed = data?.printed ?? [];
  const online = data?.online ?? [];
  const totalOrders = printed.length + online.length;

  function exportCsv() {
    const headers = ['Type', 'Name', 'Email', 'Quantity'];
    const rows = [
      ...printed.map((p) => ['Printed', p.name, p.email, String(p.quantity)]),
      ...online.map((o) => ['Online', o.name, o.email, String(o.quantity)]),
    ];
    downloadCsv(headers, rows, `catalogue-orders-${showId}`);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Total Orders</p>
            <p className="text-2xl font-bold">{totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Printed</p>
            <p className="text-2xl font-bold">{printed.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Online</p>
            <p className="text-2xl font-bold">{online.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Printed Catalogues */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">Printed Catalogues ({printed.length})</CardTitle>
              <CardDescription>
                Exhibitors who ordered a printed catalogue
              </CardDescription>
            </div>
            {totalOrders > 0 && (
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="size-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {printed.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No printed catalogue orders.
            </p>
          ) : (
            <>
              <div className="space-y-2 sm:hidden">
                {printed.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                    <ClipboardList className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      {p.quantity > 1 && (
                        <p className="text-xs text-muted-foreground">Qty: {p.quantity}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {printed.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Online Catalogues */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Online Catalogues ({online.length})</CardTitle>
          <CardDescription>
            Exhibitors who ordered online access — use these email addresses to send the digital catalogue
          </CardDescription>
        </CardHeader>
        <CardContent>
          {online.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No online catalogue orders.
            </p>
          ) : (
            <>
              <div className="space-y-2 sm:hidden">
                {online.map((o, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                    <BookOpen className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{o.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{o.email}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {online.map((o, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell>{o.email}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditLogViewer({ showId }: { showId: string }) {
  const { data: auditLog, isLoading } =
    trpc.secretary.getAuditLog.useQuery({ showId });

  if (isLoading) return <LoadingCard />;

  const actionConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    created: { label: 'Created', variant: 'default' },
    classes_changed: { label: 'Classes Changed', variant: 'secondary' },
    handler_changed: { label: 'Handler Changed', variant: 'secondary' },
    withdrawn: { label: 'Withdrawn', variant: 'destructive' },
    reinstated: { label: 'Reinstated', variant: 'outline' },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit Log</CardTitle>
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
          <div className="space-y-2">
            {auditLog?.map((log) => {
              const config = actionConfig[log.action] ?? { label: log.action, variant: 'outline' as const };
              return (
                <div
                  key={log.id}
                  className="flex flex-col gap-1 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Badge variant={config.variant} className="shrink-0">
                      {config.label}
                    </Badge>
                    <span className="font-medium truncate">
                      {log.entry?.dog?.registeredName ?? 'Unknown dog'}
                    </span>
                    <span className="text-sm text-muted-foreground truncate">
                      {log.entry?.exhibitor?.name ?? 'Unknown'}
                    </span>
                    {log.reason && (
                      <span className="text-xs text-muted-foreground italic hidden sm:inline">
                        — {log.reason}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </span>
                  {log.reason && (
                    <p className="text-xs text-muted-foreground italic sm:hidden">
                      {log.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
