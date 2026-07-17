import { describe, it, expect } from 'vitest';
import {
  aggregateShowMetrics,
  type OrderRow,
  type EntryRow,
  type SundryLineRow,
  type PaymentRefundRow,
} from '../show-metrics';

// ──────────────────────────────────────────────────────────────
// BAGSD fixture — the real prod state at 2026-04-22 after Michael's
// first live test. Keeps the metrics helper honest against the
// scenario that surfaced the original bugs.
// ──────────────────────────────────────────────────────────────
//
// Three orders:
//   - 3e3a1c6b: cancelled (abandoned checkout)
//   - 40174187: PAID — 2 confirmed entries, £29 sundries, £1.47 fee
//   - a2124c3d: pending_payment — 1 withdrawn entry
//
// Expected headline numbers:
//   clubReceivablePence   = £18 entries + £29 sundries = £47 (4700p)
//   paidPlatformFeePence  = £1.47 (147p)
//   grossChargedPence     = £48.47 (4847p)
//   confirmedEntryCount   = 2
//   withdrawnEntryCount   = 0  (the withdrawn entry is on a pending, not paid, order)
//   pendingEntryCount     = 0  (withdrew before Stripe confirmed → not counted)
//   paidPrintedCatalogueCount = 1
//   paidOnlineCatalogueCount  = 0

const BAGSD_ORDERS: OrderRow[] = [
  { id: 'order-cancelled', status: 'cancelled', totalAmount: 4700, platformFeePence: 147 },
  { id: 'order-paid', status: 'paid', totalAmount: 4700, platformFeePence: 147 },
  { id: 'order-pending', status: 'pending_payment', totalAmount: 4700, platformFeePence: 147 },
];

const BAGSD_ENTRIES: EntryRow[] = [
  // Cancelled order — entries soft-deleted
  { id: 'entry-abandoned-1', orderId: 'order-cancelled', status: 'cancelled', totalFee: 0, deletedAt: new Date(), isNfc: false, entryType: 'standard' },
  { id: 'entry-abandoned-2', orderId: 'order-cancelled', status: 'cancelled', totalFee: 1800, deletedAt: new Date(), isNfc: false, entryType: 'standard' },
  // Paid order — 2 confirmed (fee stored on one entry, typical of tiered entry fees)
  { id: 'entry-paid-1', orderId: 'order-paid', status: 'confirmed', totalFee: 0, deletedAt: null, isNfc: false, entryType: 'standard' },
  { id: 'entry-paid-2', orderId: 'order-paid', status: 'confirmed', totalFee: 1800, deletedAt: null, isNfc: false, entryType: 'standard' },
  // Pending order — exhibitor withdrew after starting checkout
  { id: 'entry-withdrawn', orderId: 'order-pending', status: 'withdrawn', totalFee: 1800, deletedAt: null, isNfc: false, entryType: 'standard' },
];

const BAGSD_SUNDRIES: SundryLineRow[] = [
  { orderId: 'order-cancelled', itemName: 'Printed Catalogue', quantity: 1, unitPrice: 400 },
  { orderId: 'order-cancelled', itemName: 'Donation', quantity: 1, unitPrice: 500 },
  { orderId: 'order-cancelled', itemName: 'Sponsorship - Banners', quantity: 1, unitPrice: 2000 },
  { orderId: 'order-paid', itemName: 'Printed Catalogue', quantity: 1, unitPrice: 400 },
  { orderId: 'order-paid', itemName: 'Donation', quantity: 1, unitPrice: 500 },
  { orderId: 'order-paid', itemName: 'Sponsorship - Banners', quantity: 1, unitPrice: 2000 },
  { orderId: 'order-pending', itemName: 'Printed Catalogue', quantity: 1, unitPrice: 400 },
  { orderId: 'order-pending', itemName: 'Donation', quantity: 1, unitPrice: 500 },
  { orderId: 'order-pending', itemName: 'Sponsorship - Banners', quantity: 1, unitPrice: 2000 },
];

