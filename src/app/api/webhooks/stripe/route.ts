import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getStripe } from '@/server/services/stripe';
import { db } from '@/server/db';
import { entries, payments } from '@/server/db/schema';
import type Stripe from 'stripe';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const entryId = paymentIntent.metadata.entryId;

      if (!entryId) break;

      // Idempotent: check if already confirmed
      const entry = await db.query.entries.findFirst({
        where: eq(entries.id, entryId),
      });

      if (entry && entry.status !== 'confirmed') {
        await db
          .update(entries)
          .set({ status: 'confirmed' })
          .where(eq(entries.id, entryId));
      }

      // Update payment record
      await db
        .update(payments)
        .set({ status: 'succeeded' })
        .where(eq(payments.stripePaymentId, paymentIntent.id));

      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const entryId = paymentIntent.metadata.entryId;

      if (!entryId) break;

      await db
        .update(payments)
        .set({ status: 'failed' })
        .where(eq(payments.stripePaymentId, paymentIntent.id));

      break;
    }
  }

  return NextResponse.json({ received: true });
}
