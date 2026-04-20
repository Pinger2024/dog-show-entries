import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { secretaryProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { organisations, memberships } from '@/server/db/schema';
import {
  createConnectAccount,
  createConnectOnboardingLink,
  retrieveConnectAccount,
  deriveAccountStatus,
} from '@/server/services/stripe';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function verifyMembership(
  db: typeof import('@/server/db').db,
  userId: string,
  organisationId: string
) {
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.organisationId, organisationId),
      eq(memberships.status, 'active')
    ),
    columns: { id: true },
  });
  if (!membership) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You are not an active member of this organisation',
    });
  }
}

/**
 * Look up the org and verify the caller belongs to it. Returns the full org
 * row for convenience — all three mutations here need it.
 */
async function getMyOrg(
  ctx: { db: typeof import('@/server/db').db; session: { user: { id: string; email?: string | null } } },
  organisationId: string
) {
  await verifyMembership(ctx.db, ctx.session.user.id, organisationId);
  const org = await ctx.db.query.organisations.findFirst({
    where: eq(organisations.id, organisationId),
  });
  if (!org) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Organisation not found' });
  }
  return org;
}

export const stripeConnectRouter = createTRPCRouter({
  /**
   * Current Connect state for the club. Drives the payments settings page —
   * not_started shows the intro + "Connect" button, pending shows "finish
   * onboarding", restricted shows what Stripe still needs, active shows the
   * manage link.
   */
  getStatus: secretaryProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const org = await getMyOrg(ctx, input.organisationId);
      return {
        organisationId: org.id,
        accountId: org.stripeAccountId,
        status: org.stripeAccountStatus,
        detailsSubmitted: org.stripeDetailsSubmitted,
        chargesEnabled: org.stripeChargesEnabled,
        payoutsEnabled: org.stripePayoutsEnabled,
        onboardingCompletedAt: org.stripeOnboardingCompletedAt,
      };
    }),

  /**
   * Kick off onboarding. Creates the Stripe account if it doesn't already
   * exist (idempotent — if we already have an account id we reuse it), then
   * generates a fresh one-time hosted-onboarding URL. The URL expires quickly
   * so we never cache it; each call produces a new one.
   *
   * The caller is expected to redirect `window.location.href` to the returned
   * URL. Stripe will send the user back to `/api/stripe/connect/return` when
   * they finish (or to `/refresh` if the link expired mid-flow).
   */
  startOnboarding: secretaryProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const org = await getMyOrg(ctx, input.organisationId);

      let accountId = org.stripeAccountId;

      if (!accountId) {
        const email = org.contactEmail ?? ctx.session.user.email;
        if (!email) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'We need a contact email for your club before we can connect Stripe. Add one on the club page and try again.',
          });
        }

        const account = await createConnectAccount({
          email,
          organisationId: org.id,
          organisationName: org.name,
        });
        accountId = account.id;

        await ctx.db
          .update(organisations)
          .set({
            stripeAccountId: accountId,
            stripeAccountStatus: 'pending',
          })
          .where(eq(organisations.id, org.id));
      }

      const link = await createConnectOnboardingLink({
        accountId,
        refreshUrl: `${APP_URL}/api/stripe/connect/refresh?org=${org.id}`,
        returnUrl: `${APP_URL}/api/stripe/connect/return?org=${org.id}`,
      });

      return { url: link.url };
    }),

  /**
   * Re-sync our cached flags from Stripe. Called from the return-URL redirect
   * handler and exposed as a mutation for the "I finished onboarding, nothing
   * happened" escape hatch on the settings page.
   */
  refreshStatus: secretaryProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const org = await getMyOrg(ctx, input.organisationId);

      if (!org.stripeAccountId) {
        return { status: org.stripeAccountStatus, refreshed: false };
      }

      const account = await retrieveConnectAccount(org.stripeAccountId);
      const status = deriveAccountStatus(account);

      await ctx.db
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

      return { status, refreshed: true };
    }),
});
