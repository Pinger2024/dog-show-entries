'use client';

import { Fragment, useState, useMemo } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { FolderOpen, Loader2, RotateCcw, BookOpen, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/lib/date-utils';
import { cn, formatDogName } from '@/lib/utils';
import { formatSvClassName } from '@/lib/class-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SECard, Eyebrow } from '@/components/show-experience/kit';
import { SE_H } from '@/components/show-experience/tokens';
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
import {
  formatWholePounds,
  joinWorkings,
  dogsEnteredParts,
  classBreakdownFooterText,
  classEntriesLabel,
} from '../_lib/show-utils';
import { useShowId } from '../_lib/show-context';
import { computeClassBreakdown } from '@/lib/class-breakdown';
import type { RouterOutputs } from '@/server/trpc/router';

type RefundableOrder = RouterOutputs['secretary']['getRefundableOrders'][number];
type RefundableEntry = RefundableOrder['entries'][number];

/* ─── Financial stat tile — kit stat-tile pattern (Eyebrow + SE_H value,
 * tabular-nums), same recipe as the show overview's entry stats. ───── */

function FinancialStat({
  label,
  value,
  subtext,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
}) {
  return (
    <SECard className="p-3.5">
      <Eyebrow>{label}</Eyebrow>
      <p className={cn(SE_H, 'mt-1.5 text-[20px] leading-none tabular-nums text-se-ink sm:text-[22px]')}>
        {value}
      </p>
      {subtext && <p className="mt-1.5 truncate text-[11px] text-se-ink3">{subtext}</p>}
    </SECard>
  );
}

/* ─── Section — SECard wrapper with a hairline header, matching the
 * public fee table's card language. Breakdown tables live in the body. ── */

function FinancialSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <SECard>
      <div className="border-b border-se-line px-4 py-4 sm:px-6">
        <p className={cn(SE_H, 'flex items-center gap-2 text-base text-se-ink')}>
          {Icon && <Icon className="size-4 text-se-fresh-deep" />}
          {title}
        </p>
        {description && <p className="mt-1 text-sm text-se-ink3">{description}</p>}
      </div>
      <div className="overflow-x-auto p-4 sm:p-6">{children}</div>
    </SECard>
  );
}

/* ─── Reconciliation strip — the top-of-page "every number shows its
 * workings" summary. Soft-green tinted, two lines: dogs entered = its
 * parts, and total income = its parts. Bold "=" / "+" in fresh-deep,
 * matching the approved mockup. ────────────────────────────────── */

function ReconciliationRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] leading-relaxed text-se-ink first:pt-0 [&:not(:first-child)]:mt-2.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-se-fresh-line [&:not(:first-child)]:pt-2.5">
      {children}
    </p>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return <span className="px-0.5 font-extrabold text-se-fresh-deep">{children}</span>;
}

