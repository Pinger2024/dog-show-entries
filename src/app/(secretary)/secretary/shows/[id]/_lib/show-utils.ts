import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  published: { label: 'Published', variant: 'outline' },
  entries_open: { label: 'Entries Open', variant: 'default' },
  entries_closed: { label: 'Entries Closed', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

export const entryStatusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  pending: { label: 'Pending', variant: 'outline' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  withdrawn: { label: 'Withdrawn', variant: 'secondary' },
  transferred: { label: 'Transferred', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

export const contractStageConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  offer_sent: { label: 'Offer Sent', variant: 'secondary' },
  offer_accepted: { label: 'Accepted', variant: 'default' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  declined: { label: 'Declined', variant: 'destructive' },
};

export function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatCompactRevenue(pence: number): string {
  const pounds = pence / 100;
  return pounds >= 1000 ? `£${(pounds / 1000).toFixed(1)}k` : `£${pounds.toFixed(0)}`;
}

/** Whole pounds, comma-grouped, no pence — for the "workings" sub-lines
 *  (e.g. "£1,687 fees + £26 kept + £90 sundries") where showing ".00"
 *  everywhere would just be noise next to the full-precision headline. */
export function formatWholePounds(pence: number): string {
  return `£${Math.round(pence / 100).toLocaleString('en-GB')}`;
}

/** Joins non-empty parts with " + ", dropping any null/zero terms — the
 *  "omit zero terms" rule the financial-clarity redesign uses everywhere
 *  a total is shown as its workings (e.g. "£1,687 fees + £26 kept"). */
export function joinWorkings(parts: Array<string | null | undefined | false>): string {
  return parts.filter((p): p is string => !!p).join(' + ');
}

/** The parts a dogsEntered headline is made of — e.g.
 *  `["74 paid", "4 not for competition"]`. Collapses to a single "all paid"
 *  entry when there's nothing else to show (no NFC/otherOrderless, and —
 *  when a withdrawn count is passed — no withdrawn either). The single
 *  source both the plain-text sub-lines (dashboard, entries tile, banner —
 *  join with " · ") and the Financial page's reconciliation strip (joins
 *  with a styled "+" operator) read from, so the split/collapse rule can't
 *  drift between them. `paidLabel`/`allPaidLabel` let a caller use
 *  different wording (e.g. "paid through Remi") for the same rule. */
export function dogsEnteredParts(opts: {
  paid: number;
  notForCompetition: number;
  otherOrderless: number;
  withdrawn?: number;
  paidLabel?: (n: number) => string;
  allPaidLabel?: string;
}): string[] {
  const extras: string[] = [];
  if (opts.notForCompetition > 0) extras.push(`${opts.notForCompetition} not for competition`);
  if (opts.otherOrderless > 0) extras.push(`${opts.otherOrderless} added without online payment`);
  if (extras.length === 0 && !opts.withdrawn) {
    return [opts.allPaidLabel ?? 'all paid'];
  }
  const paidLabel = opts.paidLabel ?? ((n: number) => `${n} paid`);
  return [paidLabel(opts.paid), ...extras];
}

/** `dogsEnteredParts` joined with " · " for the plain-text sub-lines. */
export function formatDogsEnteredParts(opts: {
  paid: number;
  notForCompetition: number;
  otherOrderless: number;
  withdrawn?: number;
}): string {
  return dogsEnteredParts(opts).join(' · ');
}

/**
 * "109 class entries" — the judges'-book unit, shown next to the dogs count
 * whenever the two differ. Mandy 2026-07-27: the dashboard said 93 and the
 * Class Breakdown report said 109, and with neither naming its unit the two
 * looked like a contradiction. Omitted when they're equal (every dog in a
 * single class), because then it says nothing.
 */
export function classEntriesLabel(
  dogsEntered: number,
  classEntries: number | undefined,
): string | null {
  if (classEntries == null || classEntries <= dogsEntered) return null;
  return `${classEntries} class entries`;
}

/** The lifecycle banner's breakdown line — dogsEnteredParts plus a
 *  withdrawn suffix, e.g. "74 paid · 4 not for competition · 1 withdrawn
 *  (fee kept)". Shared by every phase variant that shows an entry count
 *  (EntriesOpenContent, its overdue variant, PreShowContent) so they can't
 *  drift into different wording. */
export function formatBannerBreakdown(entryStats: {
  confirmed: number;
  notForCompetitionEntries: number;
  otherOrderlessEntries: number;
  withdrawn: number;
  dogsEntered?: number;
  classEntries?: number;
} | undefined): string {
  if (!entryStats) return '';
  const parts = dogsEnteredParts({
    paid: entryStats.confirmed,
    notForCompetition: entryStats.notForCompetitionEntries,
    otherOrderless: entryStats.otherOrderlessEntries,
    withdrawn: entryStats.withdrawn,
  });
  if (entryStats.withdrawn > 0) parts.push(`${entryStats.withdrawn} withdrawn (fee kept)`);
  const classes = classEntriesLabel(entryStats.dogsEntered ?? 0, entryStats.classEntries);
  if (classes) parts.push(classes);
  return parts.join(' · ');
}

export function daysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function downloadCsv(headers: string[], rows: string[][], filename: string) {
  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Report exported to CSV');
}

export type EntryItem = import('@/server/trpc/router').RouterOutputs['entries']['getForShow']['items'][number];

export type CatalogueEntryItem = NonNullable<
  import('@/server/trpc/router').RouterOutputs['secretary']['getCatalogueData']
>['entries'][number];