const BAGSD_PAYMENTS: PaymentRefundRow[] = [];

describe('aggregateShowMetrics — BAGSD live fixture', () => {
  const metrics = aggregateShowMetrics({
    orders: BAGSD_ORDERS,
    entries: BAGSD_ENTRIES,
    sundries: BAGSD_SUNDRIES,
    payments: BAGSD_PAYMENTS,
  });

  it('counts orders by status', () => {
    expect(metrics.paidOrderCount).toBe(1);
    // The pending_payment order's entry is withdrawn → dead checkout → 0
    expect(metrics.pendingOrderCount).toBe(0);
    expect(metrics.cancelledOrderCount).toBe(1);
  });

  it('includes sundry items in the club receivable', () => {
    // £18 entries + £29 sundries = £47 received for the club
    expect(metrics.paidEntryFeesPence).toBe(1800);
    expect(metrics.paidSundryRevenuePence).toBe(2900);
    expect(metrics.clubReceivablePence).toBe(4700);
  });

  it('reports the gross amount Remi charged Stripe', () => {
    // £47 club receivable + £1.47 platform fee = £48.47 debited at Stripe
    expect(metrics.paidPlatformFeePence).toBe(147);
    expect(metrics.grossChargedPence).toBe(4847);
  });

  it('counts only confirmed entries on paid orders', () => {
    expect(metrics.confirmedEntryCount).toBe(2);
    // The withdrawn entry is on a pending_payment order, so it's not in any "paid" bucket
    expect(metrics.withdrawnEntryCount).toBe(0);
    // And it's status='withdrawn' not 'pending' so it doesn't count as pending either
    expect(metrics.pendingEntryCount).toBe(0);
  });

  it('dogsEntered equals confirmedEntryCount when there are no orderless entries', () => {
    // No NFC / otherOrderless entries in this fixture, so dogsEntered is
    // just the paid-through-Remi confirmed count.
    expect(metrics.dogsEnteredCount).toBe(2);
    expect(metrics.dogsEnteredFeesPence).toBe(1800);
    expect(metrics.notForCompetitionCount).toBe(0);
    expect(metrics.otherOrderlessCount).toBe(0);
  });

  it('counts only paid catalogue orders and splits printed vs online by name', () => {
    // One Printed Catalogue on the paid order — the cancelled + pending orders don't count
    expect(metrics.paidPrintedCatalogueCount).toBe(1);
    expect(metrics.paidOnlineCatalogueCount).toBe(0);
  });

  it('leaves pending revenue in its own bucket so it never inflates "active revenue"', () => {
    // The pending_payment order's only entry is withdrawn — so this is a
    // dead checkout. No entry fees, no sundries, no platform fee count
    // toward "Awaiting Payment" because the money won't clear.
    expect(metrics.pendingClubReceivablePence).toBe(0);
    expect(metrics.pendingPlatformFeePence).toBe(0);
    expect(metrics.pendingOrderCount).toBe(0);
  });
});