function ReconciliationStrip({
  stats,
}: {
  stats: RouterOutputs['secretary']['getShowStats'] | undefined;
}) {
  if (!stats) return null;

  // Same split/collapse rule as every other dogsEntered sub-line (dashboard,
  // entries tile, banner) — just with "paid through Remi" wording and a
  // "+"-operator join instead of " · ".
  const dogsEnteredDisplayParts = dogsEnteredParts({
    paid: stats.confirmedEntries,
    notForCompetition: stats.notForCompetitionEntries,
    otherOrderless: stats.otherOrderlessEntries,
    paidLabel: (n) => `${n} paid through Remi`,
    allPaidLabel: 'all paid through Remi',
  });

  const incomeParts = [
    stats.paidThroughRemiFeesPence > 0 ? `${formatCurrency(stats.paidThroughRemiFeesPence)} entry fees` : null,
    stats.withdrawnKeptPence > 0 ? `${formatCurrency(stats.withdrawnKeptPence)} kept from ${stats.withdrawnEntries} withdrawal${stats.withdrawnEntries === 1 ? '' : 's'}` : null,
    stats.paidSundryRevenuePence > 0 ? `${formatCurrency(stats.paidSundryRevenuePence)} sundries` : null,
  ].filter((p): p is string => !!p);

  // Mandy 2026-07-27: the dashboard said "93 dogs entered" while the Class
  // Breakdown report said "109 entries" and neither named its unit — this
  // line spells out why the two numbers differ instead of leaving them
  // looking like a contradiction. Hidden when every dog is in a single
  // class, since then there's nothing to explain.
  const classEntriesNote = classEntriesLabel(stats.dogsEntered, stats.classEntries);

  return (
    <div className="rounded-[18px] border border-se-fresh-line bg-se-fresh-soft p-4 sm:p-5">
      <ReconciliationRow>
        <b>{stats.dogsEntered} dogs entered</b>
        <Op>=</Op>
        {dogsEnteredDisplayParts.map((part, i) => (
          <span key={part}>
            {part}
            {i < dogsEnteredDisplayParts.length - 1 && <Op>+</Op>}
          </span>
        ))}
      </ReconciliationRow>
      {classEntriesNote && (
        <p className="mt-2 text-[12px] leading-relaxed text-se-ink3">
          {stats.dogsEntered} dogs · {stats.classEntries} class entries — a dog entered in more than one class is counted in each of them.
        </p>
      )}
      {incomeParts.length > 0 && (
        <ReconciliationRow>
          <b>Total income {formatCurrency(stats.totalClubRevenuePence)}</b>
          <Op>=</Op>
          {incomeParts.map((part, i) => (
            <span key={part}>
              {part}
              {i < incomeParts.length - 1 && <Op>+</Op>}
            </span>
          ))}
        </ReconciliationRow>
      )}
      {/* Only shown when there's postal/cash money in the mix — most shows
          are 100% online, so this line stays hidden rather than adding
          noise to the common case. */}
      {stats.offlineCollectedPence > 0 && (
        <p className="mt-2 text-[12px] leading-relaxed text-se-ink3">
          {formatCurrency(stats.clubReceivablePence)} was collected by Remi for
          you (paid out after the show) · {formatCurrency(stats.offlineCollectedPence)}{' '}
          was paid directly to the club (cash/postal entries).
        </p>
      )}
    </div>
  );
}

