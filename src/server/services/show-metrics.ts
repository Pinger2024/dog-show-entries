import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  entries,
  orders,
  orderSundryItems,
  payments,
  sundryItems,
} from '@/server/db/schema';
import type { Database } from '@/server/db';
import { isCatalogueItem } from '@/lib/catalogue-utils';

/**
 * Canonical financial + entry-count shape for a show. The whole system pulls
 * its numbers from this single calculation so every stat card, report, and
 * payout row agrees on what "revenue" means.
 *
 * Revenue is **paid-orders-only** — money is "active revenue" once Stripe
 * has confirmed it, not when someone starts a checkout. Pending counts are
 * exposed separately so secretaries can see what's in flight.
 */
export type ShowMetrics = {
  // ── Order counts ──
  paidOrderCount: number;
  pendingOrderCount: number;
  cancelledOrderCount: number;

  // ── Entry counts (non-deleted only) ──
  /** Alive entries in a paid order with status='confirmed'. The authoritative "paid entries" count. */
  confirmedEntryCount: number;
  /** Alive entries in a paid order with status='withdrawn' — money was collected then the exhibitor pulled out. */
  withdrawnEntryCount: number;
  /** Alive entries in a pending_payment order — awaiting Stripe confirmation. */
  pendingEntryCount: number;

  // ── Paid revenue (what Remi has actually collected, gross of refunds) ──
  /** Sum of entries.total_fee across all alive entries in paid orders. */
  paidEntryFeesPence: number;
  /** Sum of qty × unit_price across sundry lines in paid orders. */
  paidSundryRevenuePence: number;
  /** Sum of orders.platform_fee_pence across paid orders. */
  paidPlatformFeePence: number;
  /** Sum of payments.refund_amount across paid orders. */
  refundedPence: number;

  /** What the club is due post-refund: paid entry fees + sundry − refunds (which come out of the club's share). */
  clubReceivablePence: number;
  /** What Remi charged the exhibitor in total on paid orders (entries + sundry + platform fee). */
  grossChargedPence: number;

  // ── Pending (exhibitors started checkout but Stripe hasn't confirmed) ──
  pendingClubReceivablePence: number;
  pendingPlatformFeePence: number;

  // ── Catalogue orders (paid only) ──
  paidPrintedCatalogueCount: number;
  paidOnlineCatalogueCount: number;
};

// ── Pure aggregation (unit-testable without a DB) ───────────────

export type OrderRow = {
  id: string;
  status: 'draft' | 'pending_payment' | 'paid' | 'failed' | 'cancelled';
  totalAmount: number;
  platformFeePence: number;
};

export type EntryRow = {
  id: string;
  orderId: string | null;
  status: 'pending' | 'confirmed' | 'withdrawn' | 'transferred' | 'cancelled';
  totalFee: number;
  deletedAt: Date | null;
};

export type SundryLineRow = {
  orderId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
};

export type PaymentRefundRow = {
  orderId: string | null;
  refundAmount: number | null;
};

/**
 * Pure aggregation — given raw rows, compute the canonical metrics shape.
 * The DB wrapper below fetches these rows and calls this function.
 */
export function aggregateShowMetrics(data: {
  orders: OrderRow[];
  entries: EntryRow[];
  sundries: SundryLineRow[];
  payments: PaymentRefundRow[];
}): ShowMetrics {
  const paidOrderIds = new Set<string>();
  const pendingOrderIds = new Set<string>();
  const pendingOrderPlatformFees = new Map<string, number>();
  let paidOrderCount = 0;
  let cancelledOrderCount = 0;
  let paidPlatformFeePence = 0;

  for (const o of data.orders) {
    if (o.status === 'paid') {
      paidOrderIds.add(o.id);
      paidOrderCount += 1;
      paidPlatformFeePence += o.platformFeePence;
    } else if (o.status === 'pending_payment') {
      pendingOrderIds.add(o.id);
      pendingOrderPlatformFees.set(o.id, o.platformFeePence);
    } else if (o.status === 'cancelled' || o.status === 'failed') {
      cancelledOrderCount += 1;
    }
  }

  // A pending order is "live" only if it still has at least one entry in
  // status='pending'. If every entry is withdrawn/cancelled the order is a
  // dead checkout — it won't clear, so its sundries/platform fee shouldn't
  // show up in "Awaiting Payment" even though the row is still
  // pending_payment.
  const livePendingOrderIds = new Set<string>();
  let confirmedEntryCount = 0;
  let withdrawnEntryCount = 0;
  let pendingEntryCount = 0;
  let paidEntryFeesPence = 0;
  let pendingEntryFeesPence = 0;

  for (const e of data.entries) {
    if (e.deletedAt) continue;
    if (!e.orderId) continue;
    if (paidOrderIds.has(e.orderId)) {
      if (e.status === 'confirmed') {
        confirmedEntryCount += 1;
        paidEntryFeesPence += e.totalFee;
      } else if (e.status === 'withdrawn') {
        withdrawnEntryCount += 1;
        // Withdrawn entries were paid for; keep the fee in revenue until a
        // refund is recorded (which shows up in refundedPence separately).
        paidEntryFeesPence += e.totalFee;
      }
    } else if (pendingOrderIds.has(e.orderId)) {
      if (e.status === 'pending') {
        pendingEntryCount += 1;
        pendingEntryFeesPence += e.totalFee;
        livePendingOrderIds.add(e.orderId);
      }
    }
  }

  const pendingOrderCount = livePendingOrderIds.size;
  let pendingPlatformFeePence = 0;
  for (const id of livePendingOrderIds) {
    pendingPlatformFeePence += pendingOrderPlatformFees.get(id) ?? 0;
  }

  let paidSundryRevenuePence = 0;
  let pendingSundryRevenuePence = 0;
  let paidPrintedCatalogueCount = 0;
  let paidOnlineCatalogueCount = 0;

  for (const s of data.sundries) {
    const lineTotal = s.quantity * s.unitPrice;
    if (paidOrderIds.has(s.orderId)) {
      paidSundryRevenuePence += lineTotal;
      if (isCatalogueItem(s.itemName)) {
        if (s.itemName.toLowerCase().includes('print')) {
          paidPrintedCatalogueCount += s.quantity;
        } else {
          paidOnlineCatalogueCount += s.quantity;
        }
      }
    } else if (livePendingOrderIds.has(s.orderId)) {
      pendingSundryRevenuePence += lineTotal;
    }
  }

  let refundedPence = 0;
  for (const p of data.payments) {
    if (!p.orderId || !p.refundAmount) continue;
    if (paidOrderIds.has(p.orderId)) {
      refundedPence += p.refundAmount;
    }
  }

  const clubReceivablePence =
    paidEntryFeesPence + paidSundryRevenuePence - refundedPence;
  const grossChargedPence =
    paidEntryFeesPence + paidSundryRevenuePence + paidPlatformFeePence;
  const pendingClubReceivablePence =
    pendingEntryFeesPence + pendingSundryRevenuePence;

  return {
    paidOrderCount,
    pendingOrderCount,
    cancelledOrderCount,
    confirmedEntryCount,
    withdrawnEntryCount,
    pendingEntryCount,
    paidEntryFeesPence,
    paidSundryRevenuePence,
    paidPlatformFeePence,
    refundedPence,
    clubReceivablePence,
    grossChargedPence,
    pendingClubReceivablePence,
    pendingPlatformFeePence,
    paidPrintedCatalogueCount,
    paidOnlineCatalogueCount,
  };
}

