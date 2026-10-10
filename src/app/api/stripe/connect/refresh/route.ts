/**
 * Stripe redirects here if its one-time onboarding link expires while the
 * user is still filling the form. We mint a fresh link and send them right
 * back to Stripe so they don't lose their seat.
 *
 * Note: no auth check here beyond "org exists and has an account" — the URL
 * only gets minted for a specific org's onboarding, and revisiting it at
 * worst just sends the user into Stripe's own hosted flow where Stripe's
 * auth takes over. We're deliberately permissive to avoid a failed redirect
 * stranding a mid-flow club.
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { organisations } from '@/server/db/schema';
import { createConnectOnboardingLink } from '@/server/services/stripe';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('org');
  if (!orgId) {
    return NextResponse.redirect(`${APP_URL}/secretary/payments?connect=missing-org`);
  }

  const org = await db.query.organisations.findFirst({
    where: eq(organisations.id, orgId),
    columns: { id: true, stripeAccountId: true },
  });

  if (!org?.stripeAccountId) {
    return NextResponse.redirect(`${APP_URL}/secretary/payments?connect=no-account`);
  }

  try {
    const link = await createConnectOnboardingLink({
      accountId: org.stripeAccountId,
      refreshUrl: `${APP_URL}/api/stripe/connect/refresh?org=${org.id}`,
      returnUrl: `${APP_URL}/api/stripe/connect/return?org=${org.id}`,
    });
    return NextResponse.redirect(link.url);
  } catch (error) {
    console.error('[stripe/connect/refresh] failed to mint new link', error);
    return NextResponse.redirect(`${APP_URL}/secretary/payments?connect=error`);
  }
}
