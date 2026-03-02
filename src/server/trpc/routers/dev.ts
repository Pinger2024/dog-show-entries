import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, middleware, baseProcedure } from '../init';
import { users } from '@/server/db/schema';

// Account switcher access: admin role OR specific allowed emails
const ALLOWED_EMAILS = ['michael@prometheus-it.com', 'mandy@hundarkgsd.co.uk'];

const isDevAuthorised = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  if (
    ctx.session.user.role !== 'admin' &&
    !ALLOWED_EMAILS.includes(ctx.session.user.email)
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Dev tools access required',
    });
  }
  return next({ ctx: { session: ctx.session } });
});

const devProcedure = baseProcedure.use(isDevAuthorised);

export const devRouter = createTRPCRouter({
  /**
   * List all users for the account switcher.
   */
  listUsers: devProcedure.query(async ({ ctx }) => {
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
   * Change a user's role.
   */
  setRole: devProcedure
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
