import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, desc, sql } from 'drizzle-orm';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { feedback } from '@/server/db/schema';

export const feedbackRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(['pending', 'in_progress', 'completed', 'dismissed'])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin access required',
        });
      }

      const where = input.status ? eq(feedback.status, input.status) : undefined;

      return ctx.db.query.feedback.findMany({
        where,
        orderBy: [desc(feedback.createdAt)],
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (ctx.session.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin access required',
        });
      }

      const item = await ctx.db.query.feedback.findFirst({
        where: eq(feedback.id, input.id),
      });

      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feedback not found' });
      }

      return item;
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['pending', 'in_progress', 'completed', 'dismissed']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin access required',
        });
      }

      const [updated] = await ctx.db
        .update(feedback)
        .set({ status: input.status })
        .where(eq(feedback.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feedback not found' });
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
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin access required',
        });
      }

      const [updated] = await ctx.db
        .update(feedback)
        .set({ notes: input.notes })
        .where(eq(feedback.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feedback not found' });
      }

      return updated;
    }),

  counts: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.session.user.role !== 'admin') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });
    }

    const rows = await ctx.db
      .select({
        status: feedback.status,
        count: sql<number>`count(*)::int`,
      })
      .from(feedback)
      .groupBy(feedback.status);

    const counts: Record<string, number> = {
      pending: 0,
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
