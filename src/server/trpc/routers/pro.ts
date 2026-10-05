import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, isNull } from 'drizzle-orm';
import { protectedProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import {
  users,
  entries,
  dogs,
} from '@/server/db/schema';
import { getStripe } from '@/server/services/stripe';
import { publicDogHistory, wasShownAt } from '@/lib/public-dog-history';
import { todayInLondon } from '@/lib/date-utils';
import { userMayActOnDog } from '@/server/dog-access';
import { loadTitleAwards } from '@/server/services/title-awards';
import { championProgress } from '@/lib/rkc-titles';

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

  /**
   * Championship progress for a dog — computes CC/RCC counts, unique judges,
   * and progress toward Classic and Alternative championship routes.
   *
   * The RKC Champion rule and the awards it counts each have one owner —
   * lib/rkc-titles.ts and services/title-awards.ts — shared with the
   * dashboard's title progress. (Until 5 Oct 2026 this box had its own
   * one-CC-plus-seven-reserves route, which is not the RKC's.)
   */
  getChampionshipProgress: publicProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Fetch all confirmed entries with results for this dog
      const allDogEntries = await ctx.db.query.entries.findMany({
        where: and(
          eq(entries.dogId, input.dogId),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        ),
        with: {
          show: { columns: { id: true, name: true, startDate: true, endDate: true, showType: true } },
          entryClasses: {
            with: {
              result: true,
              showClass: { with: { classDefinition: true } },
            },
          },
        },
      });

      // A public widget on the dog's page: anyone but the dog's owners sees
      // only shows it has been judged at and published awards — never an
      // upcoming entry in the yearly counts, never a CC before publication
      // (lib/public-dog-history.ts).
      const viewerId = ctx.session?.user?.id;
      const viewerIsOwner = !!viewerId && (await userMayActOnDog(ctx.db, viewerId, input.dogId));
      const dogEntries = publicDogHistory(allDogEntries, { viewerIsOwner });

      const [dog, { awards: titleAwards, bobs }] = await Promise.all([
        ctx.db.query.dogs.findFirst({ where: eq(dogs.id, input.dogId), columns: { dateOfBirth: true } }),
        loadTitleAwards(ctx.db, input.dogId, viewerIsOwner),
      ]);
      const champion = championProgress(titleAwards, dog?.dateOfBirth ?? '1900-01-01');
      const toListItem = (a: { showName: string; date: string }) => ({ showName: a.showName, date: a.date });
      const ccAwards = titleAwards.filter((a) => a.kind === 'cc').map(toListItem);
      const rccAwards = titleAwards.filter((a) => a.kind === 'rcc').map(toListItem);
      const bobAwards = bobs.map(toListItem);

      // Sort awards by date descending for display
      const sortByDate = (a: { date: string }, b: { date: string }) =>
        b.date.localeCompare(a.date);

      // Year-by-year and show-type figures count only shows the dog was
      // actually shown at — the same count as the Career box on its page
      // (historyCounts / wasShownAt, Mandy 2 Oct 2026).
      const today = todayInLondon();
      const shownEntries = dogEntries.filter((entry) => wasShownAt(entry, today));

      // Compute year-by-year stats
      const yearStats = new Map<number, { shows: number; firsts: number; placements: number; awards: number }>();
      for (const entry of shownEntries) {
        const year = new Date(entry.show.startDate).getFullYear();
        const stats = yearStats.get(year) ?? { shows: 0, firsts: 0, placements: 0, awards: 0 };
        stats.shows++;
        for (const ec of entry.entryClasses) {
          if (ec.result?.placement === 1) stats.firsts++;
          if (ec.result?.placement && ec.result.placement <= 3) stats.placements++;
          if (ec.result?.specialAward) stats.awards++;
        }
        yearStats.set(year, stats);
      }

      // Convert to sorted array
      const yearlyBreakdown = Array.from(yearStats.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([year, stats]) => ({ year, ...stats }));

      // Show type breakdown
      const showTypeBreakdown = new Map<string, { count: number; firsts: number }>();
      for (const entry of shownEntries) {
        const showType = entry.show.showType;
        const stats = showTypeBreakdown.get(showType) ?? { count: 0, firsts: 0 };
        stats.count++;
        for (const ec of entry.entryClasses) {
          if (ec.result?.placement === 1) stats.firsts++;
        }
        showTypeBreakdown.set(showType, stats);
      }

      return {
        championship: {
          classic: {
            required: 3,
            ccs: champion.classic.ccs,
            uniqueJudges: champion.classic.judges,
            hasCcOver12Months: champion.classic.hasCcOver12Months,
            complete: champion.classic.met,
          },
          alternative: {
            requiredCCs: 2,
            requiredRCCs: 5,
            requiredJudges: 7,
            ccs: champion.alternative.ccs,
            rccs: champion.alternative.rccs,
            uniqueJudges: champion.alternative.judges,
            complete: champion.alternative.met,
          },
          bestRoute: champion.bestRoute,
        },
        awards: {
          ccs: ccAwards.sort(sortByDate),
          rccs: rccAwards.sort(sortByDate),
          bobs: bobAwards.sort(sortByDate),
        },
        analytics: {
          yearlyBreakdown,
          showTypeBreakdown: Array.from(showTypeBreakdown.entries()).map(
            ([type, stats]) => ({ showType: type, ...stats })
          ),
        },
      };
    }),
});
