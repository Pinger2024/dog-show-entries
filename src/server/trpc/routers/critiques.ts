import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { createTRPCRouter } from '../init';
import { publicProcedure, secretaryProcedure } from '../procedures';
import { verifyShowAccess } from '../verify-show-access';
import {
  critiqueDocuments,
  judges,
  judgeAssignments,
  results,
  shows,
  type CritiqueParsedBlock,
} from '@/server/db/schema';
import {
  loadShowClassRows,
  toAssignableList,
  type AssignableEntryClass,
} from '@/server/services/critique-results-graph';
import { publishGateStatus } from '@/lib/critique-publish-gate';
import { sendCritiqueInviteEmail, sendCritiqueSubmittedEmail, APP_URL } from '@/server/services/email';

// Mirrors CritiqueParsedBlock (src/server/db/schema/critique-documents.ts) —
// the client round-trips the exact shape it received from getByToken /
// getForSecretary, editing only the fields the server actually trusts
// (critiqueText, matchedEntryClassId, include, and — secretary-only —
// resolution). Every other field is re-derived or carried over server-side;
// see reconcileBlocks below.
const critiqueBlockInputSchema = z.object({
  kind: z.enum(['critique', 'overview', 'unmatched']),
  classNameRaw: z.string().nullable(),
  position: z.number().int().nullable(),
  ownersRaw: z.string().nullable(),
  dogRaw: z.string().nullable(),
  dogNameCleaned: z.string().nullable(),
  pedigreeRaw: z.string().nullable(),
  critiqueText: z.string(),
  matchedShowClassId: z.string().uuid().nullable(),
  matchedEntryClassId: z.string().uuid().nullable(),
  confidence: z.enum(['exact', 'check', 'unmatched']),
  conflict: z.object({ existingText: z.string() }).nullable(),
  resolution: z.enum(['document', 'existing']).nullable(),
  include: z.boolean(),
  hints: z.array(z.string()),
});
type CritiqueBlockInput = z.infer<typeof critiqueBlockInputSchema>;

/**
 * Reconciles a client-submitted blocks array against the server's stored
 * copy. Only critiqueText / include / matchedEntryClassId (and, when
 * `allowResolution`, resolution) are trusted from the client — everything
 * else (the parse-derived fields, confidence, conflict, hints) is preserved
 * or re-derived here, never taken verbatim from the wire.
 *
 * A reassignment (matchedEntryClassId changes) is treated as an explicit
 * human match confirmation — confidence jumps straight to 'exact' and any
 * conflict is recomputed against the NEW target's existing steward critique
 * (never the old one), with resolution reset to null so it needs a fresh
 * explicit choice.
 */
function reconcileBlocks(
  storedBlocks: CritiqueParsedBlock[],
  incoming: CritiqueBlockInput[],
  assignable: AssignableEntryClass[],
  opts: { allowResolution: boolean },
): CritiqueParsedBlock[] {
  if (incoming.length !== storedBlocks.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'This review has changed since you loaded it — please refresh and try again.',
    });
  }

  const byEntryClassId = new Map(assignable.map((a) => [a.entryClassId, a]));

  return storedBlocks.map((stored, i) => {
    const inc = incoming[i]!;
    const next: CritiqueParsedBlock = { ...stored, critiqueText: inc.critiqueText, include: inc.include };

    const reassigned = inc.matchedEntryClassId !== stored.matchedEntryClassId;
    if (reassigned) {
      if (inc.matchedEntryClassId !== null && !byEntryClassId.has(inc.matchedEntryClassId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That class/dog is not part of this show — please refresh and try again.',
        });
      }
      next.matchedEntryClassId = inc.matchedEntryClassId;
      next.resolution = null;
      if (inc.matchedEntryClassId === null) {
        next.confidence = 'unmatched';
        next.conflict = null;
      } else {
        next.confidence = 'exact';
        const target = byEntryClassId.get(inc.matchedEntryClassId)!;
        const existingText = target.existingCritiqueText?.trim() ?? '';
        next.conflict =
          existingText && existingText !== next.critiqueText.trim()
            ? { existingText: target.existingCritiqueText! }
            : null;
      }
    }

    if (opts.allowResolution) {
      next.resolution = inc.resolution;
    }

    return next;
  });
}

/** Attaches server-resolved display info (dog name, class, placement) to
 *  each matched block, so the judge/secretary pages never need a second
 *  query to show what a critique is actually attached to. */
