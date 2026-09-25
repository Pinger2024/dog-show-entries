import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { orders, payments, entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeOrg, makeBreed, makeShow, makeDog } from '../helpers/factories';
import { reconcileSettlement } from '@/server/services/settlement-reconciliation';

/**
 * Guards the fix for GSD Club of Scotland (INV-GSD-CLUB-OF-SCOTLAND-0001,
 * 19 Aug 2026): two independent money computations — computeShowMetrics and
 * settlement-itemisation — could silently disagree, and nothing compared
 * them before a statement issued. See settlement-reconciliation.ts.
 */

async function adminCaller() {
  return createTestCaller(await makeUser({ role: 'admin' }));
}

async function seedOrder(opts: {
  showId: string;
  exhibitorId: string;
  amount: number;
  platformFeePence?: number;
  status?: 'paid' | 'refunded';
  stripePaymentIntentId?: string | null;
}) {
  const [row] = await testDb
    .insert(orders)
    .values({
      showId: opts.showId,
      exhibitorId: opts.exhibitorId,
      status: opts.status ?? 'paid',
      totalAmount: opts.amount,
      platformFeePence: opts.platformFeePence ?? 0,
      stripePaymentIntentId:
        opts.stripePaymentIntentId === null ? null : opts.stripePaymentIntentId ?? `pi_test_${randomUUID()}`,
    })
    .returning();
  return row!;
}

async function seedPayment(opts: {
  orderId: string;
  amount: number;
  feePence?: number | null;
  type?: 'initial' | 'refund';
  status?: 'succeeded' | 'refunded' | 'partially_refunded';
  refundAmount?: number | null;
  stripePaymentId?: string | null;
}) {
  const [row] = await testDb
    .insert(payments)
    .values({
      orderId: opts.orderId,
      stripePaymentId: opts.stripePaymentId === null ? null : opts.stripePaymentId ?? `pi_${randomUUID()}`,
      amount: opts.amount,
      status: opts.status ?? 'succeeded',
      type: opts.type ?? 'initial',
      feePence: opts.feePence ?? null,
      refundAmount: opts.refundAmount ?? null,
    })
    .returning();
  return row!;
}

const NO_DISCOUNT = { mode: 'fixed' as const, value: 0, label: 'No discount' };
const baseIssueInput = (showId: string) => ({
  showId,
  packageFeePence: 1000,
  packageFeeDescription: 'Test package fee',
  discount: NO_DISCOUNT,
});

/**
 * Rebuilds the GSD Club of Scotland shape: 3 paid online orders, 1 fully
 * refunded order (excluded upstream — Maxine Cowan's £51.00 entry + £1.51
 * platform fee), and 1 direct/offline paid order. Every paid online order
 * gets a captured Stripe fee so the fixture reconciles cleanly on current
 * (fixed) code.
 */
async function seedScotlandShapedShow() {
  const breed = await makeBreed();
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg({ name: 'Test Scotland Reconciliation Club' });
  const show = await makeShow({ organisationId: org.id, breedId: breed.id });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

  const orderA = await seedOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 5000, platformFeePence: 150 });
  await seedPayment({ orderId: orderA.id, amount: 5150, feePence: 170 });
  await testDb.insert(entries).values({
    showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderA.id, status: 'confirmed', totalFee: 5000,
  });

  const orderB = await seedOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 3000, platformFeePence: 100 });
  await seedPayment({ orderId: orderB.id, amount: 3100, feePence: 110 });
  await testDb.insert(entries).values({
    showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderB.id, status: 'confirmed', totalFee: 3000,
  });

  const orderC = await seedOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 2000, platformFeePence: 80 });
  await seedPayment({ orderId: orderC.id, amount: 2080, feePence: 90 });
  await testDb.insert(entries).values({
    showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderC.id, status: 'confirmed', totalFee: 2000,
  });

  // Fully refunded order — Maxine Cowan shape: £51.00 entry + £1.51 platform
  // fee, refunded in full. Excluded upstream (status='refunded', not 'paid').
  const orderRefunded = await seedOrder({
    showId: show.id, exhibitorId: exhibitor.id, amount: 5100, platformFeePence: 151, status: 'refunded',
  });
  await testDb.insert(entries).values({
    showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderRefunded.id, status: 'cancelled', totalFee: 5100,
  });
  await seedPayment({ orderId: orderRefunded.id, amount: 5251, status: 'refunded', refundAmount: 5251 });
  await seedPayment({ orderId: orderRefunded.id, amount: 5251, type: 'refund', status: 'refunded' });

  // Direct/offline paid order — the club already holds this money, Remi never touched it.
  const orderOffline = await seedOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 1500, stripePaymentIntentId: null });
  await testDb.insert(entries).values({
    showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderOffline.id, status: 'confirmed', totalFee: 1500,
  });

  return { show, org, exhibitor, dog, orderA };
}

