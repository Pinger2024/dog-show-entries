import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { getStripe } from '@/server/services/stripe';
import { captureFeeForPaymentIntent } from '@/server/services/stripe-fee-heal';
import { db } from '@/server/db';
import { entries, entryClasses, entryAuditLog, orders, payments, organisations, plans, users, printOrders, printOrderItems } from '@/server/db/schema';
import { sendEntryConfirmationEmail, sendSecretaryNotificationEmail, sendPrintOrderConfirmationEmail, sendPrintOrderAdminNotificationEmail } from '@/server/services/email';
import { syncCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { formatOrderRef } from '@/lib/print-products';
import type Stripe from 'stripe';

/**
 * Best-effort capture of Stripe's ACTUAL fee/net for a succeeded PaymentIntent.
 * The event payload's PaymentIntent never carries balance_transaction — it
 * lives on the Charge, and the Charge may not even exist yet at delivery
 * time — so we make a second API call to retrieve it. Never allowed to throw
 * or block: this must run strictly AFTER the payment-status write, in its own
 * try/catch, so a Stripe hiccup here can never fail the webhook and cause
 * Stripe to retry the whole event (which would re-fire entry confirmation
 * emails). A payment row with null fee/net columns is a finding for the
 * backfill script, not an outage.
 *
 * Refund rows share the SAME stripe_payment_id as the original payment
 * (there's one PaymentIntent per Stripe refund), so the update below MUST
 * exclude type='refund' — otherwise a late/retried succeeded delivery
 * (Stripe redelivers on recovery, sometimes days later) would overwrite a
 * refund row's feePence:0/netPence:-amount with the ORIGINAL charge's
 * positive fee/net, corrupting the reconciliation this feature exists for.
 */
async function captureStripeFeeDetails(paymentIntentId: string) {
  try {
    const outcome = await captureFeeForPaymentIntent(paymentIntentId);
    if (outcome.status === 'missing_charge') {
      console.warn(`[stripe-webhook] no expanded charge for PI ${paymentIntentId}; skipping fee capture`);
    } else if (outcome.status === 'missing_balance_transaction') {
      console.warn(`[stripe-webhook] no balance_transaction for PI ${paymentIntentId} yet; skipping fee capture`);
    }
  } catch (err) {
    console.warn(`[stripe-webhook] fee capture failed for PI ${paymentIntentId}:`, err);
  }
}

/**
 * Give freshly-confirmed entries their catalogue number. Never allowed to throw:
 * an unhandled error here fails the webhook, Stripe retries the whole event and
 * the exhibitor gets a second confirmation email. A number we can re-derive is
 * a far smaller problem than a duplicate email.
 */
async function numberConfirmedEntries(showId: string) {
  try {
    await syncCatalogueNumbers(db, showId);
  } catch (err) {
    console.error(`[stripe-webhook] syncCatalogueNumbers failed for show ${showId}:`, err);
  }
}

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
          if (process.env.PRINT_AUTO_SUBMIT === 'true') {
            submitPrintOrderToMixam(printOrderId).catch((err) =>
              console.error('[webhook] Mixam submission failed:', err)
            );
          } else {
            Promise.all([
              sendPrintOrderAdminNotificationEmail(printOrderId),
              sendPrintOrderConfirmationEmail(printOrderId),
            ]).catch((err) => console.error('[webhook] Print order email failed:', err));
          }
        }
        break;
      }

      // Track whether the order was previously unpaid so we only send the
      // confirmation emails on the first delivery of this event — Stripe
      // retries aggressively and duplicate emails to exhibitors are a bad
      // first impression.
      let orderWasPreviouslyUnpaid = false;

      // Order-level payment: confirm all entries in the order — but ONLY on a
      // genuine transition from an unpaid state. A Stripe replay/redelivery of
      // this event after the order reached a terminal state (paid / refunded /
      // cancelled) must NOT regress it back to 'paid', re-confirm cancelled
      // entries, or re-fire confirmation emails.
      if (orderId) {
        const existingOrder = await db.query.orders.findFirst({
          where: eq(orders.id, orderId),
          columns: { status: true },
        });
        const terminalOrderStatuses = ['paid', 'refunded', 'cancelled'];
        const canTransition = !terminalOrderStatuses.includes(existingOrder?.status ?? '');
        orderWasPreviouslyUnpaid = canTransition;

        if (canTransition) {
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

            // A confirmed entry with no catalogue number is invisible to the
            // catalogue. Number it now — this is the only moment an online
            // entry becomes catalogue-eligible.
            const showId = orderEntries[0]?.showId;
            if (showId) await numberConfirmedEntries(showId);
          }

          await db
            .update(orders)
            .set({ status: 'paid' })
            .where(eq(orders.id, orderId));
        }
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

          await numberConfirmedEntries(entry.showId);
        }
      }

      // Entry-edit UPGRADE ('adjustment'): the new classes + fee were deferred
      // until payment (so an abandoned top-up couldn't grant a free upgrade).
      // Apply the staged change now — but ONLY while the adjustment payment is
      // still 'pending'. The payment row is flipped to 'succeeded' a few lines
      // down, so a replayed succeeded event (or a replay arriving AFTER the
      // exhibitor has since downgraded) finds it non-pending and skips. Without
      // this guard a replay would resurrect classes the exhibitor has dropped.
      if (
        paymentIntent.metadata.type === 'adjustment' &&
        entryId &&
        paymentIntent.metadata.pendingClassIds
      ) {
        const adjPayment = await db.query.payments.findFirst({
          where: eq(payments.stripePaymentId, paymentIntent.id),
          columns: { status: true },
        });
        // Apply while the adjustment payment is not yet succeeded — i.e.
        // 'pending', or 'failed' from an earlier card decline that the customer
        // then retried on the SAME PaymentIntent (bug hunt #9). Once 'succeeded'
        // the change has already landed, so a replay correctly skips (and won't
        // resurrect classes the exhibitor has since dropped).
        if (adjPayment != null && adjPayment.status !== 'succeeded') {
          const pendingClassIds = paymentIntent.metadata.pendingClassIds.split(',').filter(Boolean);
          const pendingPerClassFees = (paymentIntent.metadata.pendingPerClassFees ?? '')
            .split(',')
            .map((n) => Number(n) || 0);
          const pendingFee = Number(paymentIntent.metadata.pendingFee ?? '0');
          if (pendingClassIds.length > 0) {
            const previousClasses = await db.query.entryClasses.findMany({
              where: eq(entryClasses.entryId, entryId),
              columns: { showClassId: true },
            });
            await db.delete(entryClasses).where(eq(entryClasses.entryId, entryId));
            await db.insert(entryClasses).values(
              pendingClassIds.map((scId, i) => ({
                entryId,
                showClassId: scId,
                fee: pendingPerClassFees[i] ?? 0,
              }))
            );
            await db
              .update(entries)
              .set({ totalFee: pendingFee })
              .where(eq(entries.id, entryId));

            // Keep the order total in step with the upgraded entry fee. The
            // payout ledger (listPayouts) and show-metrics compute the club's
            // payable from SUM(orders.totalAmount) on paid orders, so without
            // this the top-up the exhibitor just paid would never reach the
            // club (bug hunt #4). Inside the pending-guard, so a replayed
            // succeeded event can't double-bump the order.
            const adjFeeDiff = Number(paymentIntent.metadata.subtotalPence ?? '0');
            if (adjFeeDiff > 0) {
              const adjEntry = await db.query.entries.findFirst({
                where: eq(entries.id, entryId),
                columns: { orderId: true },
              });
              if (adjEntry?.orderId) {
                await db
                  .update(orders)
                  .set({ totalAmount: sql`${orders.totalAmount} + ${adjFeeDiff}` })
                  .where(eq(orders.id, adjEntry.orderId));
              }
            }

            // Audit the change at the moment it actually lands. The router
            // defers the upgrade, so this is the only audit entry for it —
            // attributed to the exhibitor who initiated the top-up.
            const exhibitorId = paymentIntent.metadata.exhibitorId;
            if (exhibitorId) {
              await db.insert(entryAuditLog).values({
                entryId,
                action: 'classes_changed',
                userId: exhibitorId,
                changes: {
                  oldClassIds: previousClasses.map((c) => c.showClassId),
                  newClassIds: pendingClassIds,
                  newFee: pendingFee,
                  via: 'adjustment_payment',
                },
              });
            }
          }
        }
      }

      // Update payment record — but never un-refund a payment on a replayed
      // succeeded event (a refunded/partially_refunded row must stay so).
      await db
        .update(payments)
        .set({ status: 'succeeded' })
        .where(
          and(
            eq(payments.stripePaymentId, paymentIntent.id),
            notInArray(payments.status, ['refunded', 'partially_refunded'])
          )
        );

      // Fee/net capture — strictly best-effort, strictly AFTER the status
      // write above. Never awaited into the request's error path: failure
      // here must never block the payment-status update or entry/order
      // confirmation that already happened.
      await captureStripeFeeDetails(paymentIntent.id);

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

      // Print order payment failed — don't regress an order that already
      // advanced past payment (a declined-then-retried payment reuses the same
      // PI, so a late 'failed' delivery can arrive after success). Mirror the
      // succeeded branch's guard.
      if (paymentIntent.metadata.type === 'print_order' && printOrderId) {
        const existingPrint = await db.query.printOrders.findFirst({
          where: eq(printOrders.id, printOrderId),
          columns: { status: true },
        });
        const advanced = ['paid', 'submitted', 'in_production', 'dispatched', 'delivered'].includes(existingPrint?.status ?? '');
        await db
          .update(printOrders)
          .set(
            advanced
              ? { stripePaymentStatus: 'failed' }
              : { status: 'failed', stripePaymentStatus: 'failed' }
          )
          .where(eq(printOrders.id, printOrderId));
        break;
      }

      // A declined-then-retried PaymentIntent fires payment_failed THEN
      // succeeded; a late/retried delivery of the failed event must not
      // regress an order that already succeeded (or was refunded/cancelled).
      if (orderId) {
        const existingOrder = await db.query.orders.findFirst({
          where: eq(orders.id, orderId),
          columns: { status: true },
        });
        if (!['paid', 'refunded', 'cancelled'].includes(existingOrder?.status ?? '')) {
          await db
            .update(orders)
            .set({ status: 'failed' })
            .where(eq(orders.id, orderId));
        }
      }

      // Same guard on the payment row — never flip a succeeded/refunded payment
      // back to 'failed'.
      await db
        .update(payments)
        .set({ status: 'failed' })
        .where(
          and(
            eq(payments.stripePaymentId, paymentIntent.id),
            notInArray(payments.status, ['succeeded', 'partially_refunded', 'refunded'])
          )
        );

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