function enrichBlocks(blocks: CritiqueParsedBlock[], assignable: AssignableEntryClass[]) {
  const byEntryClassId = new Map(assignable.map((a) => [a.entryClassId, a]));
  return blocks.map((b) => {
    const match = b.matchedEntryClassId ? byEntryClassId.get(b.matchedEntryClassId) : undefined;
    return {
      ...b,
      matchedDisplay: match
        ? { className: match.className, sex: match.sex, placement: match.placement, registeredName: match.registeredName }
        : null,
    };
  });
}

/** Every included, matched, non-'existing'-resolution block — exactly what
 *  publish() writes to results.critique_text and what unpublish() is
 *  allowed to clear. Shared so the two can't drift.
 *
 *  Deliberately keyed on `matchedEntryClassId`, not `kind === 'critique'`:
 *  `kind` is the parse-time provenance ('critique' / 'overview' /
 *  'unmatched') and is never rewritten by reconcileBlocks — a block that
 *  started life 'unmatched' and was given a home in review (an explicit
 *  reassignment, which is what let it clear the publish gate at all) still
 *  has `kind: 'unmatched'` forever. Filtering on `kind === 'critique'` here
 *  would silently drop exactly the blocks the "needs a home" flow exists
 *  to fix — the gate would say ready, but the fix would never actually
 *  reach the dog's critique. Only 'overview' is excluded (it has no
 *  entryClassId to write to; it becomes overviewText instead). */
function writableBlocks(blocks: CritiqueParsedBlock[]) {
  return blocks.filter(
    (b) => b.kind !== 'overview' && b.include && b.matchedEntryClassId && b.resolution !== 'existing',
  );
}

