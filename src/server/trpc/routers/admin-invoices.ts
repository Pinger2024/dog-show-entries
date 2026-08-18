import { z } from 'zod';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { adminProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { invoices, organisations, orders, payments } from '@/server/db/schema';
import { computeSettlementItemisation } from '@/server/services/settlement-itemisation';
import { healMissingStripeFees, type StripeFeeHealResult } from '@/server/services/stripe-fee-heal';
import type { Database } from '@/server/db';

/**
 * Admin club-SETTLEMENT generator — replaces the one-off reconciliation
 * scripts Michael used to hand-run per show (e.g. the South Western GSD
 * Club statement, INV-SWGSD-0004). The output IS the settlement statement
 * a secretary uses to reconcile her bank account — it also serves as the
 * invoice, so there is only one document per show, not two.
 *
 * See src/server/db/schema/invoices.ts for the immutability rule: figures
 * here are computed once at `issue` and frozen forever. `preview` never
 * writes; `issue`/`supersede` are the only writes and there is
 * deliberately NO update procedure.
 */

const discountConfigSchema = z.object({
  mode: z.enum(['perTransaction', 'percent', 'fixed']),
  value: z.number().int().min(0),
  label: z.string().min(1).max(200),
});

const issueInputSchema = z.object({
  showId: z.string().uuid(),
  packageFeePence: z.number().int().min(0),
  packageFeeDescription: z.string().min(1).max(500),
  // Remi's discount off Stripe's card fee — an INPUT, not a constant,
  // because the Stripe deal can change and past statements must keep
  // whatever rate applied when they were issued.
  discount: discountConfigSchema.default({ mode: 'perTransaction', value: 20, label: 'Remi discount' }),
  // Only honoured on a club's FIRST-ever issue (its numbering counter is
  // still untouched) — lets us pick up numbering after the hand-issued
  // scripts (e.g. South Western's next real one is 0005, following
  // script-issued 0001–0004 which predate this table).
  startingNumber: z.number().int().min(1).optional(),
});

/** Uppercase alnum, hyphen-collapsed — e.g. "Clyde Valley GSD Club" -> "CLYDE-VALLEY-GSD-CLUB". */
function slugifyClubName(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'CLUB';
}

type SettlementFigures = Awaited<ReturnType<typeof computeSettlementFigures>>;

async function computeSettlementFigures(
  db: Database,
  showId: string,
  input: {
    packageFeePence: number;
    packageFeeDescription: string;
    discount: { mode: 'perTransaction' | 'percent' | 'fixed'; value: number; label: string };
  },
) {
  const showRow = await db.query.shows.findFirst({
    where: (s, { eq: eqFn }) => eqFn(s.id, showId),
    with: { organisation: { columns: { id: true, name: true } } },
  });
  if (!showRow) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
  }
  if (!showRow.organisation) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Show has no club on record' });
  }

  // Self-heal any Stripe fee-capture gap before computing the itemisation
  // (see stripe-fee-heal.ts) — the webhook's live capture is best-effort and
  // can miss, leaving payment rows with NULL feePence that understate card
  // fees on the settlement. Gated behind a cheap EXISTS-style pre-check
  // (indexed columns, LIMIT 1) so a show with complete fee capture — the
  // common case — pays no extra latency viewing its invoice.
  const [gapRow] = await db
    .select({ id: payments.id })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(orders.showId, showId),
        eq(orders.status, 'paid'),
        isNotNull(payments.stripePaymentId),
        isNull(payments.feePence),
      ),
    )
    .limit(1);
  const feeHeal: StripeFeeHealResult | undefined = gapRow ? await healMissingStripeFees(showId) : undefined;

  const settlement = await computeSettlementItemisation(db, showId, {
    packageFeePence: input.packageFeePence,
    packageFeeDescription: input.packageFeeDescription,
    discount: input.discount,
  });

  const freeEntriesCount = settlement.free.lines.reduce((sum, l) => {
    const match = l.sub?.match(/^(\d+)/);
    return sum + (match ? parseInt(match[1]!, 10) : 0);
  }, 0);

  return {
    show: showRow,
    organisation: showRow.organisation,
    settlement,
    freeEntriesCount,
    // Additive — rides along so the UI could later show "fees refreshed
    // just now"; undefined when the pre-check found nothing to heal.
    feeHeal,
  };
}

/**
 * Allocate the next sequence number for `organisationId` and insert the
 * invoice row, inside a caller-supplied transaction. The UPDATE ...
 * RETURNING row-level lock is what makes concurrent `issue` calls for the
 * same club serialize onto distinct, consecutive numbers — no retry loop
 * needed.
 */
