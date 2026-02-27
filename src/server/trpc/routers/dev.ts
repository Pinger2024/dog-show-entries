import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { users } from '@/server/db/schema';

export const devRouter = createTRPCRouter({
  /**
   * List all users for the account switcher.
   * Available to any authenticated user (it's a demo app).
   */
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    const allUsers = await ctx.db.query.users.findMany({
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
      },
      orderBy: (u, { asc }) => [asc(u.name)],
    });
    return allUsers;
  }),

  /**
   * Change a user's role. Available to any authenticated user in demo mode.
   * In production this would be admin-only.
   */
  setRole: protectedProcedure
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
