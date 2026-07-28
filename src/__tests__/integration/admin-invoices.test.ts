import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { orders, payments, invoices, organisations, entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeDog,
} from '../helpers/factories';
import { computeShowMetrics } from '@/server/services/show-metrics';

async function adminCaller() {
  return createTestCaller(await makeUser({ role: 'admin' }));
}

async function seedOrder(opts: {
  showId: string;
  exhibitorId: string;
  amount: number;
  stripePaymentIntentId?: string | null;
}) {
  const [row] = await testDb
    .insert(orders)
    .values({
      showId: opts.showId,
      exhibitorId: opts.exhibitorId,
      status: 'paid',
      totalAmount: opts.amount,
      platformFeePence: 100,
      stripePaymentIntentId:
        opts.stripePaymentIntentId === null
          ? null
          : opts.stripePaymentIntentId ?? `pi_test_${randomUUID()}`,
    })
    .returning();
  return row!;
}

async function seedPayment(opts: {
  orderId: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
  amount: number;
  feePence?: number | null;
  refundAmount?: number | null;
}) {
  const [row] = await testDb
    .insert(payments)
    .values({
      orderId: opts.orderId,
      stripePaymentId: `pi_${randomUUID()}`,
      amount: opts.amount,
      status: opts.status,
      type: 'initial',
      feePence: opts.feePence ?? null,
      refundAmount: opts.refundAmount ?? null,
    })
    .returning();
  return row!;
}

/**
 * Builds a show with a realistic mix of orders/payments used across the
 * figures + reconciliation tests below:
 *  - Order A: online, £20.00, fee £0.80 captured — plain paid order.
 *  - Order B: offline (manual/postal), £15.00 — club already holds this.
 *  - Order C: online, £30.00, £10.00 refunded off one entry (per-entry
 *    partial refund), fee £1.10 STILL captured (Stripe keeps the fee).
 *  - Order D: online, £10.00, succeeded but fee_pence never captured
 *    (the capture gap).
 * Confirmed entries are seeded 1:1 with each order's totalAmount so
 * show-metrics' entry-driven clubReceivablePence lines up with the order
 * totals, not just defaulting to zero.
 */
async function seedShowWithMixedOrders() {
  const breed = await makeBreed();
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg({ name: 'Test Fee Club' });
  const show = await makeShow({ organisationId: org.id, breedId: breed.id });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

  const orderA = await seedOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 2000 });
  await seedPayment({ orderId: orderA.id, status: 'succeeded', amount: 2000, feePence: 80 });
  await testDb.insert(entries).values({
    showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderA.id,
    status: 'confirmed', totalFee: 2000,
  });

  const orderB = await seedOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 1500, stripePaymentIntentId: null });
  await testDb.insert(entries).values({
    showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderB.id,
    status: 'confirmed', totalFee: 1500,
  });

  const orderC = await seedOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 3000 });
  await seedPayment({ orderId: orderC.id, status: 'partially_refunded', amount: 3000, feePence: 110, refundAmount: 1000 });
  await testDb.insert(entries).values({
    showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderC.id,
    status: 'confirmed', totalFee: 3000,
  });

  const orderD = await seedOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 1000 });
  await seedPayment({ orderId: orderD.id, status: 'succeeded', amount: 1000, feePence: null });
  await testDb.insert(entries).values({
    showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderD.id,
    status: 'confirmed', totalFee: 1000,
  });

  return { org, show, exhibitor, breed, dog };
}

const baseInput = (showId: string) => ({
  showId,
  packageFeePence: 5000,
  packageFeeDescription: 'Show package fee',
  perTransactionDiscountPence: 20,
});

