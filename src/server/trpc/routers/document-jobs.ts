import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { createTRPCRouter } from '../init';
import { protectedProcedure } from '../procedures';
import { shows, documentRenderJobs } from '@/server/db/schema';
import { resolvePdfAccessForSession } from '@/lib/pdf-utils';
import {
  isCatalogueFormat,
  catalogueShowDayGate,
  requestCatalogueJob,
  getCatalogueJobStatus,
} from '@/server/services/catalogue-jobs';

/**
 * Background document rendering — today, catalogue PDFs only. The web
 * request process never renders a PDF itself any more (2026-08-15 outage:
 * a heavy catalogue render OOM-killed the single prod web instance mid-
 * entries); `request` enqueues a job (or dedupes onto an existing one) and
 * `status` polls it, backed by a presigned R2 URL once done. See
 * src/server/services/catalogue-jobs.ts and
 * src/server/workers/document-render-worker.ts.
 */
export const documentJobsRouter = createTRPCRouter({
  request: protectedProcedure
    .input(z.object({ showId: z.string().uuid(), format: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isCatalogueFormat(input.format)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid catalogue format: ${input.format}` });
      }

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { id: true, organisationId: true, startDate: true },
      });
      if (!show) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });

      const access = await resolvePdfAccessForSession(
        ctx.session.user.id,
        ctx.callerIsAdmin,
        show.organisationId,
        { showId: input.showId, format: input.format },
      );

      // Catalogues are released to exhibitors on the morning of the show
      // (Amanda 2026-05-28) — same gate as the download route.
      const gate = catalogueShowDayGate(access.isExhibitorAccess, show);
      if (gate.blocked) {
        throw new TRPCError({ code: 'FORBIDDEN', message: gate.message });
      }

      return requestCatalogueJob(ctx.db, {
        showId: input.showId,
        format: input.format,
        requestedByUserId: ctx.session.user.id,
      });
    }),

  status: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.documentRenderJobs.findFirst({
        where: eq(documentRenderJobs.id, input.jobId),
        columns: { id: true, showId: true, format: true },
        with: { show: { columns: { id: true, organisationId: true, name: true, startDate: true } } },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });

      // Re-check access exactly as `request` did — a job id must not act as
      // a bearer token for a document holding exhibitor personal data.
      const access = await resolvePdfAccessForSession(
        ctx.session.user.id,
        ctx.callerIsAdmin,
        job.show.organisationId,
        { showId: job.showId, format: job.format },
      );
      const gate = catalogueShowDayGate(access.isExhibitorAccess, job.show);
      if (gate.blocked) {
        throw new TRPCError({ code: 'FORBIDDEN', message: gate.message });
      }

      const result = await getCatalogueJobStatus(ctx.db, input.jobId, { showName: job.show.name });
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      return result;
    }),
});
