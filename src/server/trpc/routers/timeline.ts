import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, desc, isNull, inArray, lt } from 'drizzle-orm';
import { protectedProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import {
  dogTimelinePosts,
  dogs,
  dogFollows,
  entries,
  entryClasses,
  showClasses,
  classDefinitions,
  shows,
  results,
  dogPhotos,
} from '@/server/db/schema';
import { deleteFromR2 } from '@/server/services/storage';

export const timelineRouter = createTRPCRouter({
  /** Get timeline for a specific dog — user posts + show results merged chronologically */
  getForDog: publicProcedure
    .input(
      z.object({
        dogId: z.string().uuid(),
        cursor: z.string().datetime().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // 1. User-created posts
      const postWhere = input.cursor
        ? and(
            eq(dogTimelinePosts.dogId, input.dogId),
            lt(dogTimelinePosts.createdAt, new Date(input.cursor))
          )
        : eq(dogTimelinePosts.dogId, input.dogId);

      const userPosts = await ctx.db.query.dogTimelinePosts.findMany({
        where: postWhere,
        orderBy: [desc(dogTimelinePosts.createdAt)],
        limit: input.limit + 1,
        with: {
          author: {
            columns: { id: true, name: true },
          },
        },
      });

      // 2. Show results (from entries system)
      const dogEntries = await ctx.db.query.entries.findMany({
        where: and(
          eq(entries.dogId, input.dogId),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        ),
        with: {
          show: true,
          entryClasses: {
            with: {
              showClass: {
                with: { classDefinition: true },
              },
              result: true,
            },
          },
        },
      });

      // Only include entries that have at least one result
      const showResults = dogEntries
        .filter((e) => e.entryClasses.some((ec) => ec.result))
        .map((entry) => ({
          itemType: 'show_result' as const,
          id: `result-${entry.id}`,
          createdAt: new Date(entry.show.startDate),
          show: {
            id: entry.show.id,
            name: entry.show.name,
            date: entry.show.startDate,
            showType: entry.show.showType,
          },
          classes: entry.entryClasses
            .filter((ec) => ec.result)
            .map((ec) => ({
              className: ec.showClass.classDefinition.name,
              classNumber: ec.showClass.classNumber,
              placement: ec.result?.placement ?? null,
              specialAward: ec.result?.specialAward ?? null,
              critiqueText: ec.result?.critiqueText ?? null,
            })),
        }));

      // 3. Merge and sort
      const postItems = userPosts.slice(0, input.limit).map((p) => ({
        itemType: 'post' as const,
        id: p.id,
        createdAt: p.createdAt,
        type: p.type,
        caption: p.caption,
        imageUrl: p.imageUrl,
        videoUrl: p.videoUrl,
        pinned: p.pinned,
        author: p.author,
      }));

      // Filter show results by cursor
      const filteredResults = input.cursor
        ? showResults.filter((r) => r.createdAt < new Date(input.cursor!))
        : showResults;

      const allItems = [...postItems, ...filteredResults]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, input.limit);

      // hasMore if posts had more, or if we had to trim the merged results
      const hasMore =
        userPosts.length > input.limit ||
        postItems.length + filteredResults.length > input.limit;
      const nextCursor = hasMore && allItems.length > 0
        ? allItems[allItems.length - 1].createdAt.toISOString()
        : undefined;

      return { items: allItems, nextCursor };
    }),

  /** Create a timeline post (must be dog owner) */
  createPost: protectedProcedure
    .input(
      z.object({
        dogId: z.string().uuid(),
        caption: z.string().max(2000).optional(),
        imageUrl: z.string().max(2000).optional(),
        imageStorageKey: z.string().max(500).optional(),
        videoUrl: z.string().url().max(2000).optional(),
        type: z.enum(['photo', 'note', 'milestone', 'video']).default('photo'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(
          eq(dogs.id, input.dogId),
          eq(dogs.ownerId, ctx.session.user.id),
          isNull(dogs.deletedAt)
        ),
      });

      if (!dog) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only post to dogs you own',
        });
      }

      if (!input.caption && !input.imageUrl && !input.videoUrl) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Post must have a caption, image, or video',
        });
      }

      const [post] = await ctx.db
        .insert(dogTimelinePosts)
        .values({
          dogId: input.dogId,
          authorId: ctx.session.user.id,
          type: input.type,
          caption: input.caption ?? null,
          imageUrl: input.imageUrl ?? null,
          imageStorageKey: input.imageStorageKey ?? null,
          videoUrl: input.videoUrl ?? null,
        })
        .returning();

      return post;
    }),

  /** Delete a timeline post (must be author or dog owner) */
  deletePost: protectedProcedure
    .input(z.object({ postId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.db.query.dogTimelinePosts.findFirst({
        where: eq(dogTimelinePosts.id, input.postId),
        with: { dog: { columns: { ownerId: true } } },
      });

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      const isAuthor = post.authorId === ctx.session.user.id;
      const isOwner = post.dog.ownerId === ctx.session.user.id;

      if (!isAuthor && !isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the post author or dog owner can delete posts',
        });
      }

      // Delete image from R2 if present
      if (post.imageStorageKey) {
        await deleteFromR2(post.imageStorageKey).catch((err) =>
          console.error('Failed to delete timeline image:', err)
        );
      }

      await ctx.db
        .delete(dogTimelinePosts)
        .where(eq(dogTimelinePosts.id, input.postId));

      return { success: true };
    }),

  /** Get consolidated feed from all followed dogs */
  getFeed: protectedProcedure
    .input(
      z.object({
        cursor: z.string().datetime().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get followed dog IDs and own dogs in parallel
      const [followedDogs, ownDogs] = await Promise.all([
        ctx.db
          .select({ dogId: dogFollows.dogId })
          .from(dogFollows)
          .where(eq(dogFollows.userId, ctx.session.user.id)),
        ctx.db
          .select({ id: dogs.id })
          .from(dogs)
          .where(and(eq(dogs.ownerId, ctx.session.user.id), isNull(dogs.deletedAt))),
      ]);

      const allDogIds = [
        ...new Set([
          ...followedDogs.map((f) => f.dogId),
          ...ownDogs.map((d) => d.id),
        ]),
      ];

      if (allDogIds.length === 0) {
        return { items: [], nextCursor: undefined };
      }

      // Fetch posts, entries, and photos in parallel
      const postWhere = input.cursor
        ? and(
            inArray(dogTimelinePosts.dogId, allDogIds),
            lt(dogTimelinePosts.createdAt, new Date(input.cursor))
          )
        : inArray(dogTimelinePosts.dogId, allDogIds);

      const [userPosts, dogEntries, primaryPhotos] = await Promise.all([
        ctx.db.query.dogTimelinePosts.findMany({
          where: postWhere,
          orderBy: [desc(dogTimelinePosts.createdAt)],
          limit: input.limit + 1,
          with: {
            author: { columns: { id: true, name: true } },
            dog: {
              columns: { id: true, registeredName: true },
              with: {
                breed: { columns: { name: true } },
              },
            },
          },
        }),
        ctx.db.query.entries.findMany({
          where: and(
            inArray(entries.dogId, allDogIds),
            eq(entries.status, 'confirmed'),
            isNull(entries.deletedAt)
          ),
          with: {
            show: true,
            dog: {
              columns: { id: true, registeredName: true },
              with: {
                breed: { columns: { name: true } },
              },
            },
            entryClasses: {
              with: {
                showClass: { with: { classDefinition: true } },
                result: true,
              },
            },
          },
        }),
        ctx.db.query.dogPhotos.findMany({
          where: and(
            inArray(dogPhotos.dogId, allDogIds),
            eq(dogPhotos.isPrimary, true)
          ),
        }),
      ]);

      const dogPhotoMap = new Map<string, string>();
      for (const photo of primaryPhotos) {
        dogPhotoMap.set(photo.dogId, photo.url);
      }

      const showResults = dogEntries
        .filter((e) => e.entryClasses.some((ec) => ec.result))
        .map((entry) => ({
          itemType: 'show_result' as const,
          id: `result-${entry.id}`,
          createdAt: new Date(entry.show.startDate),
          dog: {
            id: entry.dog.id,
            registeredName: entry.dog.registeredName,
            breed: entry.dog.breed?.name ?? null,
            photoUrl: dogPhotoMap.get(entry.dog.id) ?? null,
          },
          show: {
            id: entry.show.id,
            name: entry.show.name,
            date: entry.show.startDate,
            showType: entry.show.showType,
          },
          classes: entry.entryClasses
            .filter((ec) => ec.result)
            .map((ec) => ({
              className: ec.showClass.classDefinition.name,
              classNumber: ec.showClass.classNumber,
              placement: ec.result?.placement ?? null,
              specialAward: ec.result?.specialAward ?? null,
            })),
        }));

      const filteredResults = input.cursor
        ? showResults.filter((r) => r.createdAt < new Date(input.cursor!))
        : showResults;

      const postItems = userPosts.slice(0, input.limit).map((p) => ({
        itemType: 'post' as const,
        id: p.id,
        createdAt: p.createdAt,
        type: p.type,
        caption: p.caption,
        imageUrl: p.imageUrl,
        videoUrl: p.videoUrl,
        pinned: p.pinned,
        author: p.author,
        dog: {
          id: p.dog.id,
          registeredName: p.dog.registeredName,
          breed: p.dog.breed?.name ?? null,
          photoUrl: dogPhotoMap.get(p.dog.id) ?? null,
        },
      }));

      const allItems = [...postItems, ...filteredResults]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, input.limit);

      // hasMore if posts had more, or if we had to trim the merged results
      const hasMore =
        userPosts.length > input.limit ||
        postItems.length + filteredResults.length > input.limit;
      const nextCursor = hasMore && allItems.length > 0
        ? allItems[allItems.length - 1].createdAt.toISOString()
        : undefined;

      return { items: allItems, nextCursor };
    }),
});
