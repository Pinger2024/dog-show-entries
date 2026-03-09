import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, desc, sql } from 'drizzle-orm';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { backlog } from '@/server/db/schema';

export const backlogRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(['awaiting_feedback', 'planned', 'in_progress', 'completed', 'dismissed'])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const where = input.status ? eq(backlog.status, input.status) : undefined;

      return ctx.db.query.backlog.findMany({
        where,
        orderBy: [desc(backlog.featureNumber)],
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (ctx.session.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const item = await ctx.db.query.backlog.findFirst({
        where: eq(backlog.id, input.id),
      });

      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Backlog item not found' });
      }

      return item;
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['awaiting_feedback', 'planned', 'in_progress', 'completed', 'dismissed']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const [updated] = await ctx.db
        .update(backlog)
        .set({ status: input.status })
        .where(eq(backlog.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Backlog item not found' });
      }

      return updated;
    }),

  updateNotes: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        notes: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const [updated] = await ctx.db
        .update(backlog)
        .set({ notes: input.notes })
        .where(eq(backlog.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Backlog item not found' });
      }

      return updated;
    }),

  updateResponse: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        latestResponse: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const [updated] = await ctx.db
        .update(backlog)
        .set({ latestResponse: input.latestResponse })
        .where(eq(backlog.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Backlog item not found' });
      }

      return updated;
    }),

  counts: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.session.user.role !== 'admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
    }

    const rows = await ctx.db
      .select({
        status: backlog.status,
        count: sql<number>`count(*)::int`,
      })
      .from(backlog)
      .groupBy(backlog.status);

    const counts: Record<string, number> = {
      awaiting_feedback: 0,
      planned: 0,
      in_progress: 0,
      completed: 0,
      dismissed: 0,
    };

    for (const row of rows) {
      counts[row.status] = row.count;
    }

    return counts;
  }),
});
