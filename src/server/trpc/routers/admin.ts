import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, asc, desc, sql, ilike, and } from 'drizzle-orm';
import { adminProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { breeds, breedGroups, classDefinitions, showClasses } from '@/server/db/schema';

export const adminRouter = createTRPCRouter({
  // ── Breed Groups ──────────────────────────────────────────

  listBreedGroups: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.query.breedGroups.findMany({
      orderBy: [asc(breedGroups.sortOrder)],
    });
  }),

  createBreedGroup: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      sortOrder: z.number().int().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(breedGroups)
        .values(input)
        .returning();
      return created;
    }),

  updateBreedGroup: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      sortOrder: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(breedGroups)
        .set(data)
        .where(eq(breedGroups.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
      return updated;
    }),

  deleteBreedGroup: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check for breeds in this group
      const breedsInGroup = await ctx.db.query.breeds.findMany({
        where: eq(breeds.groupId, input.id),
        columns: { id: true },
      });
      if (breedsInGroup.length > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete: ${breedsInGroup.length} breeds still belong to this group. Move or delete them first.`,
        });
      }
      await ctx.db.delete(breedGroups).where(eq(breedGroups.id, input.id));
      return { success: true };
    }),

  reorderBreedGroups: adminProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        for (let i = 0; i < input.ids.length; i++) {
          await tx
            .update(breedGroups)
            .set({ sortOrder: i })
            .where(eq(breedGroups.id, input.ids[i]));
        }
      });
      return { success: true };
    }),

  // ── Breeds ────────────────────────────────────────────────

  listBreeds: adminProcedure
    .input(z.object({
      groupId: z.string().uuid().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.breeds.findMany({
        where: input?.groupId
          ? input.search
            ? and(eq(breeds.groupId, input.groupId), ilike(breeds.name, `%${input.search}%`))
            : eq(breeds.groupId, input.groupId)
          : input?.search
            ? ilike(breeds.name, `%${input.search}%`)
            : undefined,
        with: { group: true },
        orderBy: [asc(breeds.name)],
      });
    }),

  createBreed: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      groupId: z.string().uuid(),
      kcBreedCode: z.string().max(10).optional(),
      variety: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(breeds)
        .values(input)
        .returning();
      return created;
    }),

  updateBreed: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      groupId: z.string().uuid().optional(),
      kcBreedCode: z.string().max(10).nullable().optional(),
      variety: z.string().max(100).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(breeds)
        .set(data)
        .where(eq(breeds.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
      return updated;
    }),

  deleteBreed: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(breeds).where(eq(breeds.id, input.id));
      return { success: true };
    }),

  // ── Class Definitions ─────────────────────────────────────

  listClassDefinitions: adminProcedure
    .input(z.object({
      type: z.enum(['age', 'achievement', 'special', 'junior_handler']).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.classDefinitions.findMany({
        where: input?.type ? eq(classDefinitions.type, input.type) : undefined,
        orderBy: [asc(classDefinitions.type), asc(classDefinitions.sortOrder)],
      });
    }),

  createClassDefinition: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      type: z.enum(['age', 'achievement', 'special', 'junior_handler']),
      description: z.string().optional(),
      minAgeMonths: z.number().int().min(0).optional(),
      maxAgeMonths: z.number().int().min(0).optional(),
      maxWins: z.number().int().min(0).optional(),
      sortOrder: z.number().int().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [created] = await ctx.db
          .insert(classDefinitions)
          .values(input)
          .returning();
        return created;
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('unique')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A class definition named "${input.name}" already exists`,
          });
        }
        throw err;
      }
    }),

  updateClassDefinition: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      type: z.enum(['age', 'achievement', 'special', 'junior_handler']).optional(),
      description: z.string().nullable().optional(),
      minAgeMonths: z.number().int().min(0).nullable().optional(),
      maxAgeMonths: z.number().int().min(0).nullable().optional(),
      maxWins: z.number().int().min(0).nullable().optional(),
      sortOrder: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(classDefinitions)
        .set(data)
        .where(eq(classDefinitions.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
      return updated;
    }),

  deleteClassDefinition: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check if any show classes reference this class definition
      const [usage] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(showClasses)
        .where(eq(showClasses.classDefinitionId, input.id));
      if (usage && usage.count > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete: this class definition is used by ${usage.count} show class${usage.count === 1 ? '' : 'es'}. Remove it from all shows first.`,
        });
      }
      await ctx.db.delete(classDefinitions).where(eq(classDefinitions.id, input.id));
      return { success: true };
    }),

  reorderClassDefinitions: adminProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        for (let i = 0; i < input.ids.length; i++) {
          await tx
            .update(classDefinitions)
            .set({ sortOrder: i })
            .where(eq(classDefinitions.id, input.ids[i]));
        }
      });
      return { success: true };
    }),

  // ── Stats ─────────────────────────────────────────────────

  getStats: adminProcedure.query(async ({ ctx }) => {
    const [breedGroupCount] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(breedGroups);
    const [breedCount] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(breeds);
    const [classCount] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(classDefinitions);

    return {
      breedGroups: breedGroupCount.count,
      breeds: breedCount.count,
      classDefinitions: classCount.count,
    };
  }),
});
