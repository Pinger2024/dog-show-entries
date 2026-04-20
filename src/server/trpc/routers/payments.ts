import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import {
  entries,
  entryClasses,
  dogs,
  shows,
  showClasses,
  payments,
} from '@/server/db/schema';
import {
  createPaymentIntent,
  calculatePlatformFee,
} from '@/server/services/stripe';

export const paymentsRouter = createTRPCRouter({
  createIntent: protectedProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        dogId: z.string().uuid(),
        classIds: z.array(z.string().uuid()).min(1),
        isNfc: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate dog belongs to user
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(
          eq(dogs.id, input.dogId),
          eq(dogs.ownerId, ctx.session.user.id),
          isNull(dogs.deletedAt)
        ),
      });

      if (!dog) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Dog not found or you do not own this dog',
        });
      }

      // Validate show is accepting entries.
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
      });

      if (!show) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Show not found',
        });
      }

      if (show.status !== 'entries_open') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Show is not accepting entries',
        });
      }

      // Also reject if entry close date has passed
      if (show.entryCloseDate && new Date(show.entryCloseDate).getTime() < Date.now()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Entry closing date has passed',
        });
      }

      // Validate classes exist and belong to the show
      const selectedClasses = await ctx.db.query.showClasses.findMany({
        where: and(
          inArray(showClasses.id, input.classIds),
          eq(showClasses.showId, input.showId)
        ),
      });

      if (selectedClasses.length !== input.classIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more classes are invalid for this show',
        });
      }

      // Calculate total fee
      const totalFee = selectedClasses.reduce(
        (sum, sc) => sum + sc.entryFee,
        0
      );

      // Create entry in pending state
      const [entry] = await ctx.db
        .insert(entries)
        .values({
          showId: input.showId,
          dogId: input.dogId,
          exhibitorId: ctx.session.user.id,
          isNfc: input.isNfc,
          totalFee,
          status: 'pending',
        })
        .returning();

      // Create entry class records
      await ctx.db.insert(entryClasses).values(
        selectedClasses.map((sc) => ({
          entryId: entry!.id,
          showClassId: sc.id,
          fee: sc.entryFee,
        }))
      );

      const platformFeePence = calculatePlatformFee(totalFee);
      const grossAmount = totalFee + platformFeePence;

      const paymentIntent = await createPaymentIntent(grossAmount, {
        showId: input.showId,
        dogId: input.dogId,
        exhibitorId: ctx.session.user.id,
        classIds: input.classIds.join(','),
        entryId: entry!.id,
        platformFeePence: String(platformFeePence),
        subtotalPence: String(totalFee),
      });

      // Store payment intent ID on entry
      await ctx.db
        .update(entries)
        .set({ paymentIntentId: paymentIntent.id })
        .where(eq(entries.id, entry!.id));

      // Create payment record — gross amount so Stripe reconciliation works.
      await ctx.db.insert(payments).values({
        entryId: entry!.id,
        stripePaymentId: paymentIntent.id,
        amount: grossAmount,
        status: 'pending',
      });

      return {
        clientSecret: paymentIntent.client_secret!,
        entryId: entry!.id,
        amount: totalFee,
        platformFeePence,
        grossAmount,
      };
    }),
});