export default function FinancialPage() {
  const showId = useShowId();
  const { data: show } = trpc.shows.getById.useQuery({ id: showId });
  const { data: stats } = trpc.secretary.getShowStats.useQuery({ showId });
  const { data: entryReport } = trpc.secretary.getEntryReport.useQuery({ showId });
  // The "Entries by Class" card counts true ring numbers from the full
  // catalogue set (all confirmed entries, incl. those paid directly to the
  // club + NFC), not just paid-via-Remi entries. See getClassBreakdownReport.
  const { data: classEntryReport } = trpc.secretary.getClassBreakdownReport.useQuery({ showId });
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
    utils.secretary.getClassBreakdownReport.invalidate({ showId });
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

  // Per-class breakdown — buckets dogs / bitches / junior handlers /
  // mixed (non-JH classes that accept both sexes — Veteran, Brace,
  // Team, Stakes). The four buckets are exhaustive so subtotals always
  // sum to the grand total. See src/lib/class-breakdown.ts.
  const classBreakdown = useMemo(
    () => computeClassBreakdown(classEntryReport?.entries, classEntryReport?.classes),
    [classEntryReport]
  );

  // Total judged class-entries across the catalogue set — many dogs run
  // more than one class. combinedTotals.entries already sums one row per
  // class a dog runs PLUS one row per NFC dog (which has no class), so
  // subtracting the NFC count gives the true class-entry total without a
  // second pass over classEntryReport. Used for the "Entries by Class" footer.
  const totalClassEntries = classBreakdown.combinedTotals.entries - classBreakdown.notForCompetitionTotals.entries;

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
        const className = formatSvClassName(
          ec.showClass?.classDefinition?.name,
          (ec.showClass as { svCoatType?: 'stock' | 'long_stock' | null } | undefined)?.svCoatType,
        );
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

  // "Entry Fees" tile workings — "74 paid £1,687 + 1 withdrawn £26".
  const entryFeesWorkings = joinWorkings([
    stats && stats.confirmedEntries > 0 ? `${stats.confirmedEntries} paid ${formatWholePounds(stats.paidThroughRemiFeesPence)}` : null,
    stats && stats.withdrawnEntries > 0 ? `${stats.withdrawnEntries} withdrawn ${formatWholePounds(stats.withdrawnKeptPence)}` : null,
  ]);
  // "Total Income" tile workings — "£1,687 fees + £26 kept + £90 sundries".
  const totalIncomeWorkings = joinWorkings([
    stats && stats.paidThroughRemiFeesPence > 0 ? `${formatWholePounds(stats.paidThroughRemiFeesPence)} fees` : null,
    stats && stats.withdrawnKeptPence > 0 ? `${formatWholePounds(stats.withdrawnKeptPence)} kept` : null,
    stats && stats.paidSundryRevenuePence > 0 ? `${formatWholePounds(stats.paidSundryRevenuePence)} sundries` : null,
  ]);

  return (
    <div className="space-y-6">
      {/* Reconciliation strip — the headline numbers, spelled out */}
      <ReconciliationStrip stats={stats} />

      {/* Summary tiles — paid only, sundries included, net of refunds */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <FinancialStat
          label="Total Income"
          value={<span className="text-se-fresh-deep">{formatCurrency(stats?.totalClubRevenuePence ?? 0)}</span>}
          subtext={totalIncomeWorkings}
        />
        <FinancialStat
          label="Entry Fees"
          value={formatCurrency(stats?.paidEntryFeesPence ?? 0)}
          subtext={entryFeesWorkings}
        />
        <FinancialStat
          label="Awaiting Payment"
          value={<span className="text-se-honey-deep">{formatCurrency(stats?.pendingClubReceivablePence ?? 0)}</span>}
          subtext={`${stats?.pendingEntries ?? 0} started checkout`}
        />
        <FinancialStat
          label="Catalogues ordered"
          value={(stats?.paidPrintedCatalogueCount ?? 0) + (stats?.paidOnlineCatalogueCount ?? 0)}
          subtext={`${stats?.paidPrintedCatalogueCount ?? 0} printed · ${stats?.paidOnlineCatalogueCount ?? 0} online`}
        />
      </div>

      {/* Printing and downloads moved to Documents & Reports (reports-merge) —
          the Financial Statement CSV lives there now, always available. */}
      <Link
        href={`/secretary/shows/${showId}/documents`}
        className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted min-h-[2.75rem]"
      >
        <FolderOpen className="size-4 shrink-0" />
        Printing and downloads have moved to Documents &amp; Reports
      </Link>

      {/* Per-class breakdown by sex. Gated on actual ENTRIES, not on row count:
          scheduled classes are now seeded at zero (so Mandy sees Baby Puppy
          before Minor Puppy even with nobody in it), which makes `combined`
          non-empty as soon as a show has any classes at all — and a freshly
          set-up show would otherwise greet its secretary with a table of
          nothing but zeros. */}
      {classBreakdown.combinedTotals.entries > 0 && (
        <FinancialSection
          title="Entries by Class"
          description="Every class in the schedule, with its entries — including any paid directly to the club and Not For Competition. Classes with no entries are shown at zero."
        >
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
                {/* Not For Competition — in the catalogue but not in any judged
                    class, so shown as its own line to keep the total tied to the
                    catalogue (Mandy 2026-06-17). */}
                {classBreakdown.notForCompetition.length > 0 && (
                  <TableRow className="bg-primary/10 font-semibold">
                    <TableCell className="font-bold uppercase tracking-wider text-xs">
                      Not For Competition
                    </TableCell>
                    <TableCell className="text-right">{classBreakdown.notForCompetitionTotals.entries}</TableCell>
                    <TableCell className="text-right">{formatCurrency(classBreakdown.notForCompetitionTotals.revenue)}</TableCell>
                  </TableRow>
                )}
                {/* Grand total */}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total (catalogue entries)</TableCell>
                  <TableCell className="text-right">{classBreakdown.combinedTotals.entries}</TableCell>
                  <TableCell className="text-right">{formatCurrency(classBreakdown.combinedTotals.revenue)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {/* Mandy 2026-07-27 spotted this reading "156 class entries across
                160 dogs" — self-contradictory, because combinedTotals.entries
                is the total of the column above (class entries + not for
                competition), never a dog count. Show all three numbers and how
                they add up, so the card reconciles on its face. */}
            <p className="mt-3 text-xs text-se-ink3">
              {classBreakdownFooterText({
                totalLines: classBreakdown.combinedTotals.entries,
                classEntries: totalClassEntries,
                notForCompetition: classBreakdown.notForCompetitionTotals.entries,
                dogsEntered: stats?.dogsEntered,
              })}
            </p>
        </FinancialSection>
      )}

      {/* Per-breed breakdown with classes (only for all-breed / group shows) */}
      {breedBreakdown.length > 0 && show?.showScope !== 'single_breed' && (
        <FinancialSection
          title="Entries by Breed & Class"
          description="Breakdown of entries and revenue per breed, with class detail"
        >
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
        </FinancialSection>
      )}

      {/* Sundry items revenue */}
      {sundryReport && sundryReport.length > 0 && (
        <FinancialSection
          title="Sundry Items Revenue"
          description="Add-on items purchased alongside entries (paid orders only)"
          icon={ShoppingBag}
        >
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
        </FinancialSection>
      )}

      {/* All entries — replaces the old "Breakdown by Entry Type" +
          "Entry Status Breakdown" tables, which disagreed with each other
          (both were paid-orders-only via getEntryReport, so orderless NFC /
          manually-added entries were invisible here even though they show
          up on the entries list). This table reads straight off the
          canonical stats query — the SAME population as dogsEntered
          everywhere else — so orderless entries are finally visible. */}
      <FinancialSection
        title="All entries — and what each was worth"
        description="Every entry ever made on this show, so the numbers always add up."
      >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                {/* "Dogs", not "Entries" — every row here counts dogs, while
                    the Entries by Class card above counts class entries. Mandy
                    2026-07-27 read 84 here against 160 there and reasonably
                    asked which was wrong; neither was, the columns just didn't
                    say what they were counting. */}
                <TableHead className="text-right">Dogs</TableHead>
                <TableHead className="text-right">Fees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  Entries paid
                  {(stats?.confirmedJhEntries ?? 0) > 0 && (
                    <span className="mt-1 block pl-3 text-xs font-normal text-muted-foreground">
                      including {stats?.confirmedJhEntries} junior handler · {formatCurrency(stats?.confirmedJhFeesPence ?? 0)}
                    </span>
                  )}
                  {/* Mandy 2026-07-27: entries she added by hand and settled
                      straight into the club's bank were counted in this row
                      while it was labelled "Paid through Remi", so it matched
                      neither the bank statement nor the Remi payout. */}
                  {(stats?.paidDirectToClubEntries ?? 0) > 0 && (
                    <span className="mt-1 block pl-3 text-xs font-normal text-muted-foreground">
                      including {stats?.paidDirectToClubEntries} paid direct to the club · {formatCurrency(stats?.paidDirectToClubFeesPence ?? 0)}
                      <span className="mt-0.5 block">added by hand — that money is already in the club account, not in your Remi payout</span>
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">{stats?.confirmedEntries ?? 0}</TableCell>
                <TableCell className="text-right">{formatCurrency(stats?.paidThroughRemiFeesPence ?? 0)}</TableCell>
              </TableRow>
              {(stats?.notForCompetitionEntries ?? 0) > 0 && (
                <TableRow>
                  <TableCell className="font-medium">
                    Not for competition
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      recorded on the entry · not paid through Remi, so not in Total income
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{stats?.notForCompetitionEntries}</TableCell>
                  <TableCell className="text-right">{formatCurrency(stats?.notForCompetitionFeesPence ?? 0)}</TableCell>
                </TableRow>
              )}
              {(stats?.otherOrderlessEntries ?? 0) > 0 && (
                <TableRow>
                  <TableCell className="font-medium">
                    Added without online payment
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      settled directly with the club, not through Remi
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{stats?.otherOrderlessEntries}</TableCell>
                  <TableCell className="text-right">{formatCurrency(stats?.otherOrderlessFeesPence ?? 0)}</TableCell>
                </TableRow>
              )}
              <TableRow className="bg-se-fresh-soft font-bold">
                <TableCell>= Dogs entered</TableCell>
                <TableCell className="text-right">{stats?.dogsEntered ?? 0}</TableCell>
                <TableCell className="text-right">{formatCurrency(stats?.dogsEnteredFeesPence ?? 0)}</TableCell>
              </TableRow>
              {(stats?.withdrawnEntries ?? 0) > 0 && (
                <TableRow>
                  <TableCell className="font-medium">Withdrawn — fee kept</TableCell>
                  <TableCell className="text-right">{stats?.withdrawnEntries}</TableCell>
                  <TableCell className="text-right">{formatCurrency(stats?.withdrawnKeptPence ?? 0)}</TableCell>
                </TableRow>
              )}
              {(stats?.cancelledEntries ?? 0) > 0 && (
                <TableRow>
                  <TableCell className="font-medium">Cancelled — refunded</TableCell>
                  <TableCell className="text-right">{stats?.cancelledEntries}</TableCell>
                  <TableCell className="text-right">{formatCurrency(stats?.cancelledRefundedPence ?? 0)}</TableCell>
                </TableRow>
              )}
              <TableRow className="border-t-2 font-bold">
                <TableCell>= All entries</TableCell>
                <TableCell className="text-right">{stats?.allEntries ?? 0}</TableCell>
                <TableCell className="text-right">{formatCurrency(stats?.allEntriesFeesPence ?? 0)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-se-ink3">
            {stats?.dogsEntered ?? 0} {(stats?.dogsEntered ?? 0) === 1 ? 'dog appears' : 'dogs appear'} in the catalogue — withdrawn entries are not printed.
          </p>
      </FinancialSection>

      {/* Catalogue requests — split by printed vs online */}
      {((catalogueOrders?.printed?.length ?? 0) + (catalogueOrders?.online?.length ?? 0)) > 0 && (
        <FinancialSection
          title="Catalogue Orders"
          description="Exhibitors who ordered a catalogue (from sundry items)"
          icon={BookOpen}
        >
          <div className="space-y-4">
            {([
              { label: 'Printed', orders: catalogueOrders?.printed ?? [] },
              { label: 'Online', orders: catalogueOrders?.online ?? [] },
            ] as const).filter((g) => g.orders.length > 0).map((g) => (
              <div key={g.label}>
                <Eyebrow className="mb-2 block">{g.label} ({g.orders.length})</Eyebrow>
                <div className="divide-y divide-se-line">
                  {g.orders.map((order, idx) => (
                    <div key={`${g.label}-${idx}`} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-se-ink">{order.name}</p>
                        <p className="truncate text-xs text-se-ink3">{order.email}</p>
                      </div>
                      {order.quantity > 1 && (
                        <Badge variant="outline">&times;{order.quantity}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FinancialSection>
      )}

      {/* Orders & Refunds — one card per paid order, full line-item view */}
      <FinancialSection
        title="Orders & Refunds"
        description={<>Each paid order shows every line the exhibitor was charged for. &ldquo;Refund entire order&rdquo; returns everything to the exhibitor and cancels all entries on the order.</>}
        icon={RotateCcw}
      >
        <div className="space-y-4">
          {(refundableOrders?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-se-ink3">
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
        </div>
      </FinancialSection>

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
  // A £0 order (e.g. a free Junior Handler entry) has paid === 0, which would
  // make remaining <= 0 trivially true and wrongly show "Fully refunded".
  // Only treat it as refunded if there was actually something paid to refund.
  const fullyRefunded = paid > 0 && remaining <= 0;
  // Only orders with a real Stripe payment can be refunded. Free entries and
  // secretary-recorded (manually entered) orders have no payment row, so the
  // refund actions would only error with "No completed payment found" — hide them.
  const hasRefundablePayment = !!succeeded?.stripePaymentId;

  const entryFeesTotal = order.entries.reduce((s, e) => s + e.totalFee, 0);
  const sundryTotal = order.orderSundryItems.reduce(
    (s, i) => s + i.quantity * i.unitPrice,
    0
  );

  return (
    <SECard className="space-y-3 border-se-line bg-se-paper2/30 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <p className={cn(SE_H, 'truncate text-sm text-se-ink')}>
            {order.exhibitor?.name ?? 'Unknown exhibitor'}
          </p>
          <p className="text-xs text-se-ink3 truncate">
            {order.exhibitor?.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!order.stripePaymentIntentId && (
            <Badge variant="outline">Paid directly to club</Badge>
          )}
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
                {/* Refund allowed on confirmed OR withdrawn entries — a
                    withdrawn exhibitor kept their fee with the club by default,
                    but the secretary can choose to give it back (Mandy
                    2026-07-13). issueRefund handles the accounting; the refund
                    moves a withdrawn entry to cancelled so it drops out of
                    income. */}
                {!fullyRefunded && hasRefundablePayment && entry.totalFee > 0 && (entry.status === 'confirmed' || entry.status === 'withdrawn') && (
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
      <div className="flex flex-col gap-2 border-t border-se-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-se-ink3">
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
        {!fullyRefunded && hasRefundablePayment && remaining > 0 && (
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
    </SECard>
  );
}
