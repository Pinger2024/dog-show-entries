import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as stripeService from '@/server/services/stripe';
import { payments } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { makeUser, makeOrg, makeShow, makeOrder, makePayment } from '../helpers/factories';
import { healMissingStripeFees } from '@/server/services/stripe-fee-heal';

/**
 * healMissingStripeFees is the durable, server-side fix for the fee-capture
 * gap the webhook can miss (task: self-healing Stripe fee capture,
 * 2026-08-18). These tests mock the Stripe client the same way the webhook
 * tests do (`vi.mocked(stripeService.getStripe)`) and use the real local
 * `remi_test` Postgres via the standard factory/testDb pattern — never a
 * mocked DB, and never a real Stripe API call.
 */

async function seedShowWithPaidOrder() {
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg();
  const show = await makeShow({ organisationId: org.id });
  const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
  return { exhibitor, org, show, order };
}

function stubExpandedCharge(fee: number, net: number, txnId: string) {
  return {
    latest_charge: {
      balance_transaction: { id: txnId, fee, net },
      payment_method_details: { card: { brand: 'visa', country: 'GB' } },
    },
  };
}

describe('healMissingStripeFees', () => {
  it('heals a mixed gap — 2 charge rows via the Stripe API + 1 refund row with no API call', async () => {
    const { show, order } = await seedShowWithPaidOrder();

    await makePayment({ orderId: order.id, stripePaymentId: 'pi_heal_mix_1', amount: 2000, status: 'succeeded', type: 'initial' });
    await makePayment({ orderId: order.id, stripePaymentId: 'pi_heal_mix_2', amount: 3000, status: 'succeeded', type: 'initial' });
    const refundPayment = await makePayment({
      orderId: order.id,
      stripePaymentId: 'pi_heal_mix_1', // refunds share the original charge's PI id
      amount: 500,
      status: 'refunded',
      type: 'refund',
    });

    const retrieve = vi.fn(async (id: string) => {
      if (id === 'pi_heal_mix_1') return stubExpandedCharge(42, 1958, 'txn_heal_mix_1');
      if (id === 'pi_heal_mix_2') return stubExpandedCharge(57, 2943, 'txn_heal_mix_2');
      throw new Error(`unexpected retrieve for ${id}`);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(stripeService.getStripe).mockReturnValue({ paymentIntents: { retrieve } } as any);

    const result = await healMissingStripeFees(show.id);

    expect(result).toEqual({ healed: 3, refundRowsHealed: 1, remaining: 0, errors: 0 });

    // Two rows share the 'pi_heal_mix_1' PI (the charge + its refund) — fetch
    // everything on the order and filter to the charge row in code.
    const chargeRows = await testDb.query.payments.findMany({ where: eq(payments.orderId, order.id) });
    const healedCharge1 = chargeRows.find((r) => r.stripePaymentId === 'pi_heal_mix_1' && r.type !== 'refund');
    const healedCharge2 = chargeRows.find((r) => r.stripePaymentId === 'pi_heal_mix_2');
    expect(healedCharge1?.feePence).toBe(42);
    expect(healedCharge1?.netPence).toBe(1958);
    expect(healedCharge1?.balanceTransactionId).toBe('txn_heal_mix_1');
    expect(healedCharge1?.cardBrand).toBe('visa');
    expect(healedCharge1?.cardCountry).toBe('GB');
    expect(healedCharge2?.feePence).toBe(57);
    expect(healedCharge2?.netPence).toBe(2943);

    const healedRefund = await testDb.query.payments.findFirst({ where: eq(payments.id, refundPayment!.id) });
    expect(healedRefund?.feePence).toBe(0);
    expect(healedRefund?.netPence).toBe(-500);
    expect(healedRefund?.balanceTransactionId).toBeNull();
    expect(healedRefund?.cardBrand).toBeNull();
  });

  it('does NOT write a fee of 0 when the balance transaction is missing — counts it as remaining instead', async () => {
    const { show, order } = await seedShowWithPaidOrder();
    const gapPayment = await makePayment({
      orderId: order.id,
      stripePaymentId: 'pi_heal_no_bt',
      amount: 1000,
      status: 'succeeded',
      type: 'initial',
    });

    const retrieve = vi.fn(async () => ({
      latest_charge: {
        balance_transaction: null, // charge exists but Stripe hasn't attached the balance transaction yet
        payment_method_details: { card: { brand: 'visa', country: 'GB' } },
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(stripeService.getStripe).mockReturnValue({ paymentIntents: { retrieve } } as any);

    const result = await healMissingStripeFees(show.id);

    expect(result).toEqual({ healed: 0, refundRowsHealed: 0, remaining: 1, errors: 0 });

    const stillGapped = await testDb.query.payments.findFirst({ where: eq(payments.id, gapPayment!.id) });
    expect(stillGapped?.feePence).toBeNull();
    expect(stillGapped?.netPence).toBeNull();
    expect(stillGapped?.balanceTransactionId).toBeNull();
  });

  it('counts a Stripe API error per-row and never throws', async () => {
    const { show, order } = await seedShowWithPaidOrder();
    const gapPayment = await makePayment({
      orderId: order.id,
      stripePaymentId: 'pi_heal_api_error',
      amount: 1000,
      status: 'succeeded',
      type: 'initial',
    });

    const retrieve = vi.fn(async () => {
      throw new Error('Stripe API is down');
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(stripeService.getStripe).mockReturnValue({ paymentIntents: { retrieve } } as any);

    await expect(healMissingStripeFees(show.id)).resolves.toEqual({
      healed: 0,
      refundRowsHealed: 0,
      remaining: 0,
      errors: 1,
    });

    const stillGapped = await testDb.query.payments.findFirst({ where: eq(payments.id, gapPayment!.id) });
    expect(stillGapped?.feePence).toBeNull();
  });

  it('respects the row cap — rows beyond the cap are left as remaining, not attempted', async () => {
    const { show, order } = await seedShowWithPaidOrder();
    const CAP = 5;
    const TOTAL = CAP + 2;
    for (let i = 0; i < TOTAL; i++) {
      await makePayment({
        orderId: order.id,
        stripePaymentId: `pi_heal_cap_${i}`,
        amount: 1000,
        status: 'succeeded',
        type: 'initial',
      });
    }

    const retrieve = vi.fn(async (id: string) => stubExpandedCharge(10, 990, `txn_${id}`));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(stripeService.getStripe).mockReturnValue({ paymentIntents: { retrieve } } as any);

    const result = await healMissingStripeFees(show.id, { capRows: CAP, spacingMs: 0 });

    expect(result.healed).toBe(CAP);
    expect(result.remaining).toBe(TOTAL - CAP);
    expect(result.errors).toBe(0);
    expect(retrieve).toHaveBeenCalledTimes(CAP);

    const rows = await testDb.query.payments.findMany({ where: eq(payments.orderId, order.id) });
    const healedCount = rows.filter((r) => r.feePence !== null).length;
    const stillGappedCount = rows.filter((r) => r.feePence === null).length;
    expect(healedCount).toBe(CAP);
    expect(stillGappedCount).toBe(TOTAL - CAP);
  });

  it('is a no-op (all zeros) when the show has no fee-capture gap', async () => {
    const { show, order } = await seedShowWithPaidOrder();
    await makePayment({ orderId: order.id, stripePaymentId: 'pi_heal_complete', amount: 1000, status: 'succeeded', type: 'initial', feePence: 50 });

    const retrieve = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(stripeService.getStripe).mockReturnValue({ paymentIntents: { retrieve } } as any);

    const result = await healMissingStripeFees(show.id);

    expect(result).toEqual({ healed: 0, refundRowsHealed: 0, remaining: 0, errors: 0 });
    expect(retrieve).not.toHaveBeenCalled();
  });
});
