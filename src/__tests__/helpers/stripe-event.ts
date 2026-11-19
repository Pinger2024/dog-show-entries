import { vi } from 'vitest';
import * as stripeService from '@/server/services/stripe';

/** Shape of the expanded charge+balance_transaction the fee-capture call reads. */
export type StubExpandedCharge = {
  balance_transaction: { id: string; fee: number; net: number } | null;
  payment_method_details?: { card?: { brand?: string; country?: string } };
};

/**
 * Bypass Stripe's webhook signature verification by overriding `getStripe()`
 * to return a stub whose `webhooks.constructEvent` returns the test's event.
 * Pass this whatever payload the test wants to drive the route handler with.
 *
 * `retrievePaymentIntent` configures the second call the webhook makes for
 * `payment_intent.succeeded` — it retrieves the PI expanded with
 * `latest_charge.balance_transaction` to capture Stripe's actual fee/net
 * (required in every payment_intent.succeeded test now that fee capture
 * exists, or the real `paymentIntents.retrieve` — unstubbed — would throw).
 * Pass a function to simulate a failure (e.g. `() => { throw new Error(...) }`)
 * to exercise the never-block guarantee.
 */
export function injectStripeEvent(
  event: unknown,
  opts: {
    retrievePaymentIntent?:
      | StubExpandedCharge
      | (() => StubExpandedCharge);
  } = {}
) {
  const defaultCharge: StubExpandedCharge = {
    balance_transaction: { id: 'txn_stub', fee: 57, net: 943 },
    payment_method_details: { card: { brand: 'visa', country: 'GB' } },
  };
  const chargeSource = opts.retrievePaymentIntent ?? defaultCharge;

  vi.mocked(stripeService.getStripe).mockReturnValue({
    webhooks: { constructEvent: vi.fn(() => event) },
    // The subscription path also calls subscriptions.retrieve; stub loosely.
    subscriptions: { retrieve: vi.fn(async () => ({ items: { data: [] } })) },
    paymentIntents: {
      retrieve: vi.fn(async () => {
        const charge = typeof chargeSource === 'function' ? chargeSource() : chargeSource;
        return { latest_charge: charge };
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** Build a stub Request the Stripe webhook route handler will accept. */
export function buildStripeWebhookRequest(
  body = '{}',
  headers: Record<string, string> = { 'stripe-signature': 't=1,v1=stub' },
): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body,
  });
}
