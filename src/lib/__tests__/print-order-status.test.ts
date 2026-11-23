import { describe, it, expect } from 'vitest';
import { PRINT_ORDER_PAID_STATUSES, isPrintOrderPaid } from '../print-products';

/**
 * ONE owner (CLAUDE.md "One owner per rule") for "has this print order
 * already been paid / advanced past payment". Previously hand-typed three
 * times: twice in the Stripe print-order webhook handlers (an `||` chain and
 * an inline array literal) and once as `PRINT_PAID_STATUSES` in
 * admin-dashboard.ts. See print-order-one-owner.test.ts for the guard.
 */
describe('isPrintOrderPaid', () => {
  it('is true for every status from paid through delivered', () => {
    for (const status of PRINT_ORDER_PAID_STATUSES) {
      expect(isPrintOrderPaid(status)).toBe(true);
    }
  });

  it('matches the exact five known statuses (paid, submitted, in_production, dispatched, delivered)', () => {
    expect([...PRINT_ORDER_PAID_STATUSES].sort()).toEqual(
      ['delivered', 'dispatched', 'in_production', 'paid', 'submitted'].sort(),
    );
  });

  it('is false for pre-payment / terminal-failure statuses', () => {
    for (const status of ['draft', 'awaiting_payment', 'cancelled', 'failed']) {
      expect(isPrintOrderPaid(status)).toBe(false);
    }
  });

  it('is false for null/undefined (no order / no status yet)', () => {
    expect(isPrintOrderPaid(null)).toBe(false);
    expect(isPrintOrderPaid(undefined)).toBe(false);
  });
});
