/**
 * Landing page Stripe redirects to after the club finishes hosted onboarding.
 *
 * We do NOT treat "landed here" as "onboarding complete" — the user may have
 * bailed mid-flow. Instead we re-fetch the Account from Stripe and mirror the
 * flags; the account.updated webhook will also fire and do the same update,
 * this is belt-and-braces for cases where the user gets back to us before
 * the webhook lands.
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { organisations } from '@/server/db/schema';
import { retrieveConnectAccount, deriveAccountStatus } from '@/server/services/stripe';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('org');
  if (!orgId) {
    return NextResponse.redirect(`${APP_URL}/secretary/payments?connect=missing-org`);
  }

  const org = await db.query.organisations.findFirst({
    where: eq(organisations.id, orgId),
    columns: {
      id: true,
      stripeAccountId: true,
      stripeOnboardingCompletedAt: true,
    },
  });

  if (!org?.stripeAccountId) {
    return NextResponse.redirect(`${APP_URL}/secretary/payments?connect=no-account`);
  }

  try {
    const account = await retrieveConnectAccount(org.stripeAccountId);
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

    return NextResponse.redirect(
      `${APP_URL}/secretary/payments?connect=${status}`
    );
  } catch (error) {
    console.error('[stripe/connect/return] failed to refresh account', error);
    return NextResponse.redirect(`${APP_URL}/secretary/payments?connect=error`);
  }
}
