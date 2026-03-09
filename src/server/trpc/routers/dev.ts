import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { createTRPCRouter } from '../init';
import { adminProcedure } from '../procedures';
import { users, entries } from '@/server/db/schema';

export const devRouter = createTRPCRouter({
  /**
   * List all users for admin user management.
   * Includes entry count and timestamps for richer admin views.
   */
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const allUsers = await ctx.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        image: users.image,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        entryCount: sql<number>`cast(count(${entries.id}) as int)`,
      })
      .from(users)
      .leftJoin(entries, eq(entries.exhibitorId, users.id))
      .groupBy(users.id)
      .orderBy(users.name);

    return allUsers;
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
});
