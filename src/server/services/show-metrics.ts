import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  entries,
  entryClasses,
  orders,
  orderSundryItems,
  payments,
  sundryItems,
} from '@/server/db/schema';
import type { Database } from '@/server/db';
import { isCatalogueItem } from '@/lib/catalogue-utils';

/**
 * Materialise the list of paid-order IDs for a show. Callers use this to
 * scope entry/sundry/payment queries to "real" orders — abandoned
 * pending_payment orders generate ghost entries that shouldn't appear in
 * reports, absentee lists, or refund UIs.
 *
 * The three duplicated sites that used to inline this query are now the
 * one place where "what counts as paid" is defined.
 */
export async function getPaidOrderIdsForShow(
  db: Database,
  showId: string
): Promise<string[]> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.showId, showId), eq(orders.status, 'paid')));
  return rows.map((o) => o.id);
}

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
  /** Orders that were paid then fully refunded — no longer count as revenue. */
  refundedOrderCount: number;

  // ── Entry counts (non-deleted only) ──
  /** Alive entries in a paid order with status='confirmed'. The authoritative "paid entries" count. */
  confirmedEntryCount: number;
  /** Alive entries in a paid order with status='withdrawn' — money was collected then the exhibitor pulled out. */
  withdrawnEntryCount: number;
  /** Alive entries in a pending_payment order — awaiting Stripe confirmation. */
  pendingEntryCount: number;

  // ── Paid revenue (active paid orders only — refunded orders are excluded entirely) ──
  /** Sum of entries.total_fee across alive entries in paid orders. */
  paidEntryFeesPence: number;
  /** Sum of qty × unit_price across sundry lines in paid orders. */
  paidSundryRevenuePence: number;
  /** Sum of orders.platform_fee_pence across paid orders. */
  paidPlatformFeePence: number;
  /** Sum of payments.refund_amount on refunded orders — for display ("£X refunded") only, not subtracted from anything. */
  refundedPence: number;

  /**
   * What Remi owes the club: paid entry fees + paid sundry, collected
   * through STRIPE only, net of partial refunds. Refunded orders are
   * excluded upstream.
   *
   * Excludes "offline" paid orders (secretary-recorded postal/cash/
   * direct-to-club entries, `orders.stripePaymentIntentId IS NULL`) —
   * Remi never touched that money, so it must never appear in a BACS
   * figure. See `offlineCollectedPence` for that money and
   * `totalClubRevenuePence` for the combined total.
   */
  clubReceivablePence: number;
  /**
   * Paid revenue (entries + sundry) on orders the club collected itself,
   * outside Remi — postal, cash, or otherwise settled directly with the
   * exhibitor (`orders.createManualEntry`, `stripePaymentIntentId IS
   * NULL`). The club already holds this money; it is NOT due from Remi
   * and must never be added to a payout figure.
   */
  offlineCollectedPence: number;
  /**
   * clubReceivablePence + offlineCollectedPence — everything this show
   * has earned the club, regardless of which channel collected it. Use
   * this for "how much has this show made" displays (dashboards, payment
   * reports); use clubReceivablePence alone for "what does Remi owe the
   * club" (payouts, print-package deduction balance).
   */
  totalClubRevenuePence: number;
  /** What Remi actually charged the exhibitor at Stripe on paid orders (entries + sundry + platform fee) — offline orders never touched Stripe, so they're excluded here too. */
  grossChargedPence: number;

  // ── Pending (exhibitors started checkout but Stripe hasn't confirmed) ──
  pendingClubReceivablePence: number;
  pendingPlatformFeePence: number;

  // ── Catalogue orders (paid only) ──
  paidPrintedCatalogueCount: number;
  paidOnlineCatalogueCount: number;

  // ── "Dogs entered" canonical breakdown ────────────────────────
  // The single number every screen (dashboard, banner, entries page,
  // financial page) shows as the headline count, plus the parts it's made
  // of — so the number always shows its workings. See
  // project_financial_withdrawn_clarity memory for the "74/75/78" bug this
  // fixes: three screens counting three different populations with no label.
  //
  //   dogsEnteredCount = confirmedEntryCount + notForCompetitionCount + otherOrderlessCount
  //
  // "Paid through Remi" reuses confirmedEntryCount/confirmedEntryFeesPence
  // (status='confirmed' on a paid order) rather than broadening its filter —
  // that field is well-tested and status should always be 'confirmed' once
  // an order is paid. The two orderless buckets below are new: entries with
  // no order at all (NFC dogs, or entries a secretary added that were
  // settled directly with the club, never touching a Remi order) were
  // previously skipped entirely by this aggregation.
  /** Sum of entries.total_fee for confirmedEntryCount (paid + confirmed only — excludes the withdrawn fee that paidEntryFeesPence also folds in). */
  confirmedEntryFeesPence: number;
  /** Orderless entries (orderId IS NULL), flagged Not For Competition, status not in (withdrawn, cancelled). */
  notForCompetitionCount: number;
  notForCompetitionFeesPence: number;
  /** Orderless entries, NOT flagged NFC — comp entries / manual additions never linked to a Remi order. */
  otherOrderlessCount: number;
  otherOrderlessFeesPence: number;
  /** Junior Handler entries within confirmedEntryCount — for the "including N junior handler" subrow. */
  confirmedJhEntryCount: number;
  confirmedJhFeesPence: number;
  /**
   * Confirmed entries within confirmedEntryCount that the club collected
   * itself — `createManualEntry` postal/cash entries whose order never
   * touched Stripe. Mandy 2026-07-27: the entries table showed these inside a
   * row labelled "Paid through Remi", so a secretary reconciling her bank
   * statement had no way to tell which money Remi is holding and which is
   * already in the club account. Counted, not subtracted — the headline
   * totals are unchanged, this only lets the row show its workings.
   */
  offlineConfirmedEntryCount: number;
  offlineConfirmedEntryFeesPence: number;
  /** The fee withdrawn entries keep with the club — same pence already folded into paidEntryFeesPence, split out for display. */
  withdrawnKeptPence: number;
  /** Alive entries with status='cancelled' on an otherwise-paid order (a per-entry partial refund). */
  cancelledEntryCount: number;
  /** entries.total_fee for cancelledEntryCount — the amount that was refunded off those entries. */
  cancelledRefundedPence: number;
  /** confirmedEntryCount + notForCompetitionCount + otherOrderlessCount — the one headline number. */
  dogsEnteredCount: number;
  dogsEnteredFeesPence: number;
  /** dogsEnteredCount + withdrawnEntryCount + cancelledEntryCount — every entry ever made on the show. */
  allEntriesCount: number;
  allEntriesFeesPence: number;
  /**
   * Class entries across every catalogue entry — a dog in two classes counts
   * twice. This is what the judges' books and the Class Breakdown report hold,
   * and it is ALWAYS >= dogsEnteredCount. Mandy 2026-07-27: the dashboard read
   * "93 dogs entered" while the report read "109 entries" and nothing named
   * either unit, so the two looked like a contradiction. Both are shown now.
   */
  classEntryCount: number;
};

