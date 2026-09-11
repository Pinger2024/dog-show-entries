'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ClipboardList,
  FileText,
  FolderOpen,
  History,
  Loader2,
  PoundSterling,
  Search,
  UserX,
  Users,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/lib/date-utils';
import { membershipClaimLabel } from '@/lib/report-rows';
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
import { StatCard } from '@/components/ui/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { entryStatusConfig, formatDate } from '../_lib/show-utils';
import { useShowId } from '../_lib/show-context';
import type { RouterOutputs } from '@/server/trpc/router';

/** Printing and downloads moved to Documents & Reports (reports-merge) —
 * these tabs keep their on-screen tables, but every export now lives on
 * one page, always available regardless of show phase. */
function DownloadsMovedNote({ showId }: { showId: string }) {
  return (
    <Link
      href={`/secretary/shows/${showId}/documents`}
      className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted min-h-[2.75rem]"
    >
      <FolderOpen className="size-4 shrink-0" />
      Downloads have moved to Documents &amp; Reports
    </Link>
  );
}

type ReportRow = RouterOutputs['secretary']['getPaymentReport']['rows'][number];

/**
 * Groups consecutive rows by `orderId` so the UI can render each
 * order as one "receipt" (entries + sundry together) with a single
 * payment attached at the group level. Preserves row order within
 * each group. Rows with no orderId each land in their own group so
 * they still render.
 */
function groupByOrder(rows: ReportRow[]): Array<{
  key: string;
  rows: ReportRow[];
  payments: ReportRow['payments'];
  orderTotal: number;
}> {
  const groups: Array<{ key: string; rows: ReportRow[]; payments: ReportRow['payments']; orderTotal: number }> = [];
  const byOrder = new Map<string, { key: string; rows: ReportRow[]; payments: ReportRow['payments']; orderTotal: number }>();
  for (const row of rows) {
    if (!row.orderId) {
      groups.push({ key: row.id, rows: [row], payments: row.payments, orderTotal: row.total });
      continue;
    }
    const existing = byOrder.get(row.orderId);
    if (existing) {
      existing.rows.push(row);
      existing.orderTotal += row.total;
      if (row.payments.length > 0) existing.payments = row.payments;
    } else {
      const group = { key: row.orderId, rows: [row], payments: row.payments, orderTotal: row.total };
      byOrder.set(row.orderId, group);
      groups.push(group);
    }
  }
  return groups;
}

