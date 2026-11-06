import { z } from 'zod';
import { eq, isNull, sql } from 'drizzle-orm';
import { createTRPCRouter } from '../init';
import { adminProcedure } from '../procedures';
import { users, entries, dogs, memberships, organisations } from '@/server/db/schema';
import { populateShowWithTestData, clearShowTestData } from '@/server/services/test-data-generator';

export const devRouter = createTRPCRouter({
  /**
   * List all users for admin user management.
   * Includes entry count and timestamps for richer admin views.
   */
  listUsers: adminProcedure.query(async ({ ctx }) => {
    // Dogs and entries are counted in their OWN grouped queries and stitched
    // together here, rather than two leftJoins off users: joining both
    // multiplies the rows together, so a user with 3 dogs and 4 entries reads
    // as 12 of each. Scale is small (157 users, 13 clubs on prod at
    // 2026-09-11) so three cheap queries beat one clever one.
    const allUsers = await ctx.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        image: users.image,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(users.name);

    const entryCounts = await ctx.db
      .select({
        userId: entries.exhibitorId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(entries)
      .where(isNull(entries.deletedAt))
      .groupBy(entries.exhibitorId);

    const dogCounts = await ctx.db
      .select({
        userId: dogs.ownerId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dogs)
      .where(isNull(dogs.deletedAt))
      .groupBy(dogs.ownerId);

    const entriesByUser = new Map(entryCounts.map((r) => [r.userId, r.count]));
    const dogsByUser = new Map(dogCounts.map((r) => [r.userId, r.count]));

    // Club membership is what actually grants a secretary access to a show
    // (verifyOrgAccess gates on an ACTIVE membership), so the admin list is
    // much more useful with it — several clubs on both prod and demo have
    // near-identical names ("Midland Regional GSD Group" vs "Midland Region
    // GSD Club" vs "Midland regional group"), and picking the wrong one to
    // test against has bitten us before. Explicit org columns only: never
    // select the organisation row wholesale, it carries bank details.
    const clubRows = await ctx.db
      .select({
        userId: memberships.userId,
        organisationId: organisations.id,
        organisationName: organisations.name,
        status: memberships.status,
      })
      .from(memberships)
      .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
      .orderBy(organisations.name);

    const clubsByUser = new Map<string, Array<{ id: string; name: string; status: string }>>();
    for (const row of clubRows) {
      const list = clubsByUser.get(row.userId) ?? [];
      list.push({ id: row.organisationId, name: row.organisationName, status: row.status });
      clubsByUser.set(row.userId, list);
    }

    return allUsers.map((u) => ({
      ...u,
      entryCount: entriesByUser.get(u.id) ?? 0,
      dogCount: dogsByUser.get(u.id) ?? 0,
      clubs: clubsByUser.get(u.id) ?? [],
    }));
  }),

  /**
   * Change a user's role.
   */
  setRole: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(['exhibitor', 'secretary', 'steward', 'judge', 'admin']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        });

      if (!updated) {
        throw new Error('User not found');
      }

      return updated;
    }),

  /**
   * Populate a show with realistic test data.
   * Creates dogs, entries, entry classes, judges, rings, and orders.
   */
  populateShowTestData: adminProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        targetEntries: z.number().int().min(10).max(500).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return populateShowWithTestData({
        showId: input.showId,
        targetEntries: input.targetEntries,
      });
    }),

  /**
   * Clear all test data from a show (entries, dogs, orders, judges, rings).
   */
  clearShowTestData: adminProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return clearShowTestData(input.showId);
    }),
});
