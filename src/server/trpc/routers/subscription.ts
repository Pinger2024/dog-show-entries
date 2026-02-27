import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, asc } from 'drizzle-orm';
import { publicProcedure, secretaryProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { plans, organisations, memberships } from '@/server/db/schema';
import {
  getOrCreateStripeCustomer,
  createSubscriptionCheckout,
  createBillingPortalSession,
} from '@/server/services/stripe';

export const subscriptionRouter = createTRPCRouter({
  /**
   * Get all active plans, ordered by sortOrder.
   * Public so pricing page can be viewed without auth.
   */
  getPlans: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.plans.findMany({
      where: eq(plans.isActive, true),
      orderBy: [asc(plans.sortOrder)],
    });
  }),

  /**
   * Get the current user's organisation subscription info.
   * Returns the org with its plan details.
   */
  getMySubscription: secretaryProcedure
    .input(
      z.object({
        organisationId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify the user is a member of this organisation
      const membership = await ctx.db.query.memberships.findFirst({
        where: and(
          eq(memberships.userId, ctx.session.user.id),
          eq(memberships.organisationId, input.organisationId),
          eq(memberships.status, 'active')
        ),
      });

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not an active member of this organisation',
        });
      }

      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.organisationId),
        with: {
          plan: true,
        },
      });

      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organisation not found',
        });
      }

      return {
        organisationId: org.id,
        organisationName: org.name,
        stripeCustomerId: org.stripeCustomerId,
        stripeSubscriptionId: org.stripeSubscriptionId,
        subscriptionStatus: org.subscriptionStatus,
        subscriptionCurrentPeriodEnd: org.subscriptionCurrentPeriodEnd,
        plan: org.plan,
      };
    }),

  /**
   * Create a Stripe Checkout session for subscribing to a plan.
   * Returns the checkout URL for redirect.
   */
  createCheckout: secretaryProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        organisationId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the user is a member of this organisation
      const membership = await ctx.db.query.memberships.findFirst({
        where: and(
          eq(memberships.userId, ctx.session.user.id),
          eq(memberships.organisationId, input.organisationId),
          eq(memberships.status, 'active')
        ),
      });

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not an active member of this organisation',
        });
      }

      // Get the plan
      const plan = await ctx.db.query.plans.findFirst({
        where: and(eq(plans.id, input.planId), eq(plans.isActive, true)),
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Plan not found or no longer active',
        });
      }

      if (!plan.stripePriceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Plan does not have a Stripe price configured',
        });
      }

      // Get the organisation
      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.organisationId),
      });

      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organisation not found',
        });
      }

      // Create or retrieve Stripe customer
      const customerId = await getOrCreateStripeCustomer(
        org.id,
        org.name,
        org.contactEmail ?? ctx.session.user.email,
        org.stripeCustomerId
      );

      // Persist the customer ID if it's new
      if (customerId !== org.stripeCustomerId) {
        await ctx.db
          .update(organisations)
          .set({ stripeCustomerId: customerId })
          .where(eq(organisations.id, org.id));
      }

      // Create checkout session
      const successUrl = `${process.env.NEXTAUTH_URL}/secretary/billing?success=true`;
      const cancelUrl = `${process.env.NEXTAUTH_URL}/secretary/billing?cancelled=true`;

      const url = await createSubscriptionCheckout(
        customerId,
        plan.stripePriceId,
        org.id,
        successUrl,
        cancelUrl
      );

      return { url };
    }),

  /**
   * Create a Stripe Customer Portal session for managing billing.
   * Returns the portal URL for redirect.
   */
  createPortalSession: secretaryProcedure
    .input(
      z.object({
        organisationId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the user is a member of this organisation
      const membership = await ctx.db.query.memberships.findFirst({
        where: and(
          eq(memberships.userId, ctx.session.user.id),
          eq(memberships.organisationId, input.organisationId),
          eq(memberships.status, 'active')
        ),
      });

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not an active member of this organisation',
        });
      }

      // Get the organisation
      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.organisationId),
      });

      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organisation not found',
        });
      }

      if (!org.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Organisation does not have a Stripe customer yet. Please subscribe to a plan first.',
        });
      }

      const returnUrl = `${process.env.NEXTAUTH_URL}/secretary/billing`;

      const url = await createBillingPortalSession(
        org.stripeCustomerId,
        returnUrl
      );

      return { url };
    }),
});
