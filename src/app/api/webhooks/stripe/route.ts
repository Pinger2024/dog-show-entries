import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getStripe } from '@/server/services/stripe';
import { db } from '@/server/db';
import { entries, orders, payments, organisations, plans } from '@/server/db/schema';
import { sendEntryConfirmationEmail, sendSecretaryNotificationEmail } from '@/server/services/email';
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
      const { entryId, orderId } = paymentIntent.metadata;

      // Order-level payment: confirm all entries in the order
      if (orderId) {
        const orderEntries = await db.query.entries.findMany({
          where: and(
            eq(entries.orderId, orderId),
            isNull(entries.deletedAt)
          ),
        });

        for (const entry of orderEntries) {
          if (entry.status !== 'confirmed') {
            await db
              .update(entries)
              .set({ status: 'confirmed' })
              .where(eq(entries.id, entry.id));
          }
        }

        await db
          .update(orders)
          .set({ status: 'paid' })
          .where(eq(orders.id, orderId));
      }

      // Legacy single-entry payment
      if (entryId && !orderId) {
        const entry = await db.query.entries.findFirst({
          where: eq(entries.id, entryId),
        });

        if (entry && entry.status !== 'confirmed') {
          await db
            .update(entries)
            .set({ status: 'confirmed' })
            .where(eq(entries.id, entryId));
        }
      }

      // Update payment record
      await db
        .update(payments)
        .set({ status: 'succeeded' })
        .where(eq(payments.stripePaymentId, paymentIntent.id));

      // Send confirmation email (non-blocking — don't fail the webhook)
      if (orderId) {
        sendEntryConfirmationEmail(orderId).catch((err) =>
          console.error('[webhook] Email send failed:', err)
        );
        sendSecretaryNotificationEmail(orderId).catch((err) =>
          console.error('[webhook] Secretary notification failed:', err)
        );
      }

      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { orderId } = paymentIntent.metadata;

      if (orderId) {
        await db
          .update(orders)
          .set({ status: 'failed' })
          .where(eq(orders.id, orderId));
      }

      await db
        .update(payments)
        .set({ status: 'failed' })
        .where(eq(payments.stripePaymentId, paymentIntent.id));

      break;
    }

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      // Only handle subscription checkouts
      if (session.mode !== 'subscription') break;

      const organisationId = session.metadata?.organisationId;
      if (!organisationId) {
        console.error('[webhook] checkout.session.completed missing organisationId in metadata');
        break;
      }

      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;

      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;

      if (!subscriptionId || !customerId) {
        console.error('[webhook] checkout.session.completed missing subscription or customer ID');
        break;
      }

      // Retrieve the full subscription to get the price ID and period end
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionItem = subscription.items.data[0];
      const priceId = subscriptionItem?.price.id;

      // Look up the plan by Stripe price ID
      let planId: string | null = null;
      if (priceId) {
        const plan = await db.query.plans.findFirst({
          where: eq(plans.stripePriceId, priceId),
        });
        planId = plan?.id ?? null;
      }

      // Period end is on the subscription item in Stripe v20+
      const periodEnd = subscriptionItem?.current_period_end;

      await db
        .update(organisations)
        .set({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          planId,
          subscriptionStatus: 'active',
          ...(periodEnd
            ? { subscriptionCurrentPeriodEnd: new Date(periodEnd * 1000) }
            : {}),
        })
        .where(eq(organisations.id, organisationId));

      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;

      // Find the organisation by subscription ID
      const org = await db.query.organisations.findFirst({
        where: eq(organisations.stripeSubscriptionId, subscription.id),
      });

      if (!org) {
        console.error(
          `[webhook] customer.subscription.updated: no org found for subscription ${subscription.id}`
        );
        break;
      }

      // Map Stripe subscription status to our enum
      let subscriptionStatus: 'active' | 'trial' | 'past_due' | 'cancelled' | 'none';
      switch (subscription.status) {
        case 'active':
          subscriptionStatus = 'active';
          break;
        case 'trialing':
          subscriptionStatus = 'trial';
          break;
        case 'past_due':
          subscriptionStatus = 'past_due';
          break;
        case 'canceled':
        case 'unpaid':
          subscriptionStatus = 'cancelled';
          break;
        default:
          subscriptionStatus = 'none';
      }

      // Check if the plan has changed by looking at the price ID
      const subscriptionItem = subscription.items.data[0];
      const priceId = subscriptionItem?.price.id;
      let planId: string | null = org.planId;
      if (priceId) {
        const plan = await db.query.plans.findFirst({
          where: eq(plans.stripePriceId, priceId),
        });
        planId = plan?.id ?? org.planId;
      }

      // Period end is on the subscription item in Stripe v20+
      const periodEnd = subscriptionItem?.current_period_end;

      await db
        .update(organisations)
        .set({
          subscriptionStatus,
          planId,
          ...(periodEnd
            ? { subscriptionCurrentPeriodEnd: new Date(periodEnd * 1000) }
            : {}),
        })
        .where(eq(organisations.id, org.id));

      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;

      // Find the organisation by subscription ID
      const org = await db.query.organisations.findFirst({
        where: eq(organisations.stripeSubscriptionId, subscription.id),
      });

      if (!org) {
        console.error(
          `[webhook] customer.subscription.deleted: no org found for subscription ${subscription.id}`
        );
        break;
      }

      await db
        .update(organisations)
        .set({
          subscriptionStatus: 'cancelled',
          planId: null,
        })
        .where(eq(organisations.id, org.id));

      break;
    }
  }

  return NextResponse.json({ received: true });
}
