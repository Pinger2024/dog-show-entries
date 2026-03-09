import { z } from 'zod';
import { and, eq, sql, isNull, inArray } from 'drizzle-orm';
import { protectedProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { dogFollows, dogs, dogPhotos } from '@/server/db/schema';

export const followsRouter = createTRPCRouter({
  /** Toggle follow/unfollow a dog */
  toggle: protectedProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.dogFollows.findFirst({
        where: and(
          eq(dogFollows.userId, ctx.session.user.id),
          eq(dogFollows.dogId, input.dogId)
        ),
      });

      if (existing) {
        await ctx.db
          .delete(dogFollows)
          .where(eq(dogFollows.id, existing.id));
        return { following: false };
      }

      await ctx.db.insert(dogFollows).values({
        userId: ctx.session.user.id,
        dogId: input.dogId,
      });
      return { following: true };
    }),

  /** Check if current user follows a dog */
  isFollowing: protectedProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const existing = await ctx.db.query.dogFollows.findFirst({
        where: and(
          eq(dogFollows.userId, ctx.session.user.id),
          eq(dogFollows.dogId, input.dogId)
        ),
      });
      return { following: !!existing };
    }),

  /** Get follower count for a dog */
  count: publicProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(dogFollows)
        .where(eq(dogFollows.dogId, input.dogId));
      return { count: row?.count ?? 0 };
    }),

  /** Get list of dogs the current user follows (with basic info) */
  getFollowedDogs: protectedProcedure.query(async ({ ctx }) => {
    const followed = await ctx.db.query.dogFollows.findMany({
      where: eq(dogFollows.userId, ctx.session.user.id),
      with: {
        dog: {
          columns: { id: true, registeredName: true, sex: true, dateOfBirth: true },
          with: {
            breed: { columns: { name: true } },
          },
        },
      },
      orderBy: (follows, { desc }) => [desc(follows.createdAt)],
    });

    // Fetch primary photos
    const dogIds = followed.map((f) => f.dog.id);
    const photoMap = new Map<string, string>();

    if (dogIds.length > 0) {
      const photos = await ctx.db.query.dogPhotos.findMany({
        where: and(
          inArray(dogPhotos.dogId, dogIds),
          eq(dogPhotos.isPrimary, true)
        ),
      });
      for (const photo of photos) {
        photoMap.set(photo.dogId, photo.url);
      }
    }

    return followed.map((f) => ({
      ...f.dog,
      photoUrl: photoMap.get(f.dog.id) ?? null,
      followedAt: f.createdAt,
    }));
  }),
});
