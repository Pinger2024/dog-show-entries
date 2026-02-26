import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, asc, sql } from 'drizzle-orm';
import { publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { organisations, shows } from '@/server/db/schema';

export const organisationsRouter = createTRPCRouter({
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.id),
        with: {
          shows: {
            orderBy: [asc(shows.startDate)],
            limit: 10,
          },
        },
      });

      if (!org) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organisation not found',
        });
      }

      return org;
    }),

  getShows: publicProcedure
    .input(
      z.object({
        organisationId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const where = eq(shows.organisationId, input.organisationId);

      const items = await ctx.db.query.shows.findMany({
        where,
        with: {
          venue: true,
        },
        orderBy: [asc(shows.startDate)],
        limit: input.limit,
        offset: input.cursor,
      });

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(shows)
        .where(where);

      const total = Number(countResult[0]?.count ?? 0);

      return {
        items,
        total,
        nextCursor:
          input.cursor + input.limit < total
            ? input.cursor + input.limit
            : null,
      };
    }),
});