describe('aggregateShowMetrics — refund accounting', () => {
  it('excludes a fully-refunded order from every paid bucket', () => {
    // 2026-04-23: the canonical post-refund state. Once the Stripe
    // payment is fully refunded, the order flips to status='refunded'
    // (the executeStripeRefund service does this). From that point it
    // contributes nothing to paid revenue, catalogue counts, or entry
    // counts — the exhibitor got all their money back.
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'refunded', totalAmount: 4700, platformFeePence: 147 }],
      entries: [
        { id: 'e1', orderId: 'o1', status: 'cancelled', totalFee: 1800, deletedAt: null, isNfc: false, entryType: 'standard' },
        { id: 'e2', orderId: 'o1', status: 'cancelled', totalFee: 0, deletedAt: null, isNfc: false, entryType: 'standard' },
      ],
      sundries: [
        { orderId: 'o1', itemName: 'Printed Catalogue', quantity: 1, unitPrice: 400 },
        { orderId: 'o1', itemName: 'Donation', quantity: 1, unitPrice: 500 },
        { orderId: 'o1', itemName: 'Sponsorship - Banners', quantity: 1, unitPrice: 2000 },
      ],
      payments: [{ orderId: 'o1', refundAmount: 4847 }],
    });

    expect(metrics.paidOrderCount).toBe(0);
    expect(metrics.refundedOrderCount).toBe(1);
    expect(metrics.confirmedEntryCount).toBe(0);
    expect(metrics.paidEntryFeesPence).toBe(0);
    expect(metrics.paidSundryRevenuePence).toBe(0);
    expect(metrics.paidPrintedCatalogueCount).toBe(0);
    expect(metrics.paidPlatformFeePence).toBe(0);
    expect(metrics.clubReceivablePence).toBe(0);
    // refundedPence is still surfaced for display ("£48.47 was refunded")
    expect(metrics.refundedPence).toBe(4847);
  });

  it('deducts a partial refund on a still-paid order from clubReceivablePence', () => {
    // Per-entry partial refund: one of several entries was refunded,
    // but the order as a whole stays in 'paid' state and its remaining
    // entries/sundries still count. Only the partial refund comes out
    // of the club's share.
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'paid', totalAmount: 5000, platformFeePence: 150 }],
      entries: [
        { id: 'e1', orderId: 'o1', status: 'confirmed', totalFee: 5000, deletedAt: null, isNfc: false, entryType: 'standard' },
      ],
      sundries: [],
      payments: [{ orderId: 'o1', refundAmount: 2000 }],
    });

    expect(metrics.paidEntryFeesPence).toBe(5000);
    expect(metrics.refundedPence).toBe(2000);
    expect(metrics.clubReceivablePence).toBe(3000); // 5000 − 2000 partial refund
  });

  it('floors clubReceivablePence at zero if a partial refund exceeds club revenue', () => {
    // Edge case: refund amount recorded exceeds club revenue because
    // the refund ate into the platform fee. Club's share can't go
    // negative — the platform fee was Remi's, never the club's.
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'paid', totalAmount: 4700, platformFeePence: 147 }],
      entries: [
        { id: 'e1', orderId: 'o1', status: 'confirmed', totalFee: 4700, deletedAt: null, isNfc: false, entryType: 'standard' },
      ],
      sundries: [],
      payments: [{ orderId: 'o1', refundAmount: 4847 }],
    });

    expect(metrics.refundedPence).toBe(4847);
    expect(metrics.clubReceivablePence).toBe(0);
  });
});

describe('aggregateShowMetrics — online catalogue splitting', () => {
  it('routes items named "Online Catalogue" to the online bucket', () => {
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'paid', totalAmount: 1000, platformFeePence: 30 }],
      entries: [],
      sundries: [
        { orderId: 'o1', itemName: 'Printed Catalogue', quantity: 2, unitPrice: 400 },
        { orderId: 'o1', itemName: 'Online Catalogue', quantity: 3, unitPrice: 200 },
      ],
      payments: [],
    });

    expect(metrics.paidPrintedCatalogueCount).toBe(2);
    expect(metrics.paidOnlineCatalogueCount).toBe(3);
    expect(metrics.paidSundryRevenuePence).toBe(2 * 400 + 3 * 200);
  });
});