// ── Pure aggregation (unit-testable without a DB) ───────────────

export type OrderRow = {
  id: string;
  status: 'draft' | 'pending_payment' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  totalAmount: number;
  platformFeePence: number;
  /**
   * Null for orders never collected via Stripe — a secretary recorded a
   * postal/cash/direct-to-club entry (`orders.createManualEntry`). Every
   * real Stripe checkout has this set from the moment the PaymentIntent
   * is created, so "paid + no stripePaymentIntentId" unambiguously means
   * "the club already holds this money, Remi never touched it."
   */
  stripePaymentIntentId: string | null;
};

export type EntryRow = {
  id: string;
  orderId: string | null;
  status: 'pending' | 'confirmed' | 'withdrawn' | 'transferred' | 'cancelled';
  totalFee: number;
  deletedAt: Date | null;
  /** Not For Competition flag — drives the orderless notForCompetition/otherOrderless split. */
  isNfc: boolean;
  entryType: 'standard' | 'junior_handler';
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

/** One row per (entry, class) pair — the judges'-book unit. */
export type ClassEntryRow = {
  entryId: string;
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
  classEntries?: ClassEntryRow[];
}): ShowMetrics {
  const paidOrderIds = new Set<string>();
  // Subset of paidOrderIds never collected via Stripe — see OrderRow.stripePaymentIntentId.
  const offlinePaidOrderIds = new Set<string>();
  const pendingOrderIds = new Set<string>();
  const refundedOrderIds = new Set<string>();
  const pendingOrderPlatformFees = new Map<string, number>();
  let paidOrderCount = 0;
  let cancelledOrderCount = 0;
  let refundedOrderCount = 0;
  let paidPlatformFeePence = 0;

  for (const o of data.orders) {
    if (o.status === 'paid') {
      paidOrderIds.add(o.id);
      paidOrderCount += 1;
      paidPlatformFeePence += o.platformFeePence;
      if (!o.stripePaymentIntentId) {
        offlinePaidOrderIds.add(o.id);
      }
    } else if (o.status === 'pending_payment') {
      pendingOrderIds.add(o.id);
      pendingOrderPlatformFees.set(o.id, o.platformFeePence);
    } else if (o.status === 'refunded') {
      refundedOrderIds.add(o.id);
      refundedOrderCount += 1;
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
  // Entries that reach the catalogue — the population the judges' books and
  // the Class Breakdown report count their class entries against.
  const catalogueEntryIds = new Set<string>();
  let confirmedEntryCount = 0;
  let withdrawnEntryCount = 0;
  let pendingEntryCount = 0;
  let paidEntryFeesPence = 0;
  let pendingEntryFeesPence = 0;
  // Subset of paidEntryFeesPence attributable to offline (non-Stripe) paid
  // orders — entry counts/fees stay channel-agnostic everywhere else, this
  // accumulator exists only to carve the settlement split out at the end.
  let offlineEntryFeesPence = 0;

  // "Dogs entered" split — new buckets.
  let confirmedJhEntryCount = 0;
  let confirmedJhFeesPence = 0;
  let offlineConfirmedEntryCount = 0;
  let offlineConfirmedEntryFeesPence = 0;
  let withdrawnKeptPence = 0;
  let cancelledEntryCount = 0;
  let cancelledRefundedPence = 0;
  let notForCompetitionCount = 0;
  let notForCompetitionFeesPence = 0;
  let otherOrderlessCount = 0;
  let otherOrderlessFeesPence = 0;

  for (const e of data.entries) {
    if (e.deletedAt) continue;
    if (e.status === 'confirmed') catalogueEntryIds.add(e.id);
    if (!e.orderId) {
      // Orderless entries never touched a Remi order — either an NFC dog
      // (no fee collected) or an entry a secretary added and settled
      // directly with the club. Withdrawn/cancelled shouldn't occur here
      // in practice (both imply money moved through an order first) but
      // are excluded defensively so dogsEntered never double-counts them.
      if (e.status === 'withdrawn' || e.status === 'cancelled') continue;
      if (e.isNfc) {
        notForCompetitionCount += 1;
        notForCompetitionFeesPence += e.totalFee;
      } else {
        otherOrderlessCount += 1;
        otherOrderlessFeesPence += e.totalFee;
      }
      continue;
    }
    if (paidOrderIds.has(e.orderId)) {
      const isOffline = offlinePaidOrderIds.has(e.orderId);
      if (e.status === 'confirmed') {
        confirmedEntryCount += 1;
        paidEntryFeesPence += e.totalFee;
        if (isOffline) {
          offlineEntryFeesPence += e.totalFee;
          offlineConfirmedEntryCount += 1;
          offlineConfirmedEntryFeesPence += e.totalFee;
        }
        if (e.entryType === 'junior_handler') {
          confirmedJhEntryCount += 1;
          confirmedJhFeesPence += e.totalFee;
        }
      } else if (e.status === 'withdrawn') {
        // Exhibitor paid then pulled out without a refund — fee stays with the club.
        withdrawnEntryCount += 1;
        paidEntryFeesPence += e.totalFee;
        if (isOffline) offlineEntryFeesPence += e.totalFee;
        withdrawnKeptPence += e.totalFee;
      } else if (e.status === 'cancelled') {
        // Per-entry partial refund on an otherwise paid order: the entry
        // was cancelled but the rest of the order still stands. The
        // refunded amount shows up via payments.refundAmount separately
        // (clubReceivablePence nets it out); totalFee here is the amount
        // that was refunded off THIS entry, for the "Cancelled — refunded"
        // reconciliation row.
        paidEntryFeesPence += e.totalFee;
        if (isOffline) offlineEntryFeesPence += e.totalFee;
        cancelledEntryCount += 1;
        cancelledRefundedPence += e.totalFee;
      }
    } else if (pendingOrderIds.has(e.orderId)) {
      if (e.status === 'pending') {
        pendingEntryCount += 1;
        pendingEntryFeesPence += e.totalFee;
        livePendingOrderIds.add(e.orderId);
      }
    }
  }

  // Derived rather than tracked as its own accumulator — paidEntryFeesPence
  // already sums confirmed + withdrawn + cancelled fees on paid orders, and
  // the other two are tracked directly, so confirmed-only falls out for free.
  const confirmedEntryFeesPence = paidEntryFeesPence - withdrawnKeptPence - cancelledRefundedPence;
  const dogsEnteredCount = confirmedEntryCount + notForCompetitionCount + otherOrderlessCount;
  const dogsEnteredFeesPence = confirmedEntryFeesPence + notForCompetitionFeesPence + otherOrderlessFeesPence;
  const allEntriesCount = dogsEnteredCount + withdrawnEntryCount + cancelledEntryCount;
  const allEntriesFeesPence = dogsEnteredFeesPence + withdrawnKeptPence + cancelledRefundedPence;

  // A dog in two classes is two class entries. Counted against the catalogue
  // population so this ties to the Class Breakdown report exactly.
  let classEntryCount = 0;
  for (const ce of data.classEntries ?? []) {
    if (catalogueEntryIds.has(ce.entryId)) classEntryCount += 1;
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
  // Subset of paidSundryRevenuePence attributable to offline paid orders —
  // same purpose as offlineEntryFeesPence above.
  let offlineSundryRevenuePence = 0;

  for (const s of data.sundries) {
    const lineTotal = s.quantity * s.unitPrice;
    if (paidOrderIds.has(s.orderId)) {
      paidSundryRevenuePence += lineTotal;
      if (offlinePaidOrderIds.has(s.orderId)) offlineSundryRevenuePence += lineTotal;
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

  // Three buckets for refund amounts:
  //  - `refundedPence` = every refund, for secretary-facing display
  //    ("£X was refunded on this show").
  //  - `partialRefundsOnStripePaidOrdersPence` = refunds on Stripe-collected
  //    orders still in 'paid' state (i.e. per-entry partial refunds).
  //    These come out of Remi's Stripe-held share; fully-refunded orders
  //    are already excluded from the paid buckets entirely.
  //  - `partialRefundsOnOfflinePaidOrdersPence` = the same, but on offline
  //    orders. In practice a refund can only exist against a real Stripe
  //    payment (there's nothing to refund on a postal/cash entry through
  //    this system), so this should always be zero — tracked separately
  //    anyway so an offline refund nets against offlineCollectedPence,
  //    never against what Remi owes.
  let refundedPence = 0;
  let partialRefundsOnStripePaidOrdersPence = 0;
  let partialRefundsOnOfflinePaidOrdersPence = 0;
  for (const p of data.payments) {
    if (!p.orderId || !p.refundAmount) continue;
    refundedPence += p.refundAmount;
    if (offlinePaidOrderIds.has(p.orderId)) {
      partialRefundsOnOfflinePaidOrdersPence += p.refundAmount;
    } else if (paidOrderIds.has(p.orderId)) {
      partialRefundsOnStripePaidOrdersPence += p.refundAmount;
    }
  }

  // Stripe-collected vs offline-collected revenue split — entries + sundry
  // fees are tracked channel-agnostically above (counts/fees stay the same
  // regardless of who collected the money); the offline sub-totals are
  // subtracted back out here purely to compute the settlement split.
  const stripePaidRevenuePence =
    (paidEntryFeesPence - offlineEntryFeesPence) +
    (paidSundryRevenuePence - offlineSundryRevenuePence);
  const offlinePaidRevenuePence = offlineEntryFeesPence + offlineSundryRevenuePence;

  const clubReceivablePence = Math.max(
    0,
    stripePaidRevenuePence - partialRefundsOnStripePaidOrdersPence
  );
  const offlineCollectedPence = Math.max(
    0,
    offlinePaidRevenuePence - partialRefundsOnOfflinePaidOrdersPence
  );
  const totalClubRevenuePence = clubReceivablePence + offlineCollectedPence;
  const grossChargedPence = stripePaidRevenuePence + paidPlatformFeePence;
  const pendingClubReceivablePence =
    pendingEntryFeesPence + pendingSundryRevenuePence;

  return {
    paidOrderCount,
    pendingOrderCount,
    cancelledOrderCount,
    refundedOrderCount,
    confirmedEntryCount,
    withdrawnEntryCount,
    pendingEntryCount,
    paidEntryFeesPence,
    paidSundryRevenuePence,
    paidPlatformFeePence,
    refundedPence,
    clubReceivablePence,
    offlineCollectedPence,
    totalClubRevenuePence,
    grossChargedPence,
    pendingClubReceivablePence,
    pendingPlatformFeePence,
    paidPrintedCatalogueCount,
    paidOnlineCatalogueCount,
    confirmedEntryFeesPence,
    confirmedJhEntryCount,
    confirmedJhFeesPence,
    offlineConfirmedEntryCount,
    offlineConfirmedEntryFeesPence,
    withdrawnKeptPence,
    cancelledEntryCount,
    cancelledRefundedPence,
    notForCompetitionCount,
    notForCompetitionFeesPence,
    otherOrderlessCount,
    otherOrderlessFeesPence,
    dogsEnteredCount,
    dogsEnteredFeesPence,
    allEntriesCount,
    allEntriesFeesPence,
    classEntryCount,
  };
}

/**
 * The "dogs entered" response fields shared by `secretary.getShowStats`
 * (Financial page) and `secretary.getShowEntryStats` (dashboard cards,
 * lifecycle banner, entries page tiles). Both procedures spread this into
 * their return object instead of hand-writing the same ~14 fields twice —
 * otherwise the two field lists silently fork (which is exactly the kind
 * of drift this redesign exists to eliminate).
 */
export function shapeDogsEnteredFields(metrics: ShowMetrics) {
  return {
    dogsEntered: metrics.dogsEnteredCount,
    dogsEnteredFeesPence: metrics.dogsEnteredFeesPence,
    paidThroughRemiFeesPence: metrics.confirmedEntryFeesPence,
    notForCompetitionEntries: metrics.notForCompetitionCount,
    notForCompetitionFeesPence: metrics.notForCompetitionFeesPence,
    otherOrderlessEntries: metrics.otherOrderlessCount,
    otherOrderlessFeesPence: metrics.otherOrderlessFeesPence,
    confirmedJhEntries: metrics.confirmedJhEntryCount,
    confirmedJhFeesPence: metrics.confirmedJhFeesPence,
    paidDirectToClubEntries: metrics.offlineConfirmedEntryCount,
    paidDirectToClubFeesPence: metrics.offlineConfirmedEntryFeesPence,
    withdrawnKeptPence: metrics.withdrawnKeptPence,
    cancelledEntries: metrics.cancelledEntryCount,
    cancelledRefundedPence: metrics.cancelledRefundedPence,
    allEntries: metrics.allEntriesCount,
    allEntriesFeesPence: metrics.allEntriesFeesPence,
    sundriesPence: metrics.paidSundryRevenuePence,
    classEntries: metrics.classEntryCount,
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
      stripePaymentIntentId: orders.stripePaymentIntentId,
    })
    .from(orders)
    .where(inArray(orders.showId, showIds));

  const orderIds = orderRows.map((o) => o.id);
  const orderToShow = new Map(orderRows.map((o) => [o.id, o.showId]));

  // Entries are fetched unconditionally — a show can have "dogs entered"
  // (NFC / manually-added, orderless entries) with ZERO orders at all, so
  // bailing out early when orderRows is empty (the old behaviour) silently
  // zeroed dogsEntered for exactly the shows this redesign exists to fix.
  // Sundries/payments are keyed off orderId, so those two stay skipped
  // when there are no orders to join against.
  const [entryRows, sundryRows, paymentRows, classEntryRows] = await Promise.all([
    db
      .select({
        id: entries.id,
        showId: entries.showId,
        orderId: entries.orderId,
        status: entries.status,
        totalFee: entries.totalFee,
        deletedAt: entries.deletedAt,
        isNfc: entries.isNfc,
        entryType: entries.entryType,
      })
      .from(entries)
      .where(and(inArray(entries.showId, showIds), isNull(entries.deletedAt))),
    orderIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            orderId: orderSundryItems.orderId,
            itemName: sundryItems.name,
            quantity: orderSundryItems.quantity,
            unitPrice: orderSundryItems.unitPrice,
          })
          .from(orderSundryItems)
          .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
          .where(inArray(orderSundryItems.orderId, orderIds)),
    orderIds.length === 0
      ? Promise.resolve([])
      : db
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
    // Class entries — joined via entries so it's scoped to these shows and
    // skips soft-deleted entries. Keyed by entryId; the aggregation decides
    // which entries count toward the catalogue.
    db
      .select({ entryId: entryClasses.entryId, showId: entries.showId })
      .from(entryClasses)
      .innerJoin(entries, eq(entryClasses.entryId, entries.id))
      .where(and(inArray(entries.showId, showIds), isNull(entries.deletedAt))),
  ]);

  // Bucket rows by showId
  const buckets = new Map<
    string,
    {
      orders: OrderRow[];
      entries: EntryRow[];
      sundries: SundryLineRow[];
      payments: PaymentRefundRow[];
      classEntries: ClassEntryRow[];
    }
  >();
  const bucket = (id: string) => {
    let b = buckets.get(id);
    if (!b) {
      b = { orders: [], entries: [], sundries: [], payments: [], classEntries: [] };
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
  for (const ce of classEntryRows) bucket(ce.showId).classEntries.push({ entryId: ce.entryId });

  for (const [showId, data] of buckets) {
    result.set(showId, aggregateShowMetrics(data));
  }
  return result;
}
