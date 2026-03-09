import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, isNull } from 'drizzle-orm';
import { protectedProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import {
  users,
  entries,
  achievements,
} from '@/server/db/schema';
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

  /**
   * Championship progress for a dog — computes CC/RCC counts, unique judges,
   * and progress toward Classic and Alternative championship routes.
   *
   * UK KC Championship Routes:
   * - Classic: 3 CCs under 3 different judges
   * - Alternative: 1 CC + 7 RCCs under 7 different judges
   *
   * This combines data from both the `results` table (show judging) and
   * the `achievements` table (manually recorded awards).
   */
  getChampionshipProgress: publicProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Fetch all confirmed entries with results for this dog
      const dogEntries = await ctx.db.query.entries.findMany({
        where: and(
          eq(entries.dogId, input.dogId),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        ),
        with: {
          show: { columns: { id: true, name: true, startDate: true, showType: true } },
          entryClasses: {
            with: {
              result: true,
              showClass: { with: { classDefinition: true } },
            },
          },
        },
      });

      // Also fetch manual achievements
      const dogAchievements = await ctx.db.query.achievements.findMany({
        where: eq(achievements.dogId, input.dogId),
      });

      // CC types: 'cc', 'dog_cc', 'bitch_cc'
      const CC_TYPES = ['cc', 'dog_cc', 'bitch_cc'];
      const RCC_TYPES = ['reserve_cc', 'reserve_dog_cc', 'reserve_bitch_cc'];
      const BOB_TYPE = 'best_of_breed';

      // Collect CCs from results
      const ccAwards: { showId: string; showName: string; date: string; judgeId: string | null; className: string }[] = [];
      const rccAwards: { showId: string; showName: string; date: string; judgeId: string | null; className: string }[] = [];
      const bobAwards: { showId: string; showName: string; date: string }[] = [];

      for (const entry of dogEntries) {
        for (const ec of entry.entryClasses) {
          if (!ec.result?.specialAward) continue;
          const award = ec.result.specialAward.toLowerCase().replace(/\s+/g, '_');
          const className = ec.showClass?.classDefinition?.name ?? '';

          if (CC_TYPES.includes(award)) {
            ccAwards.push({
              showId: entry.show.id,
              showName: entry.show.name,
              date: entry.show.startDate,
              judgeId: ec.result.judgeId,
              className,
            });
          } else if (RCC_TYPES.includes(award)) {
            rccAwards.push({
              showId: entry.show.id,
              showName: entry.show.name,
              date: entry.show.startDate,
              judgeId: ec.result.judgeId,
              className,
            });
          }

          if (award === BOB_TYPE) {
            bobAwards.push({
              showId: entry.show.id,
              showName: entry.show.name,
              date: entry.show.startDate,
            });
          }
        }
      }

      // Also collect from achievements table (may have pre-Remi data)
      for (const ach of dogAchievements) {
        const achShowId = ach.showId ?? '';
        if (CC_TYPES.includes(ach.type)) {
          // Avoid duplicates — normalize null showIds to empty string for comparison
          if (!ccAwards.some((a) => a.showId === achShowId && a.date === ach.date)) {
            ccAwards.push({
              showId: achShowId,
              showName: '',
              date: ach.date,
              judgeId: ach.judgeId,
              className: '',
            });
          }
        } else if (RCC_TYPES.includes(ach.type)) {
          if (!rccAwards.some((a) => a.showId === achShowId && a.date === ach.date)) {
            rccAwards.push({
              showId: achShowId,
              showName: '',
              date: ach.date,
              judgeId: ach.judgeId,
              className: '',
            });
          }
        }
      }

      // Count unique judges
      const ccJudgeIds = new Set(ccAwards.map((a) => a.judgeId).filter(Boolean));
      const rccJudgeIds = new Set(rccAwards.map((a) => a.judgeId).filter(Boolean));

      // Classic route: 3 CCs under 3 different judges
      const classicCCs = ccAwards.length;
      const classicUniqueJudges = ccJudgeIds.size;
      const classicProgress = Math.min(classicCCs, classicUniqueJudges);

      // Alternative route: 1 CC + 7 RCCs under 7 different judges
      const altHasCC = ccAwards.length >= 1;
      const altRCCs = rccAwards.length;
      const altUniqueJudges = rccJudgeIds.size;
      const altRCCProgress = Math.min(altRCCs, altUniqueJudges);

      // Sort awards by date descending for display
      const sortByDate = (a: { date: string }, b: { date: string }) =>
        b.date.localeCompare(a.date);

      // Compute year-by-year stats
      const yearStats = new Map<number, { shows: number; firsts: number; placements: number; awards: number }>();
      for (const entry of dogEntries) {
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
      for (const entry of dogEntries) {
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
            ccs: classicCCs,
            uniqueJudges: classicUniqueJudges,
            progress: classicProgress,
            complete: classicProgress >= 3,
          },
          alternative: {
            requiredCCs: 1,
            requiredRCCs: 7,
            hasCC: altHasCC,
            rccs: altRCCs,
            uniqueRCCJudges: altUniqueJudges,
            rccProgress: altRCCProgress,
            complete: altHasCC && altRCCProgress >= 7,
          },
          bestRoute:
            classicProgress >= 3 || classicProgress / 3 >= (altRCCProgress + (altHasCC ? 1 : 0)) / 8
              ? 'classic'
              : 'alternative',
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
