import { z } from 'zod';
import { eq, count } from 'drizzle-orm';
import { createTRPCRouter } from '../init';
import { protectedProcedure } from '../procedures';
import { users, dogs, entries } from '@/server/db/schema';

export const onboardingRouter = createTRPCRouter({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    const [dogCount] = await ctx.db
      .select({ count: count() })
      .from(dogs)
      .where(eq(dogs.ownerId, userId));

    const [entryCount] = await ctx.db
      .select({ count: count() })
      .from(entries)
      .where(eq(entries.exhibitorId, userId));

    const hasProfile = !!(user?.name && user?.address && user?.postcode);

    return {
      isComplete: !!user?.onboardingCompletedAt,
      hasProfile,
      hasDogs: (dogCount?.count ?? 0) > 0,
      hasEntries: (entryCount?.count ?? 0) > 0,
      dogCount: dogCount?.count ?? 0,
      role: user?.role ?? 'exhibitor',
      profile: user
        ? {
            name: user.name,
            email: user.email,
            address: user.address,
            postcode: user.postcode,
            phone: user.phone,
            kcAccountNo: user.kcAccountNo,
          }
        : null,
    };
  }),

  saveProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Name is required'),
        address: z.string().min(1, 'Address is required'),
        postcode: z.string().min(1, 'Postcode is required'),
        phone: z.string().optional(),
        kcAccountNo: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set({
          name: input.name,
          address: input.address,
          postcode: input.postcode,
          phone: input.phone ?? null,
          kcAccountNo: input.kcAccountNo ?? null,
        })
        .where(eq(users.id, ctx.session.user.id))
        .returning();

      return updated!;
    }),

  complete: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(users)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(users.id, ctx.session.user.id));

    return { success: true };
  }),
});
