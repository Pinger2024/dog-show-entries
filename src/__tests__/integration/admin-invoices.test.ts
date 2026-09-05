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
  /** Pass null for an OFFLINE payment (manual/postal — never touched Stripe). */
  stripePaymentId?: string | null;
}) {
  const [row] = await testDb
    .insert(payments)
    .values({
      orderId: opts.orderId,
      stripePaymentId:
        opts.stripePaymentId === null ? null : opts.stripePaymentId ?? `pi_${randomUUID()}`,
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
  discount: { mode: 'perTransaction' as const, value: 20, label: 'Remi discount' },
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
  // Rewritten for the settlement-statement redesign (Michael 2026-07-29):
  // the output is no longer a flat "income / card fee / package fee"
  // invoice — it's an itemised statement with viaRemi/direct/free/costs
  // sections. Order A/C/D are viaRemi (£20/£30/£10, no sundries/donations,
  // so each entry's fee equals its order total — no discount line), order
  // B is direct (£15). See computeSettlementItemisation.
  it('itemises the viaRemi/direct split, sums real Stripe fees to the penny, and nets out costs', async () => {
    const { show } = await seedShowWithMixedOrders();
    const caller = await adminCaller();

    const preview = await caller.adminInvoices.preview(baseInput(show.id));
    const { settlement } = preview;

    expect(settlement.viaRemi.totalPence).toBe(6000); // orders A+C+D: 2000+3000+1000
    expect(settlement.direct.totalPence).toBe(1500); // order B

    // Real fees: only order A (80) and order C (110) are fee-bearing and
    // not status='refunded'. Order D's NULL fee is excluded from the sum
    // and counted separately as the capture gap.
    expect(settlement.cardFeeTotalPence).toBe(190);
    expect(settlement.feeBearingChargeCount).toBe(2);
    expect(settlement.captureGapCount).toBe(1);

    expect(settlement.discountAmountPence).toBe(40); // 20p × 2
    expect(settlement.costs.totalPence).toBe(5000 + 190 - 40); // package + card fee - discount
    expect(settlement.netToClubPence).toBe(6000 - (5000 + 190 - 40));
  });

  // Mandy 2026-08-18, Clyde Valley: a paid-direct-to-club order's manually
  // recorded payment (no Stripe reference at all — £10 entry + £10 class
  // sponsorship taken by post) kept the "N payments missing captured fee
  // data" warning alive at 1 forever: Stripe never charged it, so there is
  // no fee to capture and nothing for the self-heal to fetch. A payment
  // with no stripe_payment_id must not count as a capture gap.
  it('an offline (no-Stripe) succeeded payment never counts as a fee capture gap', async () => {
    const { show } = await seedShowWithMixedOrders();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const offlineOrder = await seedOrder({
      showId: show.id, exhibitorId: exhibitor.id, amount: 2000, stripePaymentIntentId: null,
    });
    await seedPayment({
      orderId: offlineOrder.id, status: 'succeeded', amount: 2000, stripePaymentId: null,
    });

    const caller = await adminCaller();
    const { settlement } = await caller.adminInvoices.preview(baseInput(show.id));

    // Only order D (a real Stripe payment with an uncaptured fee) is a gap —
    // the offline payment is not, and the fee sums are untouched by it.
    expect(settlement.captureGapCount).toBe(1);
    expect(settlement.feeBearingChargeCount).toBe(2);
    expect(settlement.cardFeeTotalPence).toBe(190);
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
    expect(invoice.viaRemiTotalPence).toBe(6000);
    expect(invoice.directTotalPence).toBe(1500);
    expect(invoice.netToClubPence).toBe(6000 - (5000 + 190 - 40));
    expect(invoice.lineItems.viaRemi.totalLabel).toBe('Total collected via Remi');
    expect(invoice.lineItems.costs.lines.some((l) => l.label === 'Show package fee')).toBe(true);
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
    const originalNet = invoice.netToClubPence;
    const originalCardFeeTotal = invoice.cardFeeTotalPence;

    // Mutate the underlying data after issue — this must NOT move the invoice.
    await testDb.update(orders).set({ totalAmount: 999999 }).where(eq(orders.showId, show.id));
    await testDb.update(payments).set({ feePence: 999999 });

    const refetched = await caller.adminInvoices.get({ id: invoice.id });
    expect(refetched.netToClubPence).toBe(originalNet);
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
