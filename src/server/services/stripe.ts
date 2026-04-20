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

/**
 * Platform-side PaymentIntent — money lands in Remi's own Stripe balance.
 * Used for print orders (Remi buys from Mixam) and other platform-only
 * transactions. For exhibitor entry payments use `createEntryPaymentIntent`
 * instead, which routes the funds to the connected club account.
 */
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
 * Remi's handling fee model — £1 flat + 1% of the order subtotal, applied
 * per order and paid by the exhibitor (visible line at checkout).
 *
 * Decision recorded 2026-04-14: hybrid beats pure flat because Stripe's
 * 1.5% card fee eats a bigger share of higher-value orders; at £20 the
 * club still nets ~£18.50, at £100 they still net ~£98.
 *
 * @param subtotalPence club-collected entry + sundry subtotal in pence
 * @returns platform fee in pence (always a whole integer)
 */
export function calculatePlatformFee(subtotalPence: number): number {
  return 100 + Math.round(subtotalPence * 0.01);
}

/**
 * Entry-payment PaymentIntent using Stripe Connect destination charges.
 *
 * `amount` is the total the exhibitor is charged (subtotal + handling fee).
 * `applicationFeeAmount` is Remi's cut — Stripe routes the remainder to the
 * club's connected account.
 *
 * `on_behalf_of` puts the charge on the club's Stripe statement descriptor
 * AND makes the club's balance liable for refunds and chargebacks — per
 * 2026-04-20 decision, the money was the club's so the refund risk is
 * theirs too. Without on_behalf_of, refunds would be pulled from Remi's
 * balance, which we don't want.
 */
export async function createEntryPaymentIntent(params: {
  amount: number;
  applicationFeeAmount: number;
  connectedAccountId: string;
  metadata: Record<string, string>;
}) {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: 'gbp',
    automatic_payment_methods: { enabled: true },
    application_fee_amount: params.applicationFeeAmount,
    on_behalf_of: params.connectedAccountId,
    transfer_data: { destination: params.connectedAccountId },
    metadata: params.metadata,
  });
}

/**
 * Create a new Standard connected account for a club. Standard accounts
 * mean the club is the merchant of record — they log in at Stripe directly,
 * complete their own KYC, and we're charged no additional Connect fees per
 * payout. Best fit for small UK dog clubs.
 */
export async function createConnectAccount(params: {
  email: string;
  organisationId: string;
  organisationName: string;
}) {
  const stripe = getStripe();
  return stripe.accounts.create({
    type: 'standard',
    country: 'GB',
    email: params.email,
    business_profile: {
      name: params.organisationName,
      mcc: '7941', // Commercial sports / athletic fields — closest MCC for a dog show.
    },
    metadata: {
      organisationId: params.organisationId,
    },
  });
}

/**
 * Generate a one-time link that takes the club through Stripe's hosted
 * onboarding flow — KYC, bank details, confirmation. The link is valid
 * for a few minutes; call this fresh each time the user clicks through
 * rather than caching the URL.
 *
 * `refreshUrl` is where Stripe sends the user if the link expires while
 * they're using it; they land back on our page and we can generate a
 * new one. `returnUrl` is where they end up after completing the flow.
 */
export async function createConnectOnboardingLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}) {
  const stripe = getStripe();
  return stripe.accountLinks.create({
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: 'account_onboarding',
  });
}

/**
 * Fetch the latest state of a connected account. Used after onboarding
 * redirects and from the `account.updated` webhook to refresh our
 * mirror of details_submitted / charges_enabled / payouts_enabled.
 */
export async function retrieveConnectAccount(accountId: string) {
  const stripe = getStripe();
  return stripe.accounts.retrieve(accountId);
}

/**
 * Collapse Stripe's Account flags into our single status enum. Keep this
 * the only place that translates flags → status so the webhook handler
 * and the tRPC refresh procedure agree.
 */
export function deriveAccountStatus(
  account: Stripe.Account
): 'pending' | 'restricted' | 'active' | 'rejected' {
  // Stripe uses `requirements.disabled_reason` starting with 'rejected' for
  // fully-declined accounts. Check that first because it trumps everything.
  const disabledReason = account.requirements?.disabled_reason ?? '';
  if (disabledReason.startsWith('rejected')) return 'rejected';

  if (account.charges_enabled) return 'active';
  if (account.details_submitted) return 'restricted';
  return 'pending';
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
