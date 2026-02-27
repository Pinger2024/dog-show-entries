import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export async function createPaymentIntent(
  amount: number,
  metadata: Record<string, string>
) {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount,
    currency: 'gbp',
    metadata,
    automatic_payment_methods: {
      enabled: true,
    },
  });
}

/**
 * Create or retrieve a Stripe customer for an organisation.
 * If an existing customer ID is provided and valid, returns it.
 * Otherwise creates a new customer.
 */
export async function getOrCreateStripeCustomer(
  organisationId: string,
  organisationName: string,
  email: string,
  existingCustomerId?: string | null
): Promise<string> {
  const stripe = getStripe();

  // If we already have a customer ID, verify it still exists
  if (existingCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(existingCustomerId);
      if (!existing.deleted) {
        return existingCustomerId;
      }
    } catch {
      // Customer not found or deleted — create a new one
    }
  }

  const customer = await stripe.customers.create({
    name: organisationName,
    email,
    metadata: {
      organisationId,
    },
  });

  return customer.id;
}

/**
 * Create a Stripe Checkout session for a subscription.
 * Returns the checkout session URL for redirect.
 */
export async function createSubscriptionCheckout(
  customerId: string,
  priceId: string,
  organisationId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      organisationId,
    },
    subscription_data: {
      metadata: {
        organisationId,
      },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) {
    throw new Error('Stripe checkout session created without a URL');
  }

  return session.url;
}

/**
 * Create a Stripe Customer Portal session for managing billing.
 * Returns the portal session URL for redirect.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}
