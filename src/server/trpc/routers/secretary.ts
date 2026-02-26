import { z } from 'zod';
import { and, eq, sql, isNull, inArray } from 'drizzle-orm';
import { secretaryProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import {
  shows,
  entries,
  organisations,
  venues,
  classDefinitions,
  memberships,
} from '@/server/db/schema';

export const secretaryRouter = createTRPCRouter({
  getDashboard: secretaryProcedure.query(async ({ ctx }) => {
    // Get organisations the user is a member of
    const userMemberships = await ctx.db.query.memberships.findMany({
      where: and(
        eq(memberships.userId, ctx.session.user.id),
        eq(memberships.status, 'active')
      ),
      with: { organisation: true },
    });

    const orgIds = userMemberships.map((m) => m.organisationId);

    if (orgIds.length === 0) {
      return {
        organisations: [],
        shows: [],
        totalShows: 0,
        totalEntries: 0,
        totalRevenue: 0,
      };
    }

    // Get all shows for the user's organisations
    const orgShows = await ctx.db.query.shows.findMany({
      where: inArray(shows.organisationId, orgIds),
      with: {
        organisation: true,
        venue: true,
      },
      orderBy: (shows, { desc }) => [desc(shows.startDate)],
    });

    // Get total entries across all shows
    const showIds = orgShows.map((s) => s.id);
    let totalEntries = 0;
    let totalRevenue = 0;

    if (showIds.length > 0) {
      const entryCounts = await ctx.db
        .select({
          count: sql<number>`count(*)`,
          revenue: sql<number>`coalesce(sum(${entries.totalFee}), 0)`,
        })
        .from(entries)
        .where(
          and(inArray(entries.showId, showIds), isNull(entries.deletedAt))
        );

      totalEntries = Number(entryCounts[0]?.count ?? 0);
      totalRevenue = Number(entryCounts[0]?.revenue ?? 0);
    }

    return {
      organisations: userMemberships.map((m) => m.organisation),
      shows: orgShows,
      totalShows: orgShows.length,
      totalEntries,
      totalRevenue,
    };
  }),

  getShowStats: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const entryCounts = await ctx.db
        .select({
          count: sql<number>`count(*)`,
          revenue: sql<number>`coalesce(sum(${entries.totalFee}), 0)`,
          confirmed: sql<number>`count(*) filter (where ${entries.status} = 'confirmed')`,
          pending: sql<number>`count(*) filter (where ${entries.status} = 'pending')`,
        })
        .from(entries)
        .where(
          and(
            eq(entries.showId, input.showId),
            isNull(entries.deletedAt)
          )
        );

      return {
        totalEntries: Number(entryCounts[0]?.count ?? 0),
        totalRevenue: Number(entryCounts[0]?.revenue ?? 0),
        confirmedEntries: Number(entryCounts[0]?.confirmed ?? 0),
        pendingEntries: Number(entryCounts[0]?.pending ?? 0),
      };
    }),

  listVenues: secretaryProcedure.query(async ({ ctx }) => {
    return ctx.db.query.venues.findMany({
      orderBy: (venues, { asc }) => [asc(venues.name)],
    });
  }),

  createVenue: secretaryProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        address: z.string().optional(),
        postcode: z.string().optional(),
        indoorOutdoor: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [venue] = await ctx.db
        .insert(venues)
        .values(input)
        .returning();
      return venue!;
    }),

  listClassDefinitions: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.classDefinitions.findMany({
      orderBy: (cd, { asc }) => [asc(cd.name)],
    });
  }),
});
