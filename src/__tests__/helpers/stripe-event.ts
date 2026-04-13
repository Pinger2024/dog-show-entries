import { vi } from 'vitest';
import * as stripeService from '@/server/services/stripe';

/**
 * Bypass Stripe's webhook signature verification by overriding `getStripe()`
 * to return a stub whose `webhooks.constructEvent` returns the test's event.
 * Pass this whatever payload the test wants to drive the route handler with.
 */
export function injectStripeEvent(event: unknown) {
  vi.mocked(stripeService.getStripe).mockReturnValue({
    webhooks: { constructEvent: vi.fn(() => event) },
    // The subscription path also calls subscriptions.retrieve; stub loosely.
    subscriptions: { retrieve: vi.fn(async () => ({ items: { data: [] } })) },
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
