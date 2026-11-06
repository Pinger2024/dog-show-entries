import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { orders, payouts, payments } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
} from '../helpers/factories';

/**
 * Admin payouts ledger — balances computed from paid orders minus
 * recorded payouts, recording a payout, and the per-org history view.
 */

async function adminCaller() {
  return createTestCaller(await makeUser({ role: 'admin' }));
}

async function seedPaidOrder(opts: {
  showId: string;
  exhibitorId: string;
  amount: number;
  status?: 'paid' | 'pending_payment' | 'cancelled';
  // Every real Stripe checkout has this set — omitting it here defaults
  // to a fake Stripe id so these orders model normal online entries.
  // Pass `stripePaymentIntentId: null` explicitly to model a manual
  // (postal/cash/direct-to-club) order a secretary recorded by hand.
  stripePaymentIntentId?: string | null;
}) {
  const [row] = await testDb
    .insert(orders)
    .values({
      showId: opts.showId,
      exhibitorId: opts.exhibitorId,
      status: opts.status ?? 'paid',
      totalAmount: opts.amount,
      platformFeePence: 100 + Math.round(opts.amount * 0.01),
      stripePaymentIntentId:
        opts.stripePaymentIntentId === null
          ? null
          : opts.stripePaymentIntentId ?? `pi_test_${randomUUID()}`,
    })
    .returning();
  return row!;
}

describe('adminDashboard.listPayouts', () => {
  it('sums paid orders per org as "owed" and surfaces outstanding correctly', async () => {
    const caller = await adminCaller();

    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });

    const org1 = await makeOrg({ name: 'Club A' });
    const show1 = await makeShow({ organisationId: org1.id, breedId: breed.id });
    await seedPaidOrder({ showId: show1.id, exhibitorId: exhibitor.id, amount: 2000 });
    await seedPaidOrder({ showId: show1.id, exhibitorId: exhibitor.id, amount: 3000 });

    const org2 = await makeOrg({ name: 'Club B' });
    const show2 = await makeShow({ organisationId: org2.id, breedId: breed.id });
    await seedPaidOrder({ showId: show2.id, exhibitorId: exhibitor.id, amount: 1500 });

    // Pending orders shouldn't count towards owed
    await seedPaidOrder({
      showId: show2.id,
      exhibitorId: exhibitor.id,
      amount: 9999,
      status: 'pending_payment',
    });

    const result = await caller.adminDashboard.listPayouts();

    const a = result.rows.find((r) => r.id === org1.id)!;
    expect(a.totalOwedPence).toBe(5000);
    expect(a.totalPaidPence).toBe(0);
    expect(a.outstandingPence).toBe(5000);

    const b = result.rows.find((r) => r.id === org2.id)!;
    expect(b.totalOwedPence).toBe(1500);
    expect(b.outstandingPence).toBe(1500);

    // Summary totals
    expect(result.summary.totalOwed).toBe(6500);
    expect(result.summary.totalPaid).toBe(0);
    expect(result.summary.totalOutstanding).toBe(6500);
  });

  it('subtracts recorded payouts from outstanding', async () => {
    const admin = await makeUser({ role: 'admin' });
    const caller = createTestCaller(admin);

    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    await seedPaidOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 5000 });

    await caller.adminDashboard.recordPayout({
      organisationId: org.id,
      amountPence: 3000,
      bankReference: 'TEST-BACS-001',
    });

    const result = await caller.adminDashboard.listPayouts();
    const row = result.rows.find((r) => r.id === org.id)!;
    expect(row.totalOwedPence).toBe(5000);
    expect(row.totalPaidPence).toBe(3000);
    expect(row.outstandingPence).toBe(2000);
  });

  it('nets off partial refunds on still-paid orders from the club owed amount', async () => {
    const caller = await adminCaller();
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Refund Club' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const order = await seedPaidOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 5000 });

    // Simulate a per-entry partial refund: the order stays 'paid' and the
    // refunded amount is recorded on the payment row. listPayouts must net this
    // off — otherwise we'd BACS the club the full gross and Remi (merchant of
    // record) eats the refund. Regression guard for the critical bug.
    await testDb.insert(payments).values({
      orderId: order.id,
      amount: 5000,
      status: 'partially_refunded',
      refundAmount: 1500,
      type: 'initial',
    });

    const result = await caller.adminDashboard.listPayouts();
    const row = result.rows.find((r) => r.id === org.id)!;
    expect(row.totalOwedPence).toBe(3500); // 5000 gross − 1500 refunded
    expect(row.outstandingPence).toBe(3500);
  });

  // ── Offline (manual/postal/cash) paid orders — live bug 2026-07-21 ──
  // secretary.createManualEntry inserts an order straight to status='paid'
  // with no stripe_payment_intent_id because the money never touched
  // Remi's Stripe balance — the club already holds it (postal/cash entry).
  // listPayouts used to sum these into "owed" from raw orders.total_amount
  // with no channel filter, which would have told Michael to BACS money
  // Remi never collected. Live at the time: GSD Club of Scotland (£46
  // across 3 manual orders, one of them £0), Clyde Valley (£20), South
  // Western (£3).
  it('excludes offline (manual) paid orders from "owed" and surfaces them as already-collected-by-the-club instead', async () => {
    const caller = await adminCaller();
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'GSD Club of Scotland' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });

    // A real Stripe-collected order — this is what Remi should BACS.
    await seedPaidOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 2000 });
    // Three manual entries recorded postal/cash, settled directly with the
    // club — no Stripe payment. One of them is £0 (a free manual entry),
    // which must be handled without blowing up.
    await seedPaidOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 2000, stripePaymentIntentId: null });
    await seedPaidOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 2600, stripePaymentIntentId: null });
    await seedPaidOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 0, stripePaymentIntentId: null });

    const result = await caller.adminDashboard.listPayouts();
    const row = result.rows.find((r) => r.id === org.id)!;

    // "Owed" (BACS this) counts only the Stripe order.
    expect(row.totalOwedPence).toBe(2000);
    expect(row.outstandingPence).toBe(2000);
    // The £46 of manual orders is surfaced separately — the club already
    // has it, so it must never be added to "owed".
    expect(row.totalOfflineCollectedPence).toBe(4600);

    expect(result.summary.totalOwed).toBe(2000);
    expect(result.summary.totalOfflineCollected).toBe(4600);
  });

  it('a club with ONLY offline orders owes nothing and is not double-counted into "owed"', async () => {
    const caller = await adminCaller();
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Clyde Valley' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });

    await seedPaidOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 2000, stripePaymentIntentId: null });

    const result = await caller.adminDashboard.listPayouts();
    const row = result.rows.find((r) => r.id === org.id)!;

    expect(row.totalOwedPence).toBe(0);
    expect(row.outstandingPence).toBe(0);
    expect(row.totalOfflineCollectedPence).toBe(2000);
  });
});