async function issueInvoiceRow(
  tx: Parameters<Database['transaction']>[0] extends (tx: infer T) => unknown ? T : never,
  figures: SettlementFigures,
  input: { showId: string; packageFeePence: number; packageFeeDescription: string; startingNumber?: number },
  issuedByUserId: string,
) {
  const clubSlug = slugifyClubName(figures.organisation.name);
  const orgId = figures.organisation.id;
  const { settlement } = figures;

  let sequenceNumber: number;
  if (input.startingNumber != null) {
    // Only takes effect while the club's counter is still at the untouched
    // default of 1 — i.e. this really is the club's first issue through
    // this table. A concurrent/second issue falls through to the normal
    // increment below.
    const [claimed] = await tx
      .update(organisations)
      .set({ nextInvoiceSequence: input.startingNumber + 1 })
      .where(and(eq(organisations.id, orgId), eq(organisations.nextInvoiceSequence, 1)))
      .returning({ nextInvoiceSequence: organisations.nextInvoiceSequence });
    if (claimed) {
      sequenceNumber = input.startingNumber;
    } else {
      const [orgRow] = await tx
        .update(organisations)
        .set({ nextInvoiceSequence: sql`${organisations.nextInvoiceSequence} + 1` })
        .where(eq(organisations.id, orgId))
        .returning({ nextInvoiceSequence: organisations.nextInvoiceSequence });
      if (!orgRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' });
      sequenceNumber = orgRow.nextInvoiceSequence - 1;
    }
  } else {
    const [orgRow] = await tx
      .update(organisations)
      .set({ nextInvoiceSequence: sql`${organisations.nextInvoiceSequence} + 1` })
      .where(eq(organisations.id, orgId))
      .returning({ nextInvoiceSequence: organisations.nextInvoiceSequence });
    if (!orgRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' });
    // The counter holds the NEXT number to hand out — the value returned is
    // already post-increment, so this invoice takes the value one below it.
    sequenceNumber = orgRow.nextInvoiceSequence - 1;
  }

  const invoiceNumber = `INV-${clubSlug}-${String(sequenceNumber).padStart(4, '0')}`;

  const [inserted] = await tx
    .insert(invoices)
    .values({
      organisationId: orgId,
      showId: input.showId,
      invoiceNumber,
      clubSlug,
      sequenceNumber,
      viaRemiTotalPence: settlement.viaRemi.totalPence,
      directTotalPence: settlement.direct.totalPence,
      freeEntriesCount: figures.freeEntriesCount,
      cardFeeTotalPence: settlement.cardFeeTotalPence,
      feeBearingChargeCount: settlement.feeBearingChargeCount,
      discountMode: settlement.discountMode,
      discountValue: settlement.discountValue,
      discountLabel: settlement.discountLabel,
      discountTotalPence: settlement.discountAmountPence,
      packageFeePence: input.packageFeePence,
      packageFeeDescription: input.packageFeeDescription,
      costsTotalPence: settlement.costs.totalPence,
      netToClubPence: settlement.netToClubPence,
      captureGapCount: settlement.captureGapCount,
      lineItems: {
        viaRemi: settlement.viaRemi,
        direct: settlement.direct,
        free: settlement.free,
        totalEntriesLine: settlement.totalEntriesLine,
        costs: settlement.costs,
      },
      issuedByUserId,
    })
    .returning();
  if (!inserted) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Invoice insert failed' });
  return inserted;
}

export const adminInvoicesRouter = createTRPCRouter({
  /** Computed figures, no write — drives the preview step of the generate flow. */
  preview: adminProcedure.input(issueInputSchema).query(async ({ ctx, input }) => {
    return computeSettlementFigures(ctx.db, input.showId, input);
  }),

  issue: adminProcedure.input(issueInputSchema).mutation(async ({ ctx, input }) => {
    const figures = await computeSettlementFigures(ctx.db, input.showId, input);
    return ctx.db.transaction((tx) => issueInvoiceRow(tx, figures, input, ctx.session.user.id));
  }),

  list: adminProcedure
    .input(z.object({ organisationId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.invoices.findMany({
        where: input?.organisationId ? eq(invoices.organisationId, input.organisationId) : undefined,
        with: {
          organisation: { columns: { id: true, name: true } },
          show: { columns: { id: true, name: true } },
        },
        orderBy: [desc(invoices.issuedAt)],
      });
    }),

  get: adminProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const row = await ctx.db.query.invoices.findFirst({
      where: eq(invoices.id, input.id),
      with: {
        organisation: { columns: { id: true, name: true } },
        show: true,
        issuedBy: { columns: { id: true, name: true } },
      },
    });
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
    return row;
  }),

  /**
   * A correction. Issues a fresh invoice from the CURRENT figures/inputs
   * and links the old one to it via `supersededById`, in one transaction.
   * There is no update procedure — this is the only way an invoice's
   * numbers can be revised after the fact, and the old row's own figures
   * never change.
   */
  supersede: adminProcedure
    .input(issueInputSchema.extend({ oldId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const old = await ctx.db.query.invoices.findFirst({ where: eq(invoices.id, input.oldId) });
      if (!old) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      if (old.supersededById) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invoice has already been superseded' });
      }

      const figures = await computeSettlementFigures(ctx.db, input.showId, input);

      return ctx.db.transaction(async (tx) => {
        const replacement = await issueInvoiceRow(tx, figures, input, ctx.session.user.id);
        await tx
          .update(invoices)
          .set({ supersededById: replacement.id })
          .where(eq(invoices.id, input.oldId));
        return replacement;
      });
    }),
});
