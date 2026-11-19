import { describe, it, expect } from 'vitest';
import { chargePayment, orderPaymentSummary } from '../order-payment-summary';

/**
 * Reproduces the 2026-08-31 Financial-page bug photographed by Michael:
 * after a £2 partial refund, the order card's header and its "Refund entire
 * order" button both showed £2.00 — the REFUND row's amount — because the
 * payments relation loads unordered and the card's find() matched the refund
 * row (status 'refunded') before the charge row. The server would still have
 * refunded the true remaining £21.73, so the button label lied about a
 * money action by a factor of ten.
 */

// Paula's order, exactly as prod held it — refund row FIRST (arbitrary heap order).
const paulasPayments = [
  { type: 'refund', status: 'refunded', amount: 200, refundAmount: null, stripePaymentId: 'pi_x' },
  { type: 'initial', status: 'partially_refunded', amount: 2373, refundAmount: 200, stripePaymentId: 'pi_x' },
];

describe('chargePayment', () => {
  it('never returns a refund row, whatever the array order', () => {
    expect(chargePayment(paulasPayments)?.type).toBe('initial');
    expect(chargePayment([...paulasPayments].reverse())?.type).toBe('initial');
  });
  it('still finds a fully-refunded charge row (status refunded, type initial)', () => {
    const rows = [{ type: 'initial', status: 'refunded', amount: 2373, refundAmount: 2373, stripePaymentId: 'pi_x' }];
    expect(chargePayment(rows)?.amount).toBe(2373);
  });
  it('returns undefined when there is no settled charge row', () => {
    expect(chargePayment([])).toBeUndefined();
    expect(chargePayment([{ type: 'initial', status: 'pending', amount: 100, refundAmount: null, stripePaymentId: null }])).toBeUndefined();
  });
});

describe('orderPaymentSummary', () => {
  it('Paula: paid £23.73, refunded £2.00, remaining £21.73 — regardless of row order', () => {
    for (const rows of [paulasPayments, [...paulasPayments].reverse()]) {
      const s = orderPaymentSummary(rows, 0);
      expect(s.paid).toBe(2373);
      expect(s.refunded).toBe(200);
      expect(s.remaining).toBe(2173);
      expect(s.fullyRefunded).toBe(false);
      expect(s.hasRefundablePayment).toBe(true);
    }
  });
  it('fully refunded order reads as fully refunded', () => {
    const s = orderPaymentSummary([{ type: 'initial', status: 'refunded', amount: 2373, refundAmount: 2373, stripePaymentId: 'pi_x' }], 0);
    expect(s.fullyRefunded).toBe(true);
    expect(s.remaining).toBe(0);
  });
  it('a £0 order (free JH entry) is not "fully refunded"', () => {
    const s = orderPaymentSummary([], 0);
    expect(s.fullyRefunded).toBe(false);
    expect(s.hasRefundablePayment).toBe(false);
  });
  it('direct-to-club payment (no Stripe id) is not refundable via Stripe', () => {
    const s = orderPaymentSummary([{ type: 'initial', status: 'succeeded', amount: 1800, refundAmount: null, stripePaymentId: null }], 0);
    expect(s.hasRefundablePayment).toBe(false);
    expect(s.paid).toBe(1800);
  });
});