// ── DB-backed wrapper ───────────────────────────────────────────

/**
 * Load the canonical metrics for a show from the database. One query each
 * for orders / entries / sundry lines / payments, then pure aggregation.
 */
export async function computeShowMetrics(
  db: Database,
  showId: string
): Promise<ShowMetrics> {
  const map = await computeShowsMetrics(db, [showId]);
  return map.get(showId) ?? emptyShowMetrics();
}

function emptyShowMetrics(): ShowMetrics {
  return aggregateShowMetrics({ orders: [], entries: [], sundries: [], payments: [] });
}

/**
 * Batch variant — one query per table across many shows. Returns a map
 * keyed by showId. Shows with no orders are still keyed with a zeroed shape.
 */
export async function computeShowsMetrics(
  db: Database,
  showIds: string[]
): Promise<Map<string, ShowMetrics>> {
  const result = new Map<string, ShowMetrics>();
  // Fresh zeroed shape per show — don't alias a shared reference, or
  // a future mutation would bleed across all empty-show entries.
  for (const id of showIds) result.set(id, emptyShowMetrics());
  if (showIds.length === 0) return result;

  const orderRows = await db
    .select({
      id: orders.id,
      showId: orders.showId,
      status: orders.status,
      totalAmount: orders.totalAmount,
      platformFeePence: orders.platformFeePence,
    })
    .from(orders)
    .where(inArray(orders.showId, showIds));

  if (orderRows.length === 0) return result;

  const orderIds = orderRows.map((o) => o.id);
  const orderToShow = new Map(orderRows.map((o) => [o.id, o.showId]));

  const [entryRows, sundryRows, paymentRows] = await Promise.all([
    db
      .select({
        id: entries.id,
        showId: entries.showId,
        orderId: entries.orderId,
        status: entries.status,
        totalFee: entries.totalFee,
        deletedAt: entries.deletedAt,
      })
      .from(entries)
      .where(and(inArray(entries.showId, showIds), isNull(entries.deletedAt))),
    db
      .select({
        orderId: orderSundryItems.orderId,
        itemName: sundryItems.name,
        quantity: orderSundryItems.quantity,
        unitPrice: orderSundryItems.unitPrice,
      })
      .from(orderSundryItems)
      .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
      .where(inArray(orderSundryItems.orderId, orderIds)),
    db
      .select({
        orderId: payments.orderId,
        refundAmount: payments.refundAmount,
      })
      .from(payments)
      .where(
        and(
          inArray(payments.orderId, orderIds),
          sql`${payments.refundAmount} IS NOT NULL`
        )
      ),
  ]);

  // Bucket rows by showId
  const buckets = new Map<
    string,
    {
      orders: OrderRow[];
      entries: EntryRow[];
      sundries: SundryLineRow[];
      payments: PaymentRefundRow[];
    }
  >();
  const bucket = (id: string) => {
    let b = buckets.get(id);
    if (!b) {
      b = { orders: [], entries: [], sundries: [], payments: [] };
      buckets.set(id, b);
    }
    return b;
  };

  for (const o of orderRows) bucket(o.showId).orders.push(o);
  for (const e of entryRows) bucket(e.showId).entries.push(e);
  for (const s of sundryRows) {
    const showId = orderToShow.get(s.orderId);
    if (showId) bucket(showId).sundries.push(s);
  }
  for (const p of paymentRows) {
    if (!p.orderId) continue;
    const showId = orderToShow.get(p.orderId);
    if (showId) bucket(showId).payments.push(p);
  }

  for (const [showId, data] of buckets) {
    result.set(showId, aggregateShowMetrics(data));
  }
  return result;
}
