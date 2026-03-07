import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { users } from '@/server/db/schema';
import { getStripe } from '@/server/services/stripe';

// Remi Pro price — will be created in Stripe Dashboard
// £4.99/month or £39.99/year
const PRO_MONTHLY_PRICE_ID = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
const PRO_ANNUAL_PRICE_ID = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

export const proRouter = createTRPCRouter({
  /**
   * Get the current user's Pro subscription status.
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      columns: {
        proSubscriptionStatus: true,
        proStripeSubscriptionId: true,
        proCurrentPeriodEnd: true,
        stripeCustomerId: true,
      },
    });

    return {
      status: user?.proSubscriptionStatus ?? 'none',
      currentPeriodEnd: user?.proCurrentPeriodEnd ?? null,
      hasSubscription: !!user?.proStripeSubscriptionId,
    };
  }),

  /**
   * Create a Stripe Checkout session for Remi Pro.
   * Returns the checkout URL for redirect.
   */
  createCheckout: protectedProcedure
    .input(
      z.object({
        interval: z.enum(['monthly', 'annual']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const priceId =
        input.interval === 'annual' ? PRO_ANNUAL_PRICE_ID : PRO_MONTHLY_PRICE_ID;

      if (!priceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Stripe price not configured for this interval',
        });
      }

      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
      });

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // Already subscribed?
      if (user.proSubscriptionStatus === 'active') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You already have an active Pro subscription',
        });
      }

      const stripe = getStripe();

      // Get or create Stripe customer for this user
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: user.name ?? undefined,
          email: user.email,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await ctx.db
          .update(users)
          .set({ stripeCustomerId: customerId })
          .where(eq(users.id, user.id));
      }

      const successUrl = `${process.env.NEXTAUTH_URL}/settings?pro=success`;
      const cancelUrl = `${process.env.NEXTAUTH_URL}/settings?pro=cancelled`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { userId: user.id, type: 'pro' },
        subscription_data: {
          metadata: { userId: user.id, type: 'pro' },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      if (!session.url) {
        throw new Error('Stripe checkout session created without a URL');
      }

      return { url: session.url };
    }),

  /**
   * Create a Stripe Customer Portal session for managing Pro billing.
   */
  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      columns: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No billing account found. Please subscribe first.',
      });
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.NEXTAUTH_URL}/settings`,
    });

    return { url: session.url };
  }),
});