describe('aggregateShowMetrics — empty show', () => {
  it('returns zeros for a show with no orders', () => {
    const metrics = aggregateShowMetrics({ orders: [], entries: [], sundries: [], payments: [] });
    expect(metrics.paidOrderCount).toBe(0);
    expect(metrics.clubReceivablePence).toBe(0);
    expect(metrics.grossChargedPence).toBe(0);
    expect(metrics.paidPrintedCatalogueCount).toBe(0);
    expect(metrics.dogsEnteredCount).toBe(0);
    expect(metrics.allEntriesCount).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────
// "Dogs entered" canonical breakdown — the financial-clarity redesign.
// Orderless entries (order_id IS NULL) used to be skipped by this
// aggregation entirely, which is exactly the live bug Amanda's demo show
// surfaced: NFC dogs and secretary-added, directly-settled entries were
// invisible on the Financial page even though they show up in the
// entries list. These pin the new orderless split + the reconciling sums.
// ──────────────────────────────────────────────────────────────

describe('aggregateShowMetrics — "dogs entered" breakdown', () => {
  const entryRow = (overrides: Partial<EntryRow> & Pick<EntryRow, 'id'>): EntryRow => ({
    orderId: null,
    status: 'confirmed',
    totalFee: 0,
    deletedAt: null,
    isNfc: false,
    entryType: 'standard',
    ...overrides,
  });

  it('counts orderless NFC entries as notForCompetition, not paidThroughRemi', () => {
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'paid', totalAmount: 2000, platformFeePence: 30 }],
      entries: [
        entryRow({ id: 'paid-1', orderId: 'o1', status: 'confirmed', totalFee: 2000 }),
        // Two NFC dogs, no order at all — never paid via Remi.
        entryRow({ id: 'nfc-1', isNfc: true, totalFee: 0 }),
        entryRow({ id: 'nfc-2', isNfc: true, totalFee: 0 }),
      ],
      sundries: [],
      payments: [],
    });

    expect(metrics.confirmedEntryCount).toBe(1);
    expect(metrics.notForCompetitionCount).toBe(2);
    expect(metrics.otherOrderlessCount).toBe(0);
    // NFC dogs are visible in dogsEntered (they show up in the entries
    // list) but contribute no fee — that's the "not paid through Remi,
    // so not in Total income" distinction the Financial page draws.
    expect(metrics.dogsEnteredCount).toBe(3);
    expect(metrics.notForCompetitionFeesPence).toBe(0);
  });

  it('counts orderless non-NFC entries as otherOrderless ("added without online payment")', () => {
    const metrics = aggregateShowMetrics({
      orders: [],
      entries: [
        entryRow({ id: 'manual-1', totalFee: 1500 }),
      ],
      sundries: [],
      payments: [],
    });

    expect(metrics.otherOrderlessCount).toBe(1);
    expect(metrics.otherOrderlessFeesPence).toBe(1500);
    expect(metrics.notForCompetitionCount).toBe(0);
    expect(metrics.dogsEnteredCount).toBe(1);
    expect(metrics.dogsEnteredFeesPence).toBe(1500);
  });

  it('excludes withdrawn from dogsEntered but keeps its fee in withdrawnKeptPence', () => {
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'paid', totalAmount: 4000, platformFeePence: 60 }],
      entries: [
        entryRow({ id: 'paid-1', orderId: 'o1', status: 'confirmed', totalFee: 2000 }),
        entryRow({ id: 'withdrawn-1', orderId: 'o1', status: 'withdrawn', totalFee: 2000 }),
      ],
      sundries: [],
      payments: [],
    });

    expect(metrics.dogsEnteredCount).toBe(1); // the withdrawn dog is NOT in dogsEntered
    expect(metrics.withdrawnEntryCount).toBe(1);
    expect(metrics.withdrawnKeptPence).toBe(2000); // ...but its fee is still club income
    expect(metrics.paidEntryFeesPence).toBe(4000); // unchanged existing math: confirmed + withdrawn
    // allEntries = dogsEntered + withdrawn + cancelled, so the withdrawn
    // dog still shows up somewhere in the "every entry ever made" total.
    expect(metrics.allEntriesCount).toBe(2);
    expect(metrics.allEntriesFeesPence).toBe(4000);
  });

  it('puts entries on a pending_payment order into pendingEntryCount, NOT dogsEntered', () => {
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'pending_payment', totalAmount: 2000, platformFeePence: 30 }],
      entries: [
        entryRow({ id: 'awaiting-1', orderId: 'o1', status: 'pending', totalFee: 2000 }),
      ],
      sundries: [],
      payments: [],
    });

    expect(metrics.pendingEntryCount).toBe(1);
    expect(metrics.dogsEnteredCount).toBe(0);
    expect(metrics.confirmedEntryCount).toBe(0);
    expect(metrics.notForCompetitionCount).toBe(0);
    expect(metrics.otherOrderlessCount).toBe(0);
  });

  it('splits a per-entry partial refund on a paid order into cancelledEntryCount', () => {
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'paid', totalAmount: 4000, platformFeePence: 60 }],
      entries: [
        entryRow({ id: 'paid-1', orderId: 'o1', status: 'confirmed', totalFee: 2000 }),
        entryRow({ id: 'cancelled-1', orderId: 'o1', status: 'cancelled', totalFee: 2000 }),
      ],
      sundries: [],
      payments: [{ orderId: 'o1', refundAmount: 2000 }],
    });

    expect(metrics.cancelledEntryCount).toBe(1);
    expect(metrics.cancelledRefundedPence).toBe(2000);
    expect(metrics.dogsEnteredCount).toBe(1); // cancelled dog is NOT in dogsEntered
    expect(metrics.allEntriesCount).toBe(2); // ...but still shows up in "every entry ever made"
  });

  it('the parts always sum: paidThroughRemi + NFC + otherOrderless = dogsEntered, and income parts = totalIncome', () => {
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'paid', totalAmount: 6000, platformFeePence: 90 }],
      entries: [
        entryRow({ id: 'paid-1', orderId: 'o1', status: 'confirmed', totalFee: 2000 }),
        entryRow({ id: 'paid-2', orderId: 'o1', status: 'confirmed', totalFee: 2000 }),
        entryRow({ id: 'withdrawn-1', orderId: 'o1', status: 'withdrawn', totalFee: 2000 }),
        entryRow({ id: 'nfc-1', isNfc: true, totalFee: 0 }),
        entryRow({ id: 'manual-1', totalFee: 1200 }),
      ],
      sundries: [
        { orderId: 'o1', itemName: 'Donation', quantity: 1, unitPrice: 900 },
      ],
      payments: [],
    });

    // paidThroughRemi (confirmedEntryCount) + NFC + otherOrderless = dogsEntered
    expect(metrics.confirmedEntryCount + metrics.notForCompetitionCount + metrics.otherOrderlessCount)
      .toBe(metrics.dogsEnteredCount);
    expect(metrics.confirmedEntryFeesPence + metrics.notForCompetitionFeesPence + metrics.otherOrderlessFeesPence)
      .toBe(metrics.dogsEnteredFeesPence);

    // "Total income" (clubReceivablePence) = paid entry fees (confirmed +
    // withdrawn-kept, per the existing unchanged math) + sundries.
    expect(metrics.confirmedEntryFeesPence + metrics.withdrawnKeptPence).toBe(metrics.paidEntryFeesPence);
    expect(metrics.paidEntryFeesPence + metrics.paidSundryRevenuePence).toBe(metrics.clubReceivablePence);

    // allEntries = dogsEntered + withdrawn + cancelled
    expect(metrics.dogsEnteredCount + metrics.withdrawnEntryCount + metrics.cancelledEntryCount)
      .toBe(metrics.allEntriesCount);
  });

  it('splits Junior Handler entries within confirmedEntryCount', () => {
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'paid', totalAmount: 2000, platformFeePence: 30 }],
      entries: [
        entryRow({ id: 'standard-1', orderId: 'o1', status: 'confirmed', totalFee: 1500, entryType: 'standard' }),
        entryRow({ id: 'jh-1', orderId: 'o1', status: 'confirmed', totalFee: 500, entryType: 'junior_handler' }),
      ],
      sundries: [],
      payments: [],
    });

    expect(metrics.confirmedEntryCount).toBe(2);
    expect(metrics.confirmedJhEntryCount).toBe(1);
    expect(metrics.confirmedJhFeesPence).toBe(500);
  });
});
