import { describe, it, expect } from 'vitest';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeDog,
  makeEntry,
  makeOrder,
  makePayment,
} from '../helpers/factories';
import { computeShowMetrics } from '@/server/services/show-metrics';
import { computeSettlementItemisation } from '@/server/services/settlement-itemisation';
import { db } from '@/server/db';
import { payments } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Reproduces the North East GSD Regional bug (Michael 2026-08-27):
 * computeShowMetrics never read orders.donation_pence — the exhibitor's
 * discretionary donation at checkout (distinct from a "Donation" sundry
 * item). Real order 444e34e3… carried a £4.51 donation; grossChargedPence
 * ran £4.51 short of Σ payments.amount and the club receivable was £4.51
 * short too. settlement-itemisation.ts already reads donationPence and
 * treats it as club money, split by channel exactly like entry fees —
 * these tests pin show-metrics to the same invariant, and prove the two
 * services agree.
 */

const NO_DISCOUNT = { mode: 'fixed' as const, value: 0, label: 'No discount' };
const ITEMISATION_OPTS = {
  packageFeePence: 0,
  packageFeeDescription: 'Test package fee',
  discount: NO_DISCOUNT,
};

describe('computeShowMetrics — donation accounting against real orders/payments rows', () => {
  it('a confirmed Stripe-paid order with a donation: grossChargedPence equals Σ payments.amount, donation counted once in clubReceivable/totalClubRevenue', async () => {
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Test Donation Reconciliation Club' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    // £30.00 entry + £4.51 donation = £34.51 club money — matches the real
    // NE Regional order (444e34e3…).
    const order = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
      totalAmount: 3451,
      donationPence: 451,
    });
    await makeEntry({
      showId: show.id,
      dogId: dog!.id,
      exhibitorId: exhibitor.id,
      orderId: order.id,
      totalFee: 3000,
    });
    // The real Stripe charge — platformFeePence defaults to 0 via
    // makeOrder, so what Stripe actually charged equals order.totalAmount.
    await makePayment({
      orderId: order.id,
      stripePaymentId: 'pi_ne_donation',
      amount: 3451,
      status: 'succeeded',
    });

    const metrics = await computeShowMetrics(db, show.id);

    expect(metrics.clubReceivablePence).toBe(3451); // 3000 entry + 451 donation, exactly once
    expect(metrics.totalClubRevenuePence).toBe(3451);

    const paymentRows = await db
      .select({ amount: payments.amount })
      .from(payments)
      .where(eq(payments.orderId, order.id));
    const totalPaymentsAmount = paymentRows.reduce((sum, p) => sum + p.amount, 0);

    expect(totalPaymentsAmount).toBe(3451);
    expect(metrics.grossChargedPence).toBe(totalPaymentsAmount);
  });

  it('an OFFLINE order (no Stripe PI) with a donation lands in offlineCollectedPence/totalClubRevenuePence, never clubReceivablePence', async () => {
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Test Offline Donation Club' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const order = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
      totalAmount: 1451,
      donationPence: 451,
      stripePaymentIntentId: null, // postal/cash — the club already holds this money
    });
    await makeEntry({
      showId: show.id,
      dogId: dog!.id,
      exhibitorId: exhibitor.id,
      orderId: order.id,
      totalFee: 1000,
    });

    const metrics = await computeShowMetrics(db, show.id);

    expect(metrics.offlineCollectedPence).toBe(1451); // 1000 entry + 451 donation
    expect(metrics.clubReceivablePence).toBe(0); // Remi never touched this money
    expect(metrics.totalClubRevenuePence).toBe(1451);
    expect(metrics.grossChargedPence).toBe(0); // offline orders never touched Stripe
  });

  it('show-metrics and settlement-itemisation agree on the donation total for a mixed viaRemi/direct show', async () => {
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Test Mixed Channel Donation Club' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    // viaRemi order: £20.00 entry + £4.51 donation.
    const orderStripe = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
      totalAmount: 2451,
      donationPence: 451,
    });
    await makeEntry({
      showId: show.id,
      dogId: dog!.id,
      exhibitorId: exhibitor.id,
      orderId: orderStripe.id,
      totalFee: 2000,
    });
    await makePayment({
      orderId: orderStripe.id,
      stripePaymentId: 'pi_mixed_donation',
      amount: 2451,
      status: 'succeeded',
    });

    // direct (offline) order: £10.00 entry + £3.00 donation.
    const orderDirect = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
      totalAmount: 1300,
      donationPence: 300,
      stripePaymentIntentId: null,
    });
    await makeEntry({
      showId: show.id,
      dogId: dog!.id,
      exhibitorId: exhibitor.id,
      orderId: orderDirect.id,
      totalFee: 1000,
    });

    const itemisation = await computeSettlementItemisation(db, show.id, ITEMISATION_OPTS);
    const metrics = await computeShowMetrics(db, show.id);

    // No sundries, no refunds, no multi-dog discount gap (component sums
    // match each order's totalAmount exactly), so each channel's
    // itemisation total is directly comparable to show-metrics' split.
    expect(itemisation.viaRemi.totalPence).toBe(2451);
    expect(itemisation.direct.totalPence).toBe(1300);

    expect(metrics.clubReceivablePence).toBe(itemisation.viaRemi.totalPence);
    expect(metrics.offlineCollectedPence).toBe(itemisation.direct.totalPence);
    expect(metrics.totalClubRevenuePence).toBe(
      itemisation.viaRemi.totalPence + itemisation.direct.totalPence,
    );
  });
});
