import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, desc, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { feedback } from '@/server/db/schema';

const resend = new Resend(process.env.RESEND_API_KEY);

export const feedbackRouter = createTRPCRouter({
  submit: protectedProcedure
    .input(
      z.object({
        subject: z.string().min(3).max(500),
        body: z.string().min(5).max(5000),
        feedbackType: z.enum(['bug', 'feature', 'question', 'general']).default('general'),
        pageUrl: z.string().max(2000),
        userAgent: z.string().max(1000).optional(),
        attachmentUrl: z.string().max(2000).optional(),
        attachmentFileName: z.string().max(500).optional(),
        attachmentStorageKey: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.session.user;
      const fromEmail = user.email ?? 'unknown@user';
      const fromName = user.name ?? undefined;

      // Generate a unique ID for this widget submission (not from email)
      const widgetId = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const diagnostics = [
        `Page: ${input.pageUrl}`,
        input.userAgent ? `Browser: ${input.userAgent}` : null,
        `User: ${fromName ? `${fromName} (${fromEmail})` : fromEmail}`,
        `Role: ${user.role ?? 'unknown'}`,
        `User ID: ${user.id}`,
      ]
        .filter(Boolean)
        .join('\n');

      const fullBody = `${input.body}\n\n---\nDiagnostics:\n${diagnostics}`;

      const [inserted] = await ctx.db
        .insert(feedback)
        .values({
          resendEmailId: widgetId,
          fromEmail,
          fromName: fromName ?? null,
          subject: input.subject,
          textBody: fullBody,
          htmlBody: null,
          inReplyToSubject: null,
          status: 'pending',
          source: 'widget',
          feedbackType: input.feedbackType,
          attachmentUrl: input.attachmentUrl ?? null,
          attachmentFileName: input.attachmentFileName ?? null,
          attachmentStorageKey: input.attachmentStorageKey ?? null,
        })
        .returning();

      // Notify Michael & Amanda
      const notifyEmails = [
        process.env.FEEDBACK_NOTIFY_EMAIL,
        'mandy@hundarkgsd.co.uk',
      ].filter(Boolean) as string[];

      if (notifyEmails.length > 0) {
        const displaySender = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
        resend.emails
          .send({
            from: process.env.EMAIL_FROM ?? 'Remi <noreply@lettiva.com>',
            to: notifyEmails,
            replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@inbound.lettiva.com',
            subject: `Support request from ${fromName ?? fromEmail}: ${input.subject}`,
            html: `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h2 style="color: #1a1a1a;">New Support Request</h2>
<p><strong>From:</strong> ${displaySender}</p>
<p><strong>Subject:</strong> ${input.subject}</p>
<p><strong>Page:</strong> ${input.pageUrl}</p>
<hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;">
<p style="white-space: pre-wrap;">${input.body}</p>
${input.attachmentUrl ? `<p style="margin: 12px 0;"><strong>Attachment:</strong> <a href="${input.attachmentUrl}">${input.attachmentFileName ?? 'View attachment'}</a></p><img src="${input.attachmentUrl}" alt="Attachment" style="max-width: 100%; border-radius: 8px; border: 1px solid #ddd;">` : ''}
<hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;">
<p style="color: #666; font-size: 13px;">
<strong>Diagnostics:</strong><br>
${diagnostics.replace(/\n/g, '<br>')}
</p>
<p style="margin-top: 20px;"><a href="https://remishowmanager.co.uk/feedback">View in Remi</a></p>
</div>`,
          })
          .catch((err) =>
            console.error('[feedback-widget] Notification email failed:', err)
          );
      }

      return { id: inserted.id };
    }),

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
