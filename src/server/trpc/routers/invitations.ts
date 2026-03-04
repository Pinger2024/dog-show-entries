import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { Resend } from 'resend';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter } from '../init';
import {
  publicProcedure,
  protectedProcedure,
  secretaryProcedure,
} from '../procedures';
import { invitations, users, organisations, memberships } from '@/server/db/schema';
import { generateToken, getBaseUrl } from '@/server/lib/utils';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const invitationsRouter = createTRPCRouter({
  send: secretaryProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(['secretary', 'steward', 'judge']),
        organisationId: z.string().uuid().optional(),
        message: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      const [invitation] = await ctx.db
        .insert(invitations)
        .values({
          email: input.email,
          role: input.role,
          organisationId: input.organisationId ?? null,
          token,
          status: 'pending',
          invitedById: ctx.session.user.id,
          message: input.message ?? null,
          expiresAt,
        })
        .returning();

      // Send invitation email
      if (resend) {
        const acceptUrl = `${getBaseUrl()}/invite/${token}`;
        const roleName =
          input.role.charAt(0).toUpperCase() + input.role.slice(1);

        await resend.emails.send({
          from: 'Remi <noreply@lettiva.com>',
          to: [input.email],
          replyTo: 'feedback@inbound.lettiva.com',
          subject: `You've been invited to join Remi as a ${roleName}`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto;">
              <h1 style="font-size: 24px; color: #2D5F3F;">Remi</h1>
              <p>Hi,</p>
              <p><strong>${ctx.session.user.name}</strong> has invited you to join Remi as a <strong>${roleName}</strong>.</p>
              ${input.message ? `<p style="padding: 12px 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #2D5F3F;"><em>"${input.message}"</em></p>` : ''}
              <p>Remi is a dog show entry management platform used by exhibitors and show committees across the UK.</p>
              <p style="margin: 24px 0;">
                <a href="${acceptUrl}" style="display: inline-block; background: #2D5F3F; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                  Accept Invitation
                </a>
              </p>
              <p style="color: #6b7280; font-size: 14px;">
                This invitation expires in 14 days. If you didn't expect this email, you can safely ignore it.
              </p>
            </div>
          `,
        });
      }

      return invitation!;
    }),

  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.db.query.invitations.findFirst({
        where: eq(invitations.token, input.token),
        with: {
          invitedBy: {
            columns: { name: true },
          },
          organisation: {
            columns: { name: true },
          },
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      const isExpired =
        invitation.status === 'expired' ||
        (invitation.status === 'pending' &&
          new Date() > invitation.expiresAt);

      return {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: isExpired ? ('expired' as const) : invitation.status,
        message: invitation.message,
        inviterName: invitation.invitedBy?.name ?? 'Unknown',
        organisationName: invitation.organisation?.name ?? null,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
      };
    }),

  accept: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.query.invitations.findFirst({
        where: and(
          eq(invitations.token, input.token),
          eq(invitations.status, 'pending')
        ),
      });

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found or already used',
        });
      }

      if (new Date() > invitation.expiresAt) {
        await ctx.db
          .update(invitations)
          .set({ status: 'expired' })
          .where(eq(invitations.id, invitation.id));

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This invitation has expired',
        });
      }

      // Upgrade user role
      await ctx.db
        .update(users)
        .set({
          role: invitation.role,
          onboardingCompletedAt: new Date(),
        })
        .where(eq(users.id, ctx.session.user.id));

      // Create membership linking user to organisation (if invitation has one)
      if (invitation.organisationId) {
        await ctx.db.insert(memberships).values({
          userId: ctx.session.user.id,
          organisationId: invitation.organisationId,
          status: 'active',
        });
      }

      // Mark invitation as accepted
      await ctx.db
        .update(invitations)
        .set({
          status: 'accepted',
          acceptedById: ctx.session.user.id,
          acceptedAt: new Date(),
        })
        .where(eq(invitations.id, invitation.id));

      return { role: invitation.role };
    }),

  list: secretaryProcedure.query(async ({ ctx }) => {
    const isAdmin = ctx.session.user.role === 'admin';

    const results = await ctx.db.query.invitations.findMany({
      where: isAdmin
        ? undefined
        : eq(invitations.invitedById, ctx.session.user.id),
      with: {
        invitedBy: { columns: { name: true } },
        acceptedBy: { columns: { name: true, email: true } },
        organisation: { columns: { name: true } },
      },
      orderBy: desc(invitations.createdAt),
    });

    return results;
  }),

  revoke: secretaryProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.role === 'admin';

      const invitation = await ctx.db.query.invitations.findFirst({
        where: eq(invitations.id, input.id),
      });

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      if (!isAdmin && invitation.invitedById !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only revoke your own invitations',
        });
      }

      if (invitation.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only pending invitations can be revoked',
        });
      }

      await ctx.db
        .update(invitations)
        .set({ status: 'revoked' })
        .where(eq(invitations.id, input.id));

      return { success: true };
    }),
});
