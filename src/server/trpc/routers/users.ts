import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, gte, inArray, sql, desc } from 'drizzle-orm';
import { Resend } from 'resend';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import {
  users,
  entries,
  dogs,
  shows,
  sessions,
  accounts,
} from '@/server/db/schema';
import { hash, compare } from 'bcryptjs';

export const usersRouter = createTRPCRouter({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255).optional(),
        address: z.string().nullable().optional(),
        postcode: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        kcAccountNo: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set(input)
        .where(eq(users.id, ctx.session.user.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return updated;
    }),

  hasPassword: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await ctx.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, ctx.session.user.id))
      .limit(1);

    return !!user?.passwordHash;
  }),

  setPassword: protectedProcedure
    .input(
      z.object({
        password: z.string().min(8).max(128),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Ensure user doesn't already have a password
      const [user] = await ctx.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, ctx.session.user.id))
        .limit(1);

      if (user?.passwordHash) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You already have a password. Use change password instead.',
        });
      }

      const passwordHash = await hash(input.password, 12);

      await ctx.db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, ctx.session.user.id));

      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(128),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, ctx.session.user.id))
        .limit(1);

      if (!user?.passwordHash) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No password set. Use set password instead.',
        });
      }

      const valid = await compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Current password is incorrect',
        });
      }

      const passwordHash = await hash(input.newPassword, 12);

      await ctx.db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, ctx.session.user.id));

      return { success: true };
    }),

  closeAccount: protectedProcedure
    .input(z.object({ confirmation: z.literal('CLOSE') }))
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
      }
      if (user.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Account is already closed',
        });
      }

      // Send a closure confirmation email BEFORE scrubbing the address — so
      // the user has a record that we received and processed their request.
      // We don't block closure on email delivery failure.
      const originalEmail = user.email;
      const originalName = user.name?.trim() || 'there';

      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from:
            process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>',
          to: originalEmail,
          replyTo: 'feedback@inbound.remishowmanager.co.uk',
          subject: 'Your Remi account has been closed',
          text: [
            `Hi ${originalName},`,
            '',
            'Your Remi account has been closed at your request.',
            '',
            "We've removed your personal details from our active records.",
            'Financial records (orders, payments and refunds) are kept for',
            '6 years to comply with HMRC rules — see our Privacy Policy for',
            'detail.',
            '',
            'If you closed your account by mistake, reply to this email and',
            "we'll see what we can do.",
            '',
            '— Remi',
          ].join('\n'),
        });
      } catch (e) {
        console.error('[closeAccount] failed to send confirmation email', e);
      }

      // Scrub PII + soft-delete. Sentinel email keeps the unique constraint
      // satisfied without blocking the original address from being reused
      // by a future signup.
      const sentinelEmail = `closed-${userId}@deleted.invalid`;
      await ctx.db
        .update(users)
        .set({
          deletedAt: new Date(),
          email: sentinelEmail,
          name: '',
          image: null,
          address: null,
          phone: null,
          postcode: null,
          kcAccountNo: null,
          passwordHash: null,
        })
        .where(eq(users.id, userId));

      // Clear DB sessions and OAuth account links so the user can't be
      // re-authenticated against this row. JWT cookies on the user's
      // device are cleared by the client calling signOut() after this
      // mutation resolves.
      await ctx.db.delete(sessions).where(eq(sessions.userId, userId));
      await ctx.db.delete(accounts).where(eq(accounts.userId, userId));

      return { success: true };
    }),

  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date().toISOString().split('T')[0]!;

    // Count of upcoming entries
    const upcomingEntries = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(entries)
      .innerJoin(shows, eq(entries.showId, shows.id))
      .where(
        and(
          eq(entries.exhibitorId, ctx.session.user.id),
          isNull(entries.deletedAt),
          inArray(entries.status, ['pending', 'confirmed']),
          gte(shows.startDate, today)
        )
      );

    // Count of active dogs
    const totalDogs = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(dogs)
      .where(
        and(eq(dogs.ownerId, ctx.session.user.id), isNull(dogs.deletedAt))
      );

    // Recent entries
    const recentEntries = await ctx.db.query.entries.findMany({
      where: and(
        eq(entries.exhibitorId, ctx.session.user.id),
        isNull(entries.deletedAt)
      ),
      with: {
        show: {
          with: {
            organisation: true,
          },
        },
        dog: {
          with: {
            breed: true,
          },
        },
      },
      orderBy: [desc(entries.createdAt)],
      limit: 5,
    });

    return {
      upcomingEntriesCount: Number(upcomingEntries[0]?.count ?? 0),
      totalDogsCount: Number(totalDogs[0]?.count ?? 0),
      recentEntries,
    };
  }),
});
