import { z } from 'zod';
import { eq, desc, and, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter } from '../init';
import { protectedProcedure, adminProcedure } from '../procedures';
import {
  secretaryApplications,
  secretaryApplicationStatusEnum,
  clubTypeEnum,
  invitations,
} from '@/server/db/schema';
import { generateToken, getBaseUrl } from '@/server/lib/utils';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const CLUB_TYPE_LABELS: Record<string, string> = {
  single_breed: 'Single Breed',
  multi_breed: 'Multi Breed',
};

export const secretaryApplicationsRouter = createTRPCRouter({
  submit: protectedProcedure
    .input(
      z.object({
        organisationName: z.string().min(1, 'Organisation name is required'),
        clubType: z.enum(clubTypeEnum.enumValues),
        breedOrGroup: z.string().optional(),
        kcRegNumber: z.string().optional(),
        contactEmail: z.string().email(),
        contactPhone: z.string().optional(),
        website: z.string().optional(),
        details: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only exhibitors can apply
      if (ctx.session.user.role !== 'exhibitor') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only exhibitors can apply for secretary access',
        });
      }

      // Check for existing pending application
      const existing = await ctx.db.query.secretaryApplications.findFirst({
        where: and(
          eq(secretaryApplications.userId, ctx.session.user.id),
          eq(secretaryApplications.status, 'pending')
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You already have a pending application',
        });
      }

      const [application] = await ctx.db
        .insert(secretaryApplications)
        .values({
          userId: ctx.session.user.id,
          organisationName: input.organisationName,
          clubType: input.clubType,
          breedOrGroup: input.breedOrGroup ?? null,
          kcRegNumber: input.kcRegNumber ?? null,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone ?? null,
          website: input.website ?? null,
          details: input.details ?? null,
        })
        .returning();

      // Notify admin (fire-and-forget)
      if (resend) {
        const notifyEmail =
          process.env.FEEDBACK_NOTIFY_EMAIL ?? 'michael@prometheus-it.com';
        const adminUrl = `${getBaseUrl()}/admin/applications`;

        resend.emails.send({
          from: 'Remi <noreply@lettiva.com>',
          to: [notifyEmail],
          replyTo: 'feedback@inbound.lettiva.com',
          subject: `New Secretary Application: ${input.organisationName}`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto;">
              <h1 style="font-size: 24px; color: #2D5F3F;">Remi</h1>
              <p>A new secretary application has been submitted.</p>
              <div style="padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #2D5F3F; margin: 16px 0;">
                <p style="margin: 0 0 8px;"><strong>Applicant:</strong> ${ctx.session.user.name ?? 'Unknown'} (${ctx.session.user.email})</p>
                <p style="margin: 0 0 8px;"><strong>Organisation:</strong> ${input.organisationName}</p>
                <p style="margin: 0 0 8px;"><strong>Club Type:</strong> ${CLUB_TYPE_LABELS[input.clubType] ?? input.clubType}</p>
                ${input.breedOrGroup ? `<p style="margin: 0 0 8px;"><strong>Breed/Group:</strong> ${input.breedOrGroup}</p>` : ''}
                ${input.details ? `<p style="margin: 0;"><strong>Details:</strong> ${input.details}</p>` : ''}
              </div>
              <p style="margin: 24px 0;">
                <a href="${adminUrl}" style="display: inline-block; background: #2D5F3F; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                  Review Application
                </a>
              </p>
            </div>
          `,
        }).catch((err) => {
          console.error('[secretary-applications] failed to send admin notification:', err);
        });
      }

      return application!;
    }),

  myApplication: protectedProcedure.query(async ({ ctx }) => {
    const application =
      await ctx.db.query.secretaryApplications.findFirst({
        where: eq(secretaryApplications.userId, ctx.session.user.id),
        with: {
          invitation: {
            columns: { token: true, status: true },
          },
        },
        orderBy: desc(secretaryApplications.createdAt),
      });

    return application ?? null;
  }),

  list: adminProcedure.query(async ({ ctx }) => {
    const [applications, countRows] = await Promise.all([
      ctx.db.query.secretaryApplications.findMany({
        with: {
          user: {
            columns: { name: true, email: true, image: true },
          },
          reviewedBy: {
            columns: { name: true },
          },
        },
        orderBy: desc(secretaryApplications.createdAt),
      }),
      ctx.db
        .select({
          status: secretaryApplications.status,
          count: sql<number>`count(*)::int`,
        })
        .from(secretaryApplications)
        .groupBy(secretaryApplications.status),
    ]);

    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const row of countRows) {
      counts[row.status] = row.count;
    }

    return { applications, counts };
  }),

  review: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        action: z.enum(['approve', 'reject']),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const application =
        await ctx.db.query.secretaryApplications.findFirst({
          where: and(
            eq(secretaryApplications.id, input.id),
            eq(secretaryApplications.status, 'pending')
          ),
          with: {
            user: {
              columns: { id: true, name: true, email: true },
            },
          },
        });

      if (!application) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Application not found or already reviewed',
        });
      }

      const reviewFields = {
        reviewedById: ctx.session.user.id,
        reviewNotes: input.notes ?? null,
        reviewedAt: new Date(),
      };

      if (input.action === 'approve') {
        // Create an invitation for the applicant (use account email, not contact email)
        const token = generateToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const [invitation] = await ctx.db
          .insert(invitations)
          .values({
            email: application.user.email!,
            role: 'secretary',
            token,
            status: 'pending',
            invitedById: ctx.session.user.id,
            message: `Your application for ${application.organisationName} has been approved!`,
            expiresAt,
          })
          .returning();

        // Update application with atomic status guard
        const [updated] = await ctx.db
          .update(secretaryApplications)
          .set({
            status: 'approved',
            invitationId: invitation!.id,
            ...reviewFields,
          })
          .where(
            and(
              eq(secretaryApplications.id, input.id),
              eq(secretaryApplications.status, 'pending')
            )
          )
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Application was already reviewed',
          });
        }

        // Send approval email (fire-and-forget)
        if (resend) {
          const acceptUrl = `${getBaseUrl()}/invite/${token}`;

          resend.emails.send({
            from: 'Remi <noreply@lettiva.com>',
            to: [application.contactEmail],
            replyTo: 'feedback@inbound.lettiva.com',
            subject: `Your Remi Secretary Application Has Been Approved!`,
            html: `
              <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto;">
                <h1 style="font-size: 24px; color: #2D5F3F;">Remi</h1>
                <p>Hi ${application.user.name?.split(' ')[0] ?? 'there'},</p>
                <p>Great news! Your application to become a show secretary for <strong>${application.organisationName}</strong> has been approved.</p>
                ${input.notes ? `<p style="padding: 12px 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #2D5F3F;"><em>"${input.notes}"</em></p>` : ''}
                <p>Click the button below to activate your secretary account. You'll then be able to create and manage shows on Remi.</p>
                <p style="margin: 24px 0;">
                  <a href="${acceptUrl}" style="display: inline-block; background: #2D5F3F; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                    Activate Secretary Access
                  </a>
                </p>
                <p style="color: #6b7280; font-size: 14px;">
                  This link expires in 30 days. If you have any questions, just reply to this email.
                </p>
              </div>
            `,
          }).catch((err) => {
            console.error('[secretary-applications] failed to send approval email:', err);
          });
        }

        return { success: true, action: 'approved' as const };
      } else {
        // Reject with atomic status guard
        const [updated] = await ctx.db
          .update(secretaryApplications)
          .set({
            status: 'rejected',
            ...reviewFields,
          })
          .where(
            and(
              eq(secretaryApplications.id, input.id),
              eq(secretaryApplications.status, 'pending')
            )
          )
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Application was already reviewed',
          });
        }

        // Send rejection email (fire-and-forget)
        if (resend) {
          resend.emails.send({
            from: 'Remi <noreply@lettiva.com>',
            to: [application.contactEmail],
            replyTo: 'feedback@inbound.lettiva.com',
            subject: `Update on Your Remi Secretary Application`,
            html: `
              <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto;">
                <h1 style="font-size: 24px; color: #2D5F3F;">Remi</h1>
                <p>Hi ${application.user.name?.split(' ')[0] ?? 'there'},</p>
                <p>Thank you for your interest in running shows on Remi. After reviewing your application for <strong>${application.organisationName}</strong>, we're unable to approve it at this time.</p>
                ${input.notes ? `<p style="padding: 12px 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #2D5F3F;"><em>"${input.notes}"</em></p>` : ''}
                <p>This doesn't have to be the end of the road — we'd love to help you get set up. If you have additional information to share or would like to discuss your application, simply reply to this email.</p>
                <p>You're also welcome to submit a new application at any time.</p>
                <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
                  Best wishes,<br />The Remi Team
                </p>
              </div>
            `,
          }).catch((err) => {
            console.error('[secretary-applications] failed to send rejection email:', err);
          });
        }

        return { success: true, action: 'rejected' as const };
      }
    }),
});
