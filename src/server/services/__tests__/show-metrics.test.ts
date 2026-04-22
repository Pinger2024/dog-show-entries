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
  { id: 'entry-abandoned-1', orderId: 'order-cancelled', status: 'cancelled', totalFee: 0, deletedAt: new Date() },
  { id: 'entry-abandoned-2', orderId: 'order-cancelled', status: 'cancelled', totalFee: 1800, deletedAt: new Date() },
  // Paid order — 2 confirmed (fee stored on one entry, typical of tiered entry fees)
  { id: 'entry-paid-1', orderId: 'order-paid', status: 'confirmed', totalFee: 0, deletedAt: null },
  { id: 'entry-paid-2', orderId: 'order-paid', status: 'confirmed', totalFee: 1800, deletedAt: null },
  // Pending order — exhibitor withdrew after starting checkout
  { id: 'entry-withdrawn', orderId: 'order-pending', status: 'withdrawn', totalFee: 1800, deletedAt: null },
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
    expect(metrics.pendingOrderCount).toBe(1);
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

  it('counts only paid catalogue orders and splits printed vs online by name', () => {
    // One Printed Catalogue on the paid order — the cancelled + pending orders don't count
    expect(metrics.paidPrintedCatalogueCount).toBe(1);
    expect(metrics.paidOnlineCatalogueCount).toBe(0);
  });

  it('leaves pending revenue in its own bucket so it never inflates "active revenue"', () => {
    // Entry fees: 0 (entry is withdrawn, so not counted as pending)
    // Sundry lines on the pending order: still in flight, still pending = £29
    expect(metrics.pendingClubReceivablePence).toBe(2900);
    expect(metrics.pendingPlatformFeePence).toBe(147);
  });
});

describe('aggregateShowMetrics — refund accounting', () => {
  it('deducts refunds from clubReceivablePence but keeps paidEntryFees gross', () => {
    const metrics = aggregateShowMetrics({
      orders: [{ id: 'o1', status: 'paid', totalAmount: 5000, platformFeePence: 150 }],
      entries: [
        { id: 'e1', orderId: 'o1', status: 'confirmed', totalFee: 5000, deletedAt: null },
      ],
      sundries: [],
      payments: [{ orderId: 'o1', refundAmount: 2000 }],
    });

    expect(metrics.paidEntryFeesPence).toBe(5000);
    expect(metrics.refundedPence).toBe(2000);
    expect(metrics.clubReceivablePence).toBe(3000); // 5000 − 2000 refund
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
  });
});