describe('adminDashboard.recordPayout', () => {
  it('inserts a payouts row stamped with the admin user id', async () => {
    const admin = await makeUser({ role: 'admin' });
    const caller = createTestCaller(admin);
    const org = await makeOrg();

    const result = await caller.adminDashboard.recordPayout({
      organisationId: org.id,
      amountPence: 4500,
      bankReference: 'REMI-May-ABC',
      notes: 'Spring champ payout',
    });

    expect(result.amountPence).toBe(4500);
    expect(result.bankReference).toBe('REMI-May-ABC');

    const stored = await testDb.query.payouts.findFirst({
      where: eq(payouts.id, result.id),
    });
    expect(stored?.paidByUserId).toBe(admin.id);
    expect(stored?.notes).toBe('Spring champ payout');
  });

  it('rejects non-admin callers', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(exhibitor);
    const org = await makeOrg();

    await expect(
      caller.adminDashboard.recordPayout({
        organisationId: org.id,
        amountPence: 1000,
      })
    ).rejects.toThrow();
  });
});

describe('adminDashboard.listPayoutHistory', () => {
  it('returns payouts newest-first for one org', async () => {
    const admin = await makeUser({ role: 'admin' });
    const caller = createTestCaller(admin);
    const org = await makeOrg();

    await caller.adminDashboard.recordPayout({
      organisationId: org.id,
      amountPence: 1000,
      bankReference: 'first',
    });
    await caller.adminDashboard.recordPayout({
      organisationId: org.id,
      amountPence: 2000,
      bankReference: 'second',
    });

    const history = await caller.adminDashboard.listPayoutHistory({
      organisationId: org.id,
    });

    expect(history).toHaveLength(2);
    // Newest first — second recorded should come first
    expect(history[0]?.bankReference).toBe('second');
    expect(history[1]?.bankReference).toBe('first');
  });
});
