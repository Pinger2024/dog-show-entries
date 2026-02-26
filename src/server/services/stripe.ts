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
  metadata: {
    showId: string;
    dogId: string;
    exhibitorId: string;
    classIds: string;
    entryId: string;
  }
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
