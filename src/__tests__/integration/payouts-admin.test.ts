import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { orders, payouts } from '@/server/db/schema';
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
}) {
  const [row] = await testDb
    .insert(orders)
    .values({
      showId: opts.showId,
      exhibitorId: opts.exhibitorId,
      status: opts.status ?? 'paid',
      totalAmount: opts.amount,
      platformFeePence: 100 + Math.round(opts.amount * 0.01),
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