export const critiquesRouter = createTRPCRouter({
  // ── Judge (token-gated, no login) ──────────────────────
  getByToken: publicProcedure
    .input(z.object({ token: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.query.critiqueDocuments.findFirst({
        where: eq(critiqueDocuments.uploadToken, input.token),
        with: {
          judge: { columns: { id: true, name: true } },
          show: { columns: { id: true, name: true, startDate: true } },
        },
      });
      if (!doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is not valid.' });
      }

      const rows = await loadShowClassRows(ctx.db, doc.showId);
      const assignableOptions = toAssignableList(rows);
      const blocks = doc.parsedJson?.blocks ?? [];

      return {
        status: doc.status,
        hasUpload: doc.rawText !== null,
        show: doc.show,
        judge: doc.judge,
        overviewText: doc.overviewText,
        blocks: enrichBlocks(blocks, assignableOptions),
        assignableOptions,
      };
    }),

  saveBlocksByToken: publicProcedure
    .input(z.object({ token: z.string().uuid(), blocks: z.array(critiqueBlockInputSchema) }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.query.critiqueDocuments.findFirst({
        where: eq(critiqueDocuments.uploadToken, input.token),
      });
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is not valid.' });
      if (doc.status === 'published') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'These critiques have already been published.' });
      }
      if (!doc.parsedJson) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload your critiques first.' });
      }

      const rows = await loadShowClassRows(ctx.db, doc.showId);
      const assignable = toAssignableList(rows);
      const nextBlocks = reconcileBlocks(doc.parsedJson.blocks, input.blocks, assignable, {
        allowResolution: false,
      });

      await ctx.db
        .update(critiqueDocuments)
        .set({ parsedJson: { v: 1, blocks: nextBlocks } })
        .where(eq(critiqueDocuments.id, doc.id));

      return { ok: true as const };
    }),

  submitByToken: publicProcedure
    .input(z.object({ token: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.query.critiqueDocuments.findFirst({
        where: eq(critiqueDocuments.uploadToken, input.token),
        with: {
          judge: { columns: { name: true } },
          show: { columns: { id: true, slug: true, name: true, secretaryEmail: true } },
        },
      });
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is not valid.' });
      if (doc.status === 'published') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'These critiques have already been published.' });
      }
      if (!doc.rawText) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload your critiques before sending them.' });
      }

      const wasAlreadySubmitted = doc.status === 'submitted';

      await ctx.db
        .update(critiqueDocuments)
        .set({ status: 'submitted', submittedAt: new Date() })
        .where(eq(critiqueDocuments.id, doc.id));

      // Best-effort — the judge's submission is already persisted regardless
      // of whether the secretary's notification email goes out.
      if (!wasAlreadySubmitted && doc.show.secretaryEmail) {
        try {
          await sendCritiqueSubmittedEmail({
            secretaryEmail: doc.show.secretaryEmail,
            judgeName: doc.judge.name,
            showName: doc.show.name,
            showIdOrSlug: doc.show.slug ?? doc.show.id,
          });
        } catch (err) {
          console.error('[critiques] Failed to notify secretary of submission:', err);
        }
      }

      return { ok: true as const };
    }),

  // ── Secretary ───────────────────────────────────────────
  listForShow: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: eq(judgeAssignments.showId, input.showId),
        with: { judge: { columns: { id: true, name: true, contactEmail: true } } },
      });

      // Dedup by judge — a multi-breed show can assign the same judge to
      // several breeds/rings, but critiques are one document per judge.
      const judgeById = new Map<string, { id: string; name: string; contactEmail: string | null }>();
      for (const a of assignments) {
        if (a.judge && !judgeById.has(a.judge.id)) judgeById.set(a.judge.id, a.judge);
      }

      const docs = await ctx.db.query.critiqueDocuments.findMany({
        where: eq(critiqueDocuments.showId, input.showId),
      });
      const docByJudge = new Map(docs.map((d) => [d.judgeId, d]));

      return Array.from(judgeById.values()).map((judge) => {
        const doc = docByJudge.get(judge.id);
        return {
          judgeId: judge.id,
          judgeName: judge.name,
          contactEmail: judge.contactEmail,
          document: doc
            ? {
                status: doc.status,
                uploadToken: doc.uploadToken,
                link: `${APP_URL}/critiques/${doc.uploadToken}`,
                invitedEmail: doc.invitedEmail,
                invitedAt: doc.invitedAt,
                hasUpload: doc.rawText !== null,
                submittedAt: doc.submittedAt,
                publishedAt: doc.publishedAt,
              }
            : null,
        };
      });
    }),

  invite: secretaryProcedure
    .input(z.object({ showId: z.string().uuid(), judgeId: z.string().uuid(), email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const [judge, showRow] = await Promise.all([
        ctx.db.query.judges.findFirst({ where: eq(judges.id, input.judgeId), columns: { id: true, name: true } }),
        ctx.db.query.shows.findFirst({
          where: eq(shows.id, input.showId),
          columns: { id: true, name: true, startDate: true },
        }),
      ]);
      if (!judge) throw new TRPCError({ code: 'NOT_FOUND', message: 'Judge not found' });
      if (!showRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });

      const existing = await ctx.db.query.critiqueDocuments.findFirst({
        where: and(eq(critiqueDocuments.showId, input.showId), eq(critiqueDocuments.judgeId, input.judgeId)),
        columns: { status: true },
      });
      if (existing?.status === 'published') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'These critiques are already published — unpublish first if you need to send a new invite.',
        });
      }

      const uploadToken = crypto.randomUUID();

      // Persist BEFORE sending the email — if the email fails, the secretary
      // still has a real link to copy and send another way (WhatsApp etc.).
      const [doc] = await ctx.db
        .insert(critiqueDocuments)
        .values({
          showId: input.showId,
          judgeId: input.judgeId,
          uploadToken,
          status: 'invited',
          invitedEmail: input.email,
          invitedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [critiqueDocuments.showId, critiqueDocuments.judgeId],
          set: {
            uploadToken,
            status: 'invited',
            invitedEmail: input.email,
            invitedAt: new Date(),
            submittedAt: null,
          },
        })
        .returning();

      const link = `${APP_URL}/critiques/${uploadToken}`;

      let emailSent = true;
      try {
        await sendCritiqueInviteEmail({
          judgeName: judge.name,
          email: input.email,
          showName: showRow.name,
          showDate: showRow.startDate,
          link,
        });
      } catch (err) {
        console.error(`[critiques] Failed to send invite email to ${input.email}:`, err);
        emailSent = false;
      }

      return { ...doc!, link, emailSent };
    }),

  getForSecretary: secretaryProcedure
    .input(z.object({ showId: z.string().uuid(), judgeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const doc = await ctx.db.query.critiqueDocuments.findFirst({
        where: and(eq(critiqueDocuments.showId, input.showId), eq(critiqueDocuments.judgeId, input.judgeId)),
        with: {
          judge: { columns: { id: true, name: true, contactEmail: true } },
          show: { columns: { id: true, name: true, startDate: true } },
        },
      });
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'This judge has not been invited yet.' });

      const rows = await loadShowClassRows(ctx.db, input.showId);
      const assignableOptions = toAssignableList(rows);
      const blocks = doc.parsedJson?.blocks ?? [];

      return {
        status: doc.status,
        hasUpload: doc.rawText !== null,
        originalFilename: doc.originalFilename,
        show: doc.show,
        judge: doc.judge,
        overviewText: doc.overviewText,
        blocks: enrichBlocks(blocks, assignableOptions),
        assignableOptions,
        gate: publishGateStatus(blocks),
      };
    }),

  updateBlocks: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        judgeId: z.string().uuid(),
        blocks: z.array(critiqueBlockInputSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const doc = await ctx.db.query.critiqueDocuments.findFirst({
        where: and(eq(critiqueDocuments.showId, input.showId), eq(critiqueDocuments.judgeId, input.judgeId)),
      });
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'This judge has not been invited yet.' });
      if (doc.status === 'published') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unpublish before editing these critiques.' });
      }
      if (!doc.parsedJson) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No critiques uploaded yet.' });
      }

      const rows = await loadShowClassRows(ctx.db, input.showId);
      const assignable = toAssignableList(rows);
      const nextBlocks = reconcileBlocks(doc.parsedJson.blocks, input.blocks, assignable, {
        allowResolution: true,
      });

      await ctx.db
        .update(critiqueDocuments)
        .set({ parsedJson: { v: 1, blocks: nextBlocks } })
        .where(eq(critiqueDocuments.id, doc.id));

      return { ok: true as const, gate: publishGateStatus(nextBlocks) };
    }),

  publish: secretaryProcedure
    .input(z.object({ showId: z.string().uuid(), judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const doc = await ctx.db.query.critiqueDocuments.findFirst({
        where: and(eq(critiqueDocuments.showId, input.showId), eq(critiqueDocuments.judgeId, input.judgeId)),
      });
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'This judge has not been invited yet.' });
      if (doc.status === 'published') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'These critiques are already published.' });
      }
      if (doc.status !== 'submitted') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ask the judge to send their critiques first.' });
      }
      if (!doc.parsedJson) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No critiques uploaded yet.' });
      }

      const blocks = doc.parsedJson.blocks;
      const gate = publishGateStatus(blocks);
      if (!gate.canPublish) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${gate.blockingCount} ${gate.blockingCount === 1 ? 'critique needs' : 'critiques need'} checking before you can publish.`,
        });
      }

      const writable = writableBlocks(blocks);

      // Same upsert shape as steward.recordResult's onConflictDoUpdate, but
      // scoped to critiqueText only — placement/svGrade/etc. are never
      // touched by this feature.
      await Promise.all(
        writable.map((b) =>
          ctx.db
            .insert(results)
            .values({ entryClassId: b.matchedEntryClassId!, critiqueText: b.critiqueText })
            .onConflictDoUpdate({
              target: results.entryClassId,
              set: { critiqueText: b.critiqueText },
            }),
        ),
      );

      const overviewBlock = blocks.find((b) => b.kind === 'overview' && b.include);

      await ctx.db
        .update(critiqueDocuments)
        .set({
          status: 'published',
          overviewText: overviewBlock?.critiqueText || null,
          publishedAt: new Date(),
          publishedBy: ctx.session.user.id,
        })
        .where(eq(critiqueDocuments.id, doc.id));

      return { ok: true as const, published: writable.length };
    }),

  unpublish: secretaryProcedure
    .input(z.object({ showId: z.string().uuid(), judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const doc = await ctx.db.query.critiqueDocuments.findFirst({
        where: and(eq(critiqueDocuments.showId, input.showId), eq(critiqueDocuments.judgeId, input.judgeId)),
      });
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'This judge has not been invited yet.' });
      if (doc.status !== 'published') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'These critiques are not currently published.' });
      }

      const blocks = doc.parsedJson?.blocks ?? [];
      const written = writableBlocks(blocks);

      // Only clear a result's critique_text if it still matches exactly what
      // THIS document published — a steward or secretary may have edited it
      // since via a different path, and that edit must never be clobbered.
      await Promise.all(
        written.map((b) =>
          ctx.db
            .update(results)
            .set({ critiqueText: null })
            .where(and(eq(results.entryClassId, b.matchedEntryClassId!), eq(results.critiqueText, b.critiqueText))),
        ),
      );

      await ctx.db
        .update(critiqueDocuments)
        .set({ status: 'submitted', publishedAt: null, publishedBy: null })
        .where(eq(critiqueDocuments.id, doc.id));

      return { ok: true as const };
    }),
});
