import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getStripe } from '@/server/services/stripe';
import { db } from '@/server/db';
import { entries, orders, payments, organisations, plans, users, printOrders, printOrderItems } from '@/server/db/schema';
import { sendEntryConfirmationEmail, sendSecretaryNotificationEmail, sendPrintOrderConfirmationEmail } from '@/server/services/email';
import { formatOrderRef } from '@/lib/print-products';
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
      const { entryId, orderId, printOrderId } = paymentIntent.metadata;

      // Print order payment. Stripe retries on any 5xx or timeout, so we
      // must gate both the Mixam submission AND the status write on a
      // state transition — otherwise a retry/replay for an order that
      // has already moved on to `submitted` / `in_production` /
      // `dispatched` / `delivered` would regress it back to `paid`.
      if (paymentIntent.metadata.type === 'print_order' && printOrderId) {
        const existing = await db.query.printOrders.findFirst({
          where: eq(printOrders.id, printOrderId),
          columns: { status: true },
        });
        const wasAlreadyPaid = existing?.status === 'paid' || existing?.status === 'submitted' || existing?.status === 'in_production' || existing?.status === 'dispatched' || existing?.status === 'delivered';

        // stripePaymentStatus is idempotent: the second succeeded event
        // sets the same value. Write it unconditionally so any future
        // status-tracking bug surfaces on the first webhook delivery
        // rather than hiding behind a stale column.
        await db
          .update(printOrders)
          .set(
            wasAlreadyPaid
              ? { stripePaymentStatus: 'succeeded' }
              : { status: 'paid', stripePaymentStatus: 'succeeded' }
          )
          .where(eq(printOrders.id, printOrderId));

        if (!wasAlreadyPaid) {
          // Submit to Mixam (non-blocking). On retries this branch is skipped.
          submitPrintOrderToMixam(printOrderId).catch((err) =>
            console.error('[webhook] Mixam submission failed:', err)
          );
        }
        break;
      }

      // Track whether the order was previously unpaid so we only send the
      // confirmation emails on the first delivery of this event — Stripe
      // retries aggressively and duplicate emails to exhibitors are a bad
      // first impression.
      let orderWasPreviouslyUnpaid = false;

      // Order-level payment: confirm all entries in the order
      if (orderId) {
        const existingOrder = await db.query.orders.findFirst({
          where: eq(orders.id, orderId),
          columns: { status: true },
        });
        orderWasPreviouslyUnpaid = existingOrder?.status !== 'paid';

        const orderEntries = await db.query.entries.findMany({
          where: and(
            eq(entries.orderId, orderId),
            isNull(entries.deletedAt)
          ),
        });

        const toConfirm = orderEntries.filter(e => e.status !== 'confirmed').map(e => e.id);
        if (toConfirm.length > 0) {
          await db
            .update(entries)
            .set({ status: 'confirmed' })
            .where(inArray(entries.id, toConfirm));
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

      // Send confirmation email (non-blocking — don't fail the webhook).
      // Gated on first-time transition so Stripe retries don't duplicate.
      if (orderId && orderWasPreviouslyUnpaid) {
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
      const { orderId, printOrderId } = paymentIntent.metadata;

      // Print order payment failed
      if (paymentIntent.metadata.type === 'print_order' && printOrderId) {
        await db
          .update(printOrders)
          .set({
            status: 'failed',
            stripePaymentStatus: 'failed',
          })
          .where(eq(printOrders.id, printOrderId));
        break;
      }

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
      const periodEnd = subscriptionItem?.current_period_end;

      // Check if this is a Pro user subscription
      const isPro = session.metadata?.type === 'pro';
      const userId = session.metadata?.userId;

      if (isPro && userId) {
        // Handle Remi Pro subscription
        await db
          .update(users)
          .set({
            stripeCustomerId: customerId,
            proStripeSubscriptionId: subscriptionId,
            proSubscriptionStatus: 'active',
            ...(periodEnd
              ? { proCurrentPeriodEnd: new Date(periodEnd * 1000) }
              : {}),
          })
          .where(eq(users.id, userId));
        break;
      }

      // Handle organisation subscription
      const organisationId = session.metadata?.organisationId;
      if (!organisationId) {
        console.error('[webhook] checkout.session.completed missing organisationId in metadata');
        break;
      }

      // Look up the plan by Stripe price ID
      let planId: string | null = null;
      if (priceId) {
        const plan = await db.query.plans.findFirst({
          where: eq(plans.stripePriceId, priceId),
        });
        planId = plan?.id ?? null;
      }

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

      const subscriptionItem = subscription.items.data[0];
      const periodEnd = subscriptionItem?.current_period_end;

      // Check if this is a Pro user subscription
      const isPro = subscription.metadata?.type === 'pro';
      const userId = subscription.metadata?.userId;

      if (isPro && userId) {
        await db
          .update(users)
          .set({
            proSubscriptionStatus: subscriptionStatus,
            ...(periodEnd
              ? { proCurrentPeriodEnd: new Date(periodEnd * 1000) }
              : {}),
          })
          .where(eq(users.id, userId));
        break;
      }

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

      // Check if the plan has changed by looking at the price ID
      const priceId = subscriptionItem?.price.id;
      let planId: string | null = org.planId;
      if (priceId) {
        const plan = await db.query.plans.findFirst({
          where: eq(plans.stripePriceId, priceId),
        });
        planId = plan?.id ?? org.planId;
      }

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

      // Check if this is a Pro user subscription
      if (subscription.metadata?.type === 'pro' && subscription.metadata?.userId) {
        await db
          .update(users)
          .set({
            proSubscriptionStatus: 'cancelled',
          })
          .where(eq(users.id, subscription.metadata.userId));
        break;
      }

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

/**
 * Submit a print order to Mixam after successful payment.
 * Runs asynchronously so the webhook returns quickly.
 */
async function submitPrintOrderToMixam(printOrderId: string) {
  const order = await db.query.printOrders.findFirst({
    where: eq(printOrders.id, printOrderId),
    with: { items: true, orderedBy: true, show: true },
  });

  if (!order || !order.items.length) {
    console.error(`[mixam] Cannot submit: order ${printOrderId} not found or empty`);
    return;
  }

  const missingPdfs = order.items.filter((i) => !i.pdfPublicUrl);
  if (missingPdfs.length > 0) {
    console.error(`[mixam] Missing PDFs for items: ${missingPdfs.map((i) => i.documentType).join(', ')}`);
    return;
  }

  try {
    const { submitOrderLegacy } = await import('@/server/services/mixam');

    const nameParts = (order.deliveryName ?? 'Show Secretary').split(' ');
    const firstName = nameParts[0] ?? 'Show';
    const lastName = nameParts.slice(1).join(' ') || 'Secretary';

    const result = await submitOrderLegacy({
      orderReference: `REMI-${formatOrderRef(order.id)}`,
      billingAddress: {
        firstName,
        lastName,
        streetName: order.deliveryAddress1 ?? '',
        postalCode: order.deliveryPostcode ?? '',
        city: order.deliveryTown ?? '',
        country: 'GB',
        email: order.orderedBy?.email ?? '',
        phone: order.deliveryPhone ?? '',
      },
      items: order.items.map((item) => ({
        fileUrl: item.pdfPublicUrl!,
        productId: item.tradeprintProductId ?? '',
        quantity: item.quantity,
        productionData: (item.printSpecs as Record<string, string>) ?? {},
        deliveryAddress: {
          firstName,
          lastName,
          add1: order.deliveryAddress1 ?? '',
          add2: order.deliveryAddress2 ?? undefined,
          town: order.deliveryTown ?? '',
          postcode: order.deliveryPostcode ?? '',
          country: 'GB',
          contactPhone: order.deliveryPhone ?? '',
        },
        partnerContactDetails: {
          name: `${firstName} ${lastName}`,
          email: order.orderedBy?.email ?? '',
          phone: order.deliveryPhone ?? '',
        },
      })),
    });

    await db
      .update(printOrders)
      .set({
        status: 'submitted',
        // Column name still `tradeprintOrderRef` pending a schema
        // rename; the value is a Mixam order ID.
        tradeprintOrderRef: result.orderRef,
      })
      .where(eq(printOrders.id, printOrderId));

    console.log(`[mixam] Order ${printOrderId} submitted: ${result.orderRef}`);

    sendPrintOrderConfirmationEmail(printOrderId).catch((err) =>
      console.error('[webhook] Print order confirmation email failed:', err)
    );
  } catch (err) {
    console.error(`[mixam] Submission failed for ${printOrderId}:`, err);
    // Order stays as 'paid' — can retry via refreshStatus
  }
}