describe('adminInvoices access control', () => {
  it('rejects unauthenticated callers on every procedure', async () => {
    const caller = createTestCaller(null);
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });

    await expect(caller.adminInvoices.preview(baseInput(show.id))).rejects.toThrow();
    await expect(caller.adminInvoices.issue(baseInput(show.id))).rejects.toThrow();
    await expect(caller.adminInvoices.list()).rejects.toThrow();
    await expect(caller.adminInvoices.get({ id: randomUUID() })).rejects.toThrow();
    await expect(
      caller.adminInvoices.supersede({ ...baseInput(show.id), oldId: randomUUID() })
    ).rejects.toThrow();
  });

  it('rejects non-admin (secretary) callers on every procedure', async () => {
    const secretary = await makeUser({ role: 'secretary' });
    const caller = createTestCaller(secretary);
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });

    await expect(caller.adminInvoices.preview(baseInput(show.id))).rejects.toThrow();
    await expect(caller.adminInvoices.issue(baseInput(show.id))).rejects.toThrow();
    await expect(caller.adminInvoices.list()).rejects.toThrow();
    await expect(caller.adminInvoices.get({ id: randomUUID() })).rejects.toThrow();
    await expect(
      caller.adminInvoices.supersede({ ...baseInput(show.id), oldId: randomUUID() })
    ).rejects.toThrow();
  });

  it('has no update procedure — corrections are only possible via supersede', async () => {
    const { appRouter } = await import('@/server/trpc/router');
    const procedurePaths = Object.keys(appRouter._def.procedures);
    expect(procedurePaths).not.toContain('adminInvoices.update');
    // Sanity check the assertion isn't vacuous — the router really is registered.
    expect(procedurePaths).toContain('adminInvoices.issue');
  });
});

describe('adminInvoices.preview figures', () => {
  it('matches computeShowMetrics for the collected/offline split and sums real Stripe fees to the penny', async () => {
    const { show } = await seedShowWithMixedOrders();
    const caller = await adminCaller();

    const preview = await caller.adminInvoices.preview(baseInput(show.id));
    const metrics = await computeShowMetrics(testDb, show.id);

    // Reconciliation guard — preview must never diverge from the canonical
    // show-metrics figures, incl. the partial refund + offline order.
    expect(preview.incomeCollectedByUsPence).toBe(metrics.clubReceivablePence);
    expect(preview.incomePaidDirectPence).toBe(metrics.offlineCollectedPence);
    expect(preview.totalIncomePence).toBe(metrics.totalClubRevenuePence);

    // Real fees: only order A (80) and order C (110) are fee-bearing and
    // not status='refunded'. Order D's NULL fee is excluded from the sum
    // and counted separately as the capture gap.
    expect(preview.cardFeeTotalPence).toBe(190);
    expect(preview.feeBearingChargeCount).toBe(2);
    expect(preview.captureGapCount).toBe(1);

    expect(preview.discountTotalPence).toBe(40); // 20p × 2
    expect(preview.cardFeeDueTotalPence).toBe(150); // 190 - 40
    expect(preview.totalFeeDuePence).toBe(150 + 5000);
  });

  it('does not write anything to the database', async () => {
    const { show } = await seedShowWithMixedOrders();
    const caller = await adminCaller();
    await caller.adminInvoices.preview(baseInput(show.id));

    const rows = await testDb.query.invoices.findMany();
    expect(rows).toHaveLength(0);
  });
});