export default function ReportsPage() {
  const showId = useShowId();

  return (
    <Tabs defaultValue="entries" className="space-y-4">
      <TabsList className="lg:grid lg:w-full lg:grid-cols-6">
        <TabsTrigger value="entries" className="gap-1.5 text-xs sm:text-sm">
          <FileText className="size-3.5 hidden sm:block" />
          Entries
        </TabsTrigger>
        <TabsTrigger value="payments" className="gap-1.5 text-xs sm:text-sm">
          <PoundSterling className="size-3.5 hidden sm:block" />
          <span className="sm:hidden">Pay</span>
          <span className="hidden sm:inline">Payments</span>
        </TabsTrigger>
        <TabsTrigger value="absentees" className="gap-1.5 text-xs sm:text-sm">
          <UserX className="size-3.5 hidden sm:block" />
          <span className="sm:hidden">Abs.</span>
          <span className="hidden sm:inline">Absentees</span>
        </TabsTrigger>
        <TabsTrigger value="catalogue" className="gap-1.5 text-xs sm:text-sm">
          <BookOpen className="size-3.5 hidden sm:block" />
          <span className="sm:hidden">Cat.</span>
          <span className="hidden sm:inline">Catalogues</span>
        </TabsTrigger>
        <TabsTrigger value="extras" className="gap-1.5 text-xs sm:text-sm">
          <ClipboardList className="size-3.5 hidden sm:block" />
          <span className="sm:hidden">Extras</span>
          <span className="hidden sm:inline">Extras Summary</span>
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
      <TabsContent value="absentees">
        <AbsenteeReportContent showId={showId} />
      </TabsContent>
      <TabsContent value="catalogue">
        <CatalogueOrdersContent showId={showId} />
      </TabsContent>
      <TabsContent value="extras">
        <ExtrasSummaryContent showId={showId} />
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
  // Headline figures come from the ONE canonical calculation — the same one the
  // show page and the dashboard read. This page used to count the rows of its
  // own list, a FOURTH definition of "entries", so it read 91 while the show
  // page read 110 (Mandy 2026-07-27: "Still seeing that 91, should I be").
  const { data: showStats } = trpc.secretary.getShowStats.useQuery({ showId });
  const [search, setSearch] = useState('');
  const [groupByExhibitor, setGroupByExhibitor] = useState(false);

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.exhibitor?.name?.toLowerCase().includes(q) ||
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

  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      <DownloadsMovedNote showId={showId} />
      {/* Summary stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* "Entries" and "Dogs" are the canonical figures, not a count of the
              rows below — the list carries one row per entry, and a dog that
              bought a Special Award separately has two. "Total Entries 91" over
              a show announcing 110 was the fourth screen to invent its own
              answer (Mandy 2026-07-27). */}
          <StatCard
            label="Entries"
            value={<span className="text-se-fresh-deep">{showStats?.classEntries ?? stats.total}</span>}
          />
          <StatCard label="Dogs" value={showStats?.dogCount ?? stats.confirmed} />
          <StatCard label="Exhibitors" value={stats.uniqueExhibitors} />
          <StatCard label="Total Fees" value={formatCurrency(stats.totalRevenue)} />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Says what the list is counting. One row per entry, so a dog that
                bought a Special Award separately appears twice — which is why
                this can differ from both the entries and dogs figures above. */}
            <CardTitle className="text-base">
              Entry Report{' '}
              {filtered.length !== (entries?.length ?? 0)
                ? `(${filtered.length} of ${entries?.length ?? 0} entry records)`
                : `(${entries?.length ?? 0} entry records)`}
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
                              <Badge variant="outline" className="text-xs">NFC</Badge>
                            )}
                            {membershipClaimLabel(entry.order) && (
                              <Badge variant="outline" className="text-xs">
                                {membershipClaimLabel(entry.order)}
                              </Badge>
                            )}
                            <Badge
                              variant={entryStatusConfig[entry.status]?.variant ?? 'outline'}
                              className="text-xs"
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
                              <Badge key={i} variant="secondary" className="text-xs">
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
                        {membershipClaimLabel(entry.order) && (
                          <p className="text-xs text-muted-foreground truncate">
                            {membershipClaimLabel(entry.order)}
                          </p>
                        )}
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
                        <Badge key={i} variant="secondary" className="text-xs">
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
                            {membershipClaimLabel(entry.order) && (
                              <p className="text-xs text-muted-foreground">
                                {membershipClaimLabel(entry.order)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.dog?.registeredName ?? 'Junior Handler'}
                          {entry.isNfc && (
                            <Badge variant="outline" className="ml-1.5 text-xs">NFC</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{entry.dog?.breed?.name ?? '—'}</TableCell>
                        <TableCell className="hidden lg:table-cell capitalize">{entry.dog?.sex ?? '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {entry.entryClasses.map((ec, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
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
    if (!data?.rows) return [];
    if (!search) return data.rows;
    const q = search.toLowerCase();
    return data.rows.filter(
      (r) =>
        r.exhibitor?.name?.toLowerCase().includes(q) ||
        r.itemLabel.toLowerCase().includes(q)
    );
  }, [data, search]);

  const grouped = useMemo(() => groupByOrder(filtered), [filtered]);

  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      <DownloadsMovedNote showId={showId} />
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Total Revenue</p>
            <p className="text-2xl font-bold text-se-fresh-deep">
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
            <p className="text-2xl font-bold text-se-honey-deep">
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
              {/* Mobile: group rows by order so each order reads as a
                  single "receipt" — entries and sundry together, with
                  the order's single payment badge at the bottom. */}
              <div className="space-y-3 sm:hidden">
                {grouped.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-lg border overflow-hidden divide-y"
                  >
                    {group.rows.map((row, idx) => (
                      <div key={row.id} className="p-3 space-y-1.5">
                        {idx === 0 && (
                          <p className="font-medium text-sm truncate">{row.exhibitor?.name ?? '—'}</p>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{row.itemLabel}</p>
                            {row.itemDetail && (
                              <p className="text-[11px] text-muted-foreground truncate">
                                {row.itemDetail}
                              </p>
                            )}
                          </div>
                          <Badge
                            variant={entryStatusConfig[row.status]?.variant ?? 'outline'}
                            className="shrink-0"
                          >
                            {entryStatusConfig[row.status]?.label ?? row.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.kind === 'entry' ? 'Entry fee' : 'Add-ons'}{' '}
                          <span className="font-medium text-foreground">{formatCurrency(row.total)}</span>
                        </div>
                      </div>
                    ))}
                    {group.payments.length > 0 && (
                      <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-xs">
                        <span className="text-muted-foreground">Payment</span>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {group.payments.map((p, i) => (
                            <Badge
                              key={i}
                              variant={p.status === 'succeeded' ? 'default' : 'outline'}
                              className="text-xs"
                            >
                              £{(p.amount / 100).toFixed(2)} ({p.status})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Desktop table — rows grouped by order with a thicker
                  divider between orders, and the payment column is
                  vertically spanned so one payment badge reads as the
                  total for the whole group (matching how exhibitors
                  actually paid: one transaction per order). */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exhibitor</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Entry Fee</TableHead>
                      <TableHead>Add-ons</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped.map((group) => (
                      group.rows.map((row, idx) => {
                        const isFirst = idx === 0;
                        const isLast = idx === group.rows.length - 1;
                        // Thicker bottom border on the final row of each
                        // group creates a clear visual break between orders.
                        const borderClass = isLast ? 'border-b-2 border-border' : 'border-b-0';
                        return (
                          <TableRow key={row.id} className={borderClass}>
                            <TableCell className="align-top">
                              {isFirst ? (
                                <div>
                                  <p className="font-medium">{row.exhibitor?.name ?? '—'}</p>
                                  <p className="text-xs text-muted-foreground">{row.exhibitor?.email ?? ''}</p>
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p>{row.itemLabel}</p>
                                {row.itemDetail && (
                                  <p className="text-xs text-muted-foreground">{row.itemDetail}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {row.entryFee > 0
                                ? formatCurrency(row.entryFee)
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              {row.addons > 0
                                ? formatCurrency(row.addons)
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="font-medium">{formatCurrency(row.total)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={entryStatusConfig[row.status]?.variant ?? 'outline'}
                              >
                                {entryStatusConfig[row.status]?.label ?? row.status}
                              </Badge>
                            </TableCell>
                            {isFirst && (
                              <TableCell
                                rowSpan={group.rows.length}
                                className="align-middle"
                              >
                                <div className="space-y-1">
                                  {group.payments.length > 0 ? (
                                    group.payments.map((p, i) => (
                                      <Badge
                                        key={i}
                                        variant={p.status === 'succeeded' ? 'default' : 'outline'}
                                        className="text-xs block w-fit"
                                      >
                                        £{(p.amount / 100).toFixed(2)} ({p.status})
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                  {group.rows.length > 1 && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Order total {formatCurrency(group.orderTotal)}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
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

function CatalogueOrdersContent({ showId }: { showId: string }) {
  const { data, isLoading } =
    trpc.secretary.getCatalogueOrders.useQuery({ showId });

  if (isLoading) return <LoadingCard />;

  const printed = data?.printed ?? [];
  const online = data?.online ?? [];
  const totalOrders = printed.length + online.length;

  return (
    <div className="space-y-4">
      <DownloadsMovedNote showId={showId} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3">
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
          <div>
            <CardTitle className="text-base">Printed Catalogues ({printed.length})</CardTitle>
            <CardDescription>
              Exhibitors who ordered a printed catalogue
            </CardDescription>
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

function AbsenteeReportContent({ showId }: { showId: string }) {
  const { data: absentees, isLoading } =
    trpc.secretary.getAbsenteeList.useQuery({ showId });

  const absenteeCount = absentees?.length ?? 0;

  // Withdrawal is a whole-entry status, so a withdrawn row lists every
  // class she was entered in. "Absent" is per-class (Mandy 2026-08-12) — an
  // entry can be absent from one class and present in another (e.g. her
  // breed class vs. a Special Award) — so it lists only the classes she was
  // actually marked absent from.
  function classesToShow<T extends { absent: boolean }>(entry: { status: string; entryClasses?: T[] }) {
    const classes = entry.entryClasses ?? [];
    return entry.status === 'withdrawn' ? classes : classes.filter((ec) => ec.absent);
  }

  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      <DownloadsMovedNote showId={showId} />
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Total Absentees</p>
            <p className="text-2xl font-bold">{absenteeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Absent</p>
            <p className="text-2xl font-bold text-se-honey-deep">
              {/* Every non-withdrawn row on this list is here because at least
                  one of its classes is marked absent (Mandy 2026-08-12,
                  per-class attendance) — status alone tells "Absent" from
                  "Withdrawn" apart. */}
              {absentees?.filter((e) => e.status !== 'withdrawn').length ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Withdrawn</p>
            <p className="text-2xl font-bold text-destructive">
              {absentees?.filter((e) => e.status === 'withdrawn').length ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Absentee Report</CardTitle>
              <CardDescription>
                All entries marked as absent or withdrawn
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {absenteeCount === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No absentees recorded.
            </p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="space-y-3 sm:hidden">
                {absentees?.map((entry) => (
                  <div key={entry.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {entry.catalogueNumber && (
                            <span className="text-xs font-mono font-bold text-muted-foreground">
                              #{entry.catalogueNumber}
                            </span>
                          )}
                          <p className="font-medium text-sm truncate">
                            {entry.dog?.registeredName ?? 'Junior Handler'}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {entry.dog?.breed?.name ?? ''} {entry.dog?.sex ? `\u00b7 ${entry.dog.sex === 'dog' ? 'Dog' : 'Bitch'}` : ''}
                        </p>
                      </div>
                      <Badge
                        variant={entry.status === 'withdrawn' ? 'destructive' : 'secondary'}
                        className="shrink-0"
                      >
                        {entry.status === 'withdrawn' ? 'Withdrawn' : 'Absent'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {classesToShow(entry).map((ec, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {ec.showClass?.classNumber != null ? `${ec.showClass.classNumber}. ` : ''}
                          {ec.showClass?.classDefinition?.name ?? '?'}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {entry.exhibitor?.name ?? ''}
                      {entry.dog?.owners?.length ? ` \u00b7 Owner: ${entry.dog.owners.map((o) => o.ownerName).join(' & ')}` : ''}
                    </p>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cat.</TableHead>
                      <TableHead>Dog Name</TableHead>
                      <TableHead>Breed</TableHead>
                      <TableHead className="hidden md:table-cell">Sex</TableHead>
                      <TableHead>Classes</TableHead>
                      <TableHead className="hidden lg:table-cell">Owner</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absentees?.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono font-bold">
                          {entry.catalogueNumber ?? '\u2014'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {entry.dog?.registeredName ?? 'Junior Handler'}
                        </TableCell>
                        <TableCell>{entry.dog?.breed?.name ?? '\u2014'}</TableCell>
                        <TableCell className="hidden md:table-cell capitalize">
                          {entry.dog?.sex ?? '\u2014'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {classesToShow(entry).map((ec, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {ec.showClass?.classNumber != null ? `${ec.showClass.classNumber}. ` : ''}
                                {ec.showClass?.classDefinition?.name ?? '?'}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {entry.dog?.owners?.map((o) => o.ownerName).join(' & ') ?? '\u2014'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={entry.status === 'withdrawn' ? 'destructive' : 'secondary'}
                          >
                            {entry.status === 'withdrawn' ? 'Withdrawn' : 'Absent'}
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

function ExtrasSummaryContent({ showId }: { showId: string }) {
  const { data, isLoading } = trpc.secretary.getExtrasSummary.useQuery({ showId });

  if (isLoading) return <LoadingCard />;
  if (!data) return null;

  const totalExtras = data.sundrySections.reduce((sum, s) => sum + s.totalPence, 0);
  const totalBuyers = data.sundrySections.reduce((sum, s) => sum + s.buyers.length, 0);
  const isEmpty =
    data.sundrySections.length === 0 &&
    data.classSponsors.length === 0 &&
    data.showSponsors.length === 0;

  return (
    <div className="space-y-4">
      <DownloadsMovedNote showId={showId} />
      {/* Top totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Add-on revenue</p>
            <p className="text-2xl font-bold">{formatCurrency(totalExtras)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Buyers</p>
            <p className="text-2xl font-bold">{totalBuyers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground">Sponsors</p>
            <p className="text-2xl font-bold">
              {data.classSponsors.length + data.showSponsors.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {isEmpty && (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
            No add-ons, sponsors or extras have been recorded for this show yet.
          </CardContent>
        </Card>
      )}

      {/* One card per sundry item type */}
      {data.sundrySections.map((section) => (
        <Card key={section.label}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{section.label}</CardTitle>
              <Badge variant="secondary">
                {section.totalQuantity} × {formatCurrency(section.totalPence / Math.max(section.totalQuantity, 1))} = {formatCurrency(section.totalPence)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.buyers.map((buyer, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{buyer.name ?? '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{buyer.email ?? '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{buyer.phone ?? '—'}</TableCell>
                    <TableCell className="text-right">{buyer.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(buyer.quantity * buyer.unitPrice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Class sponsors */}
      {data.classSponsors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Class Sponsors</CardTitle>
            <CardDescription>Sponsorships you have recorded against individual classes.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sponsor</TableHead>
                  <TableHead>Class / Trophy</TableHead>
                  <TableHead className="text-right">Prize</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.classSponsors.map((sp, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{sp.sponsorName}</TableCell>
                    <TableCell className="text-muted-foreground">{sp.detail}</TableCell>
                    <TableCell className="text-right">{sp.amountPence ? formatCurrency(sp.amountPence) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Show sponsors */}
      {data.showSponsors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Show Sponsors</CardTitle>
            <CardDescription>Sponsors who back the show as a whole.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sponsor</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="hidden sm:table-cell">Phone</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.showSponsors.map((sp, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{sp.sponsorName}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{sp.email ?? '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{sp.phone ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{sp.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
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
