/**
 * Stripe webhook for Connect (connected-account) events.
 *
 * Kept separate from the platform webhook (/api/webhooks/stripe) because
 * Stripe assigns a distinct signing secret to each endpoint configured in
 * the dashboard — mixing them on one URL means signature verification will
 * fail for at least one of the two feeds.
 *
 * The only event we care about today is `account.updated` — fires whenever
 * a club's KYC status changes. We mirror the Account flags into our
 * organisations row so the publish gate and the Payments settings page
 * have fresh data without calling Stripe on render.
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getStripe, deriveAccountStatus } from '@/server/services/stripe';
import { db } from '@/server/db';
import { organisations } from '@/server/db/schema';
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

  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook/connect] STRIPE_CONNECT_WEBHOOK_SECRET not set');
    return NextResponse.json(
      { error: 'Connect webhook secret not configured' },
      { status: 500 }
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;

      const org = await db.query.organisations.findFirst({
        where: eq(organisations.stripeAccountId, account.id),
        columns: { id: true, stripeOnboardingCompletedAt: true },
      });

      // No org for this account id — either Stripe is reusing an old test
      // account that we don't know about, or something's drifted. Ignore
      // rather than error so retries don't pile up.
      if (!org) {
        console.warn(`[webhook/connect] account.updated: no org for ${account.id}`);
        break;
      }

      const status = deriveAccountStatus(account);
      await db
        .update(organisations)
        .set({
          stripeAccountStatus: status,
          stripeDetailsSubmitted: account.details_submitted ?? false,
          stripeChargesEnabled: account.charges_enabled ?? false,
          stripePayoutsEnabled: account.payouts_enabled ?? false,
          stripeOnboardingCompletedAt:
            status === 'active' && !org.stripeOnboardingCompletedAt
              ? new Date()
              : org.stripeOnboardingCompletedAt,
        })
        .where(eq(organisations.id, org.id));

      break;
    }

    // Other connect events we might care about later:
    // - account.application.deauthorized — club disconnected their account
    // - payout.* — could power an admin "payouts" view
    // Ignore for now.
  }

  return NextResponse.json({ received: true });
}
