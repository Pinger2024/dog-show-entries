import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { adminProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { invoices, organisations, orders, payments } from '@/server/db/schema';
import type { InvoiceLineItem } from '@/server/db/schema';
import { computeShowMetrics } from '@/server/services/show-metrics';
import { formatCurrency } from '@/lib/date-utils';
import type { Database } from '@/server/db';

/**
 * Admin club-invoice generator — replaces the one-off reconciliation
 * scripts Michael used to hand-run per show. See src/server/db/schema/invoices.ts
 * for the immutability rule: figures here are computed once at `issue` and
 * frozen forever. `preview` never writes; `issue`/`supersede` are the only
 * writes and there is deliberately NO update procedure.
 */

const issueInputSchema = z.object({
  showId: z.string().uuid(),
  packageFeePence: z.number().int().min(0),
  packageFeeDescription: z.string().min(1).max(500),
  // Remi's per-transaction discount off Stripe's card fee — an INPUT, not a
  // constant, because the Stripe deal can change and past invoices must
  // keep whatever rate applied when they were issued.
  perTransactionDiscountPence: z.number().int().min(0).max(1000).default(20),
});

/** Uppercase alnum, hyphen-collapsed — e.g. "Clyde Valley GSD Club" -> "CLYDE-VALLEY-GSD-CLUB". */
function slugifyClubName(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'CLUB';
}

type InvoiceFigures = Awaited<ReturnType<typeof computeInvoiceFigures>>;

async function computeInvoiceFigures(
  db: Database,
  showId: string,
  input: {
    packageFeePence: number;
    packageFeeDescription: string;
    perTransactionDiscountPence: number;
  },
) {
  const showRow = await db.query.shows.findFirst({
    where: (s, { eq: eqFn }) => eqFn(s.id, showId),
    with: { organisation: true },
  });
  if (!showRow) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
  }
  if (!showRow.organisation) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Show has no club on record' });
  }

  const metrics = await computeShowMetrics(db, showId);

  // Real Stripe fees for this show — joined via orders.showId since
  // payments carries no showId of its own. Refunded rows are excluded
  // entirely; partially_refunded rows keep their fee (Stripe never returns
  // the processing fee on a partial refund). Rows still missing captured
  // fee data (succeeded/partially_refunded with fee_pence NULL) are
  // counted separately as the capture gap — never silently folded into
  // the total.
  const [feeRow] = await db
    .select({
      feeTotal: sql<number>`COALESCE(SUM(${payments.feePence}), 0)::int`,
      feeCount: sql<number>`COUNT(*) FILTER (WHERE ${payments.feePence} IS NOT NULL)::int`,
      captureGap: sql<number>`COUNT(*) FILTER (WHERE ${payments.feePence} IS NULL AND ${payments.status} IN ('succeeded', 'partially_refunded'))::int`,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(and(eq(orders.showId, showId), sql`${payments.status} != 'refunded'`));

  const cardFeeTotalPence = feeRow?.feeTotal ?? 0;
  const feeBearingChargeCount = feeRow?.feeCount ?? 0;
  const captureGapCount = feeRow?.captureGap ?? 0;

  const discountTotalPence = feeBearingChargeCount * input.perTransactionDiscountPence;
  const cardFeeDueTotalPence = Math.max(0, cardFeeTotalPence - discountTotalPence);
  const totalFeeDuePence = cardFeeDueTotalPence + input.packageFeePence;

  const lineItems: InvoiceLineItem[] = [
    { label: 'Income collected by us', amountPence: metrics.clubReceivablePence },
    { label: 'Income paid direct to bank', amountPence: metrics.offlineCollectedPence },
    { label: 'Total income', amountPence: metrics.totalClubRevenuePence, isTotal: true },
    {
      label: 'Card processing fee total',
      amountPence: cardFeeTotalPence,
      sub: `${feeBearingChargeCount} card payment${feeBearingChargeCount === 1 ? '' : 's'}`,
    },
    {
      label: 'Remi discount',
      amountPence: -discountTotalPence,
      isCredit: true,
      sub: `${formatCurrency(input.perTransactionDiscountPence)} × ${feeBearingChargeCount}`,
    },
    { label: 'Total card processing fee due', amountPence: cardFeeDueTotalPence, isTotal: true },
    { label: input.packageFeeDescription, amountPence: input.packageFeePence },
    { label: 'TOTAL FEE DUE', amountPence: totalFeeDuePence, isTotal: true },
  ];

  return {
    show: showRow,
    organisation: showRow.organisation,
    incomeCollectedByUsPence: metrics.clubReceivablePence,
    incomePaidDirectPence: metrics.offlineCollectedPence,
    totalIncomePence: metrics.totalClubRevenuePence,
    cardFeeTotalPence,
    feeBearingChargeCount,
    perTransactionDiscountPence: input.perTransactionDiscountPence,
    discountTotalPence,
    cardFeeDueTotalPence,
    packageFeePence: input.packageFeePence,
    packageFeeDescription: input.packageFeeDescription,
    totalFeeDuePence,
    captureGapCount,
    lineItems,
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
  figures: InvoiceFigures,
  input: { showId: string },
  issuedByUserId: string,
) {
  const clubSlug = slugifyClubName(figures.organisation.name);

  const [orgRow] = await tx
    .update(organisations)
    .set({ nextInvoiceSequence: sql`${organisations.nextInvoiceSequence} + 1` })
    .where(eq(organisations.id, figures.organisation.id))
    .returning({ nextInvoiceSequence: organisations.nextInvoiceSequence });
  if (!orgRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Club not found' });

  // The counter holds the NEXT number to hand out — the value returned is
  // already post-increment, so this invoice takes the value one below it.
  const sequenceNumber = orgRow.nextInvoiceSequence - 1;
  const invoiceNumber = `INV-${clubSlug}-${String(sequenceNumber).padStart(4, '0')}`;

  const [inserted] = await tx
    .insert(invoices)
    .values({
      organisationId: figures.organisation.id,
      showId: input.showId,
      invoiceNumber,
      clubSlug,
      sequenceNumber,
      incomeCollectedByUsPence: figures.incomeCollectedByUsPence,
      incomePaidDirectPence: figures.incomePaidDirectPence,
      totalIncomePence: figures.totalIncomePence,
      cardFeeTotalPence: figures.cardFeeTotalPence,
      feeBearingChargeCount: figures.feeBearingChargeCount,
      perTransactionDiscountPence: figures.perTransactionDiscountPence,
      discountTotalPence: figures.discountTotalPence,
      cardFeeDueTotalPence: figures.cardFeeDueTotalPence,
      packageFeePence: figures.packageFeePence,
      packageFeeDescription: figures.packageFeeDescription,
      totalFeeDuePence: figures.totalFeeDuePence,
      captureGapCount: figures.captureGapCount,
      lineItems: figures.lineItems,
      issuedByUserId,
    })
    .returning();
  if (!inserted) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Invoice insert failed' });
  return inserted;
}

export const adminInvoicesRouter = createTRPCRouter({
  /** Computed figures, no write — drives the preview step of the generate flow. */
  preview: adminProcedure.input(issueInputSchema).query(async ({ ctx, input }) => {
    return computeInvoiceFigures(ctx.db, input.showId, input);
  }),

  issue: adminProcedure.input(issueInputSchema).mutation(async ({ ctx, input }) => {
    const figures = await computeInvoiceFigures(ctx.db, input.showId, input);
    return ctx.db.transaction((tx) =>
      issueInvoiceRow(tx, figures, input, ctx.session.user.id),
    );
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
        organisation: true,
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

      const figures = await computeInvoiceFigures(ctx.db, input.showId, input);

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