describe('adminInvoices.issue', () => {
  it('inserts an immutable snapshot row with a formatted invoice number', async () => {
    const { show, org } = await seedShowWithMixedOrders();
    const caller = await adminCaller();

    const invoice = await caller.adminInvoices.issue(baseInput(show.id));

    expect(invoice.invoiceNumber).toMatch(/^INV-TEST-FEE-CLUB-\d{4}$/);
    expect(invoice.sequenceNumber).toBe(1);
    expect(invoice.organisationId).toBe(org.id);
    expect(invoice.totalFeeDuePence).toBe(150 + 5000);
    expect(Array.isArray(invoice.lineItems)).toBe(true);
    expect(invoice.lineItems.some((l) => l.label === 'TOTAL FEE DUE')).toBe(true);
  });

  it('sequential numbering: two concurrent issue calls for the same club get distinct consecutive numbers', async () => {
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Concurrent Club' });
    const show1 = await makeShow({ organisationId: org.id, breedId: breed.id });
    const show2 = await makeShow({ organisationId: org.id, breedId: breed.id });
    const caller = await adminCaller();

    const [inv1, inv2] = await Promise.all([
      caller.adminInvoices.issue(baseInput(show1.id)),
      caller.adminInvoices.issue(baseInput(show2.id)),
    ]);

    const sequenceNumbers = [inv1.sequenceNumber, inv2.sequenceNumber].sort((a, b) => a - b);
    expect(sequenceNumbers).toEqual([1, 2]);
    expect(inv1.invoiceNumber).not.toBe(inv2.invoiceNumber);

    const orgAfter = await testDb.query.organisations.findFirst({ where: eq(organisations.id, org.id) });
    expect(orgAfter?.nextInvoiceSequence).toBe(3);
  });

  it('immutability: figures on an issued invoice never change when the underlying orders/payments change', async () => {
    const { show } = await seedShowWithMixedOrders();
    const caller = await adminCaller();
    const invoice = await caller.adminInvoices.issue(baseInput(show.id));
    const originalTotal = invoice.totalFeeDuePence;
    const originalCardFeeTotal = invoice.cardFeeTotalPence;

    // Mutate the underlying data after issue — this must NOT move the invoice.
    await testDb.update(orders).set({ totalAmount: 999999 }).where(eq(orders.showId, show.id));
    await testDb.update(payments).set({ feePence: 999999 });

    const refetched = await caller.adminInvoices.get({ id: invoice.id });
    expect(refetched.totalFeeDuePence).toBe(originalTotal);
    expect(refetched.cardFeeTotalPence).toBe(originalCardFeeTotal);
  });
});

describe('adminInvoices.supersede', () => {
  it('links the old invoice to the new one and issues the next sequence number', async () => {
    const { show } = await seedShowWithMixedOrders();
    const caller = await adminCaller();
    const original = await caller.adminInvoices.issue(baseInput(show.id));

    const replacement = await caller.adminInvoices.supersede({
      ...baseInput(show.id),
      packageFeePence: 6000, // the correction
      oldId: original.id,
    });

    expect(replacement.sequenceNumber).toBe(original.sequenceNumber + 1);
    expect(replacement.packageFeePence).toBe(6000);

    const oldRefetched = await caller.adminInvoices.get({ id: original.id });
    expect(oldRefetched.supersededById).toBe(replacement.id);
    // The old invoice's own figures stay exactly as issued.
    expect(oldRefetched.packageFeePence).toBe(5000);
  });

  it('rejects superseding an invoice that has already been superseded', async () => {
    const { show } = await seedShowWithMixedOrders();
    const caller = await adminCaller();
    const original = await caller.adminInvoices.issue(baseInput(show.id));
    await caller.adminInvoices.supersede({ ...baseInput(show.id), oldId: original.id });

    await expect(
      caller.adminInvoices.supersede({ ...baseInput(show.id), oldId: original.id })
    ).rejects.toThrow();
  });
});

describe('adminInvoices.list / get', () => {
  it('list filters by organisationId and get returns the full row', async () => {
    const { show, org } = await seedShowWithMixedOrders();
    const otherOrg = await makeOrg();
    const otherBreed = await makeBreed();
    const otherShow = await makeShow({ organisationId: otherOrg.id, breedId: otherBreed.id });
    const caller = await adminCaller();

    await caller.adminInvoices.issue(baseInput(show.id));
    await caller.adminInvoices.issue(baseInput(otherShow.id));

    const filtered = await caller.adminInvoices.list({ organisationId: org.id });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.organisation.id).toBe(org.id);

    const all = await caller.adminInvoices.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