describe('reconcileSettlement — Scotland shape (acceptance gate)', () => {
  it('reconciles to the penny: 3 paid online + 1 fully refunded (excluded) + 1 direct', async () => {
    const { show } = await seedScotlandShapedShow();
    const result = await reconcileSettlement(testDb, show.id);

    expect(result.metricsPence).toBe(10_000); // orderA + orderB + orderC, offline excluded, refunded order excluded
    expect(result.itemisedPence).toBe(10_000);
    expect(result.deltaPence).toBe(0);
    expect(result.discountGapPence).toBe(0);
    expect(result.cardFeeItemisedPence).toBe(370); // 170 + 110 + 90
    expect(result.cardFeeIndependentPence).toBe(370);
    expect(result.cardFeeDeltaPence).toBe(0);
    expect(result.stripeGrossPence).toBe(10_330); // 5150 + 3100 + 2080
    expect(result.stripePlatformFeePence).toBe(330); // 150 + 100 + 80
    expect(result.refundedItemisedPence).toBe(0);
    expect(result.stripeCollectedPence).toBe(10_000);
    expect(result.stripeDeltaPence).toBe(0);
    expect(result.missingFeeCount).toBe(0);
    expect(result.ok).toBe(true);
  });

  it('issue succeeds and freezes the reconciled figures', async () => {
    const { show } = await seedScotlandShapedShow();
    const caller = await adminCaller();
    const invoice = await caller.adminInvoices.issue(baseIssueInput(show.id));
    expect(invoice.viaRemiTotalPence).toBe(10_000);
  });

  it('preview surfaces the reconciliation result without writing anything', async () => {
    const { show } = await seedScotlandShapedShow();
    const caller = await adminCaller();
    const preview = await caller.adminInvoices.preview(baseIssueInput(show.id));
    expect(preview.reconciliation.ok).toBe(true);
    expect(preview.reconciliation.deltaPence).toBe(0);

    const rows = await testDb.query.invoices.findMany();
    expect(rows).toHaveLength(0);
  });
});

describe('reconcileSettlement — missing captured Stripe fee (RED TEST 2)', () => {
  it('refuses to issue when a paid online payment still has NULL fee_pence after the heal', async () => {
    const { show, exhibitor, dog } = await seedScotlandShapedShow();
    const gapOrder = await seedOrder({ showId: show.id, exhibitorId: exhibitor.id, amount: 1000 });
    await seedPayment({ orderId: gapOrder.id, amount: 1000, feePence: null });
    await testDb.insert(entries).values({
      showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: gapOrder.id, status: 'confirmed', totalFee: 1000,
    });

    const result = await reconcileSettlement(testDb, show.id);
    expect(result.missingFeeCount).toBe(1);
    expect(result.ok).toBe(false);

    const caller = await adminCaller();
    await expect(caller.adminInvoices.issue(baseIssueInput(show.id))).rejects.toThrow(/does not reconcile/i);

    const rows = await testDb.query.invoices.findMany();
    expect(rows).toHaveLength(0);
  });
});

describe('reconcileSettlement — supersede refuses on mismatch too (RED TEST 3)', () => {
  it('refuses to supersede when the current data no longer reconciles', async () => {
    const { show, orderA } = await seedScotlandShapedShow();
    const caller = await adminCaller();
    const original = await caller.adminInvoices.issue(baseIssueInput(show.id));
    expect(original.viaRemiTotalPence).toBe(10_000);

    // Data drifts out of reconciliation after issue — e.g. a fee capture got
    // cleared, or a new unhealed payment landed — before a correction is made.
    await testDb.update(payments).set({ feePence: null }).where(eq(payments.orderId, orderA.id));

    await expect(
      caller.adminInvoices.supersede({ ...baseIssueInput(show.id), oldId: original.id }),
    ).rejects.toThrow(/does not reconcile/i);

    const oldRefetched = await caller.adminInvoices.get({ id: original.id });
    expect(oldRefetched.supersededById).toBeNull();
  });
});
