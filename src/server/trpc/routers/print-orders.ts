import { z } from 'zod';
import { and, eq, desc, sql, inArray, notInArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter } from '../init';
import { secretaryProcedure } from '../procedures';
import { verifyShowAccess } from '../verify-show-access';
import {
  printOrders,
  printOrderItems,
  showClasses,
  rings,
} from '@/server/db/schema';
import {
  getProductByType,
  getPackageTier,
  calculatePrintOrderFee,
  PRINT_PACKAGE_TIERS,
  PRINT_PAYMENT_METHODS,
  CANCELLABLE_STATUSES,
  PENDING_STATUSES,
  type ShowStats,
} from '@/lib/print-products';
import { formatCurrency } from '@/lib/date-utils';
import { getOrderStatus } from '@/server/services/mixam';
import { sendPrintOrderDispatchEmail, sendPrintOrderAdminNotificationEmail, sendPrintOrderConfirmationEmail } from '@/server/services/email';
import { createPaymentIntent } from '@/server/services/stripe';
import { generateAndUploadForPrint } from '@/server/services/pdf-generation';
import { computeShowMetrics } from '@/server/services/show-metrics';

// ── Tradeprint status mapping ──

type PrintOrderStatus = 'submitted' | 'in_production' | 'dispatched' | 'delivered';

const TRADEPRINT_STATUS_MAP: Record<string, PrintOrderStatus> = {
  received: 'submitted',
  'in production': 'in_production',
  printing: 'in_production',
  dispatched: 'dispatched',
  delivered: 'delivered',
};

/** Apply a Tradeprint status update to a local order, sending dispatch email on transition */
async function applyTradeprintStatus(
  database: typeof import('@/server/db').db,
  order: { id: string; status: string; trackingNumber: string | null; trackingUrl: string | null; estimatedDeliveryDate: string | Date | null },
  tpStatus: { status: string; trackingNumber?: string | null; trackingUrl?: string | null; estimatedDeliveryDate?: string | Date | null },
): Promise<{ newStatus: string; changed: boolean }> {
  const newStatus = TRADEPRINT_STATUS_MAP[tpStatus.status] ?? order.status;
  const changed = newStatus !== order.status;

  if (changed) {
    await database
      .update(printOrders)
      .set({
        status: newStatus,
        tradeprintStatus: tpStatus.status,
        trackingNumber: tpStatus.trackingNumber ?? order.trackingNumber,
        trackingUrl: tpStatus.trackingUrl ?? order.trackingUrl,
        estimatedDeliveryDate: tpStatus.estimatedDeliveryDate ?? order.estimatedDeliveryDate,
      })
      .where(eq(printOrders.id, order.id));

    if (newStatus === 'dispatched') {
      sendPrintOrderDispatchEmail(order.id).catch((err) =>
        console.error('[print-orders] Dispatch email failed:', err)
      );
    }
  }

  return { newStatus, changed };
}

export const printOrdersRouter = createTRPCRouter({
  /** Get package options for a show (tier, quantities, prices) */
  getPackageOptions: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });
      const stats = await getShowStatsForPrinting(ctx.db, input.showId);
      const tier = getPackageTier(stats.confirmedEntries);
      return {
        confirmedEntries: stats.confirmedEntries,
        tier,
        tooLarge: tier === null,
      };
    }),

  /** Create a draft package order (catalogue + prize cards) */
  createPackageOrder: secretaryProcedure
    .input(z.object({
      showId: z.string().uuid(),
      catalogueQty: z.number().int().positive(),
      deliveryName: z.string().min(1),
      deliveryAddress1: z.string().min(1),
      deliveryAddress2: z.string().optional(),
      deliveryTown: z.string().min(1),
      deliveryPostcode: z.string().min(3),
      deliveryPhone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const show = await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });
      const stats = await getShowStatsForPrinting(ctx.db, input.showId);
      const tier = getPackageTier(stats.confirmedEntries);

      if (!tier) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Your show is too large for package pricing. Please contact us.',
        });
      }

      const option = tier.options.find((o) => o.catalogueQty === input.catalogueQty);
      if (!option) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${input.catalogueQty} catalogues is not a valid option for your show size.`,
        });
      }

      const fee = calculatePrintOrderFee(option.pricePence);
      const totalAmount = option.pricePence + fee;
      const catalogueProduct = getProductByType('catalogue');
      const prizeCardsProduct = getProductByType('prize_cards');

      const [order] = await ctx.db
        .insert(printOrders)
        .values({
          showId: input.showId,
          orderedByUserId: ctx.session.user.id,
          organisationId: show.organisationId,
          status: 'draft',
          subtotalAmount: option.pricePence,
          markupAmount: 0,
          totalAmount,
          serviceLevel: 'standard',
          deliveryName: input.deliveryName,
          deliveryAddress1: input.deliveryAddress1,
          deliveryAddress2: input.deliveryAddress2 ?? null,
          deliveryTown: input.deliveryTown,
          deliveryPostcode: input.deliveryPostcode,
          deliveryPhone: input.deliveryPhone ?? null,
        })
        .returning();

      await ctx.db.insert(printOrderItems).values([
        {
          printOrderId: order.id,
          documentType: 'catalogue',
          documentLabel: catalogueProduct?.label ?? 'Catalogues',
          tradeprintProductId: catalogueProduct?.tradeprintProductId ?? '',
          quantity: input.catalogueQty,
          printSpecs: catalogueProduct?.defaultSpecs ?? null,
          unitTradeCost: 0,
          unitSellingPrice: Math.round(option.pricePence / input.catalogueQty),
          lineTotal: option.pricePence,
        },
        {
          printOrderId: order.id,
          documentType: 'prize_cards',
          documentLabel: prizeCardsProduct?.label ?? 'Prize Cards',
          tradeprintProductId: prizeCardsProduct?.tradeprintProductId ?? '',
          quantity: 1,
          printSpecs: prizeCardsProduct?.defaultSpecs ?? null,
          unitTradeCost: 0,
          unitSellingPrice: 0,
          lineTotal: 0,
        },
      ]);

      return { orderId: order.id };
    }),

  /** Initiate payment — generates PDFs, uploads to R2, creates Stripe PaymentIntent */
  initiatePayment: secretaryProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.printOrders.findFirst({
        where: eq(printOrders.id, input.orderId),
        with: { items: true },
      });

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      await verifyShowAccess(ctx.db, ctx.session.user.id, order.showId, { callerIsAdmin: ctx.callerIsAdmin });

      if (order.status !== 'draft') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Order is not in draft status',
        });
      }

      // Generate all PDFs in parallel and upload to R2
      const pdfResults = await Promise.all(
        order.items.map(async (item) => {
          try {
            const { storageKey, publicUrl } = await generateAndUploadForPrint(
              order.showId,
              item.documentType,
              item.documentFormat ?? undefined
            );
            return { itemId: item.id, storageKey, publicUrl };
          } catch (err) {
            console.error(`[print-orders] PDF generation failed for ${item.documentType}:`, err);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to generate ${item.documentLabel} PDF`,
            });
          }
        })
      );

      await Promise.all(
        pdfResults.map((r) =>
          ctx.db
            .update(printOrderItems)
            .set({
              pdfStorageKey: r.storageKey,
              pdfPublicUrl: r.publicUrl,
              pdfGeneratedAt: new Date(),
            })
            .where(eq(printOrderItems.id, r.itemId))
        )
      );

      // Create Stripe PaymentIntent
      const paymentIntent = await createPaymentIntent(order.totalAmount, {
        type: 'print_order',
        printOrderId: order.id,
        showId: order.showId,
      });

      // Update order status
      await ctx.db
        .update(printOrders)
        .set({
          status: 'awaiting_payment',
          stripePaymentIntentId: paymentIntent.id,
        })
        .where(eq(printOrders.id, order.id));

      if (!paymentIntent.client_secret) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create payment session' });
      }
      return { clientSecret: paymentIntent.client_secret };
    }),

  /** Get a single order by ID */
  getById: secretaryProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.printOrders.findFirst({
        where: eq(printOrders.id, input.orderId),
        with: {
          items: true,
          orderedBy: { columns: { id: true, name: true, email: true } },
          show: { columns: { id: true, name: true } },
        },
      });

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      await verifyShowAccess(ctx.db, ctx.session.user.id, order.showId, { callerIsAdmin: ctx.callerIsAdmin });
      return order;
    }),

  /** List all print orders for a show */
  listByShow: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      return ctx.db.query.printOrders.findMany({
        where: eq(printOrders.showId, input.showId),
        with: {
          items: true,
          orderedBy: { columns: { id: true, name: true } },
        },
        orderBy: [desc(printOrders.createdAt)],
      });
    }),

  /** Cancel a draft/awaiting_payment order */
  cancelOrder: secretaryProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.printOrders.findFirst({
        where: eq(printOrders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      await verifyShowAccess(ctx.db, ctx.session.user.id, order.showId, { callerIsAdmin: ctx.callerIsAdmin });

      if (!CANCELLABLE_STATUSES.includes(order.status as typeof CANCELLABLE_STATUSES[number])) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only draft or awaiting payment orders can be cancelled',
        });
      }

      await ctx.db
        .update(printOrders)
        .set({ status: 'cancelled' })
        .where(eq(printOrders.id, order.id));

      return { success: true };
    }),

  /** Return the balance available for payout-deduction payment */
  getDeductionBalance: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });
      return computeDeductionBalance(ctx.db, input.showId);
    }),

  /** Pay a draft order by deducting from the show's entry income payout */
  completeByDeduction: secretaryProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.printOrders.findFirst({
        where: eq(printOrders.id, input.orderId),
        with: { items: true },
      });
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      await verifyShowAccess(ctx.db, ctx.session.user.id, order.showId, { callerIsAdmin: ctx.callerIsAdmin });
      if (order.status !== 'draft') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Order is not in draft status' });
      }

      // Check balance before generating PDFs to avoid wasted R2 writes
      const { availablePence } = await computeDeductionBalance(ctx.db, order.showId);
      if (availablePence < order.totalAmount) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Insufficient balance. ${formatCurrency(availablePence)} available, ${formatCurrency(order.totalAmount)} needed.`,
        });
      }

      // Generate PDFs and upload to R2
      const pdfResults = await Promise.all(
        order.items.map(async (item) => {
          try {
            const { storageKey, publicUrl } = await generateAndUploadForPrint(
              order.showId,
              item.documentType,
              item.documentFormat ?? undefined
            );
            return { itemId: item.id, storageKey, publicUrl };
          } catch (err) {
            console.error(`[deduction] PDF generation failed for ${item.documentType}:`, err);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to generate ${item.documentLabel} PDF`,
            });
          }
        })
      );

      await Promise.all(
        pdfResults.map((r) =>
          ctx.db
            .update(printOrderItems)
            .set({ pdfStorageKey: r.storageKey, pdfPublicUrl: r.publicUrl, pdfGeneratedAt: new Date() })
            .where(eq(printOrderItems.id, r.itemId))
        )
      );

      await ctx.db
        .update(printOrders)
        .set({ status: 'paid', paymentMethod: PRINT_PAYMENT_METHODS.DEDUCTED_FROM_PAYOUT })
        .where(eq(printOrders.id, order.id));

      Promise.all([
        sendPrintOrderAdminNotificationEmail(order.id),
        sendPrintOrderConfirmationEmail(order.id),
      ]).catch((err) => console.error('[deduction] Email failed:', err));

      return { success: true };
    }),

  /** Refresh status from Tradeprint */
  refreshStatus: secretaryProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.printOrders.findFirst({
        where: eq(printOrders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      await verifyShowAccess(ctx.db, ctx.session.user.id, order.showId, { callerIsAdmin: ctx.callerIsAdmin });

      if (!order.tradeprintOrderRef) {
        return { status: order.status, message: 'Order not yet submitted to Tradeprint' };
      }

      const tpStatus = await getOrderStatus(order.tradeprintOrderRef);

      if (!tpStatus) {
        return { status: order.status, message: 'Could not retrieve status from Tradeprint' };
      }

      const { newStatus } = await applyTradeprintStatus(ctx.db, order, tpStatus);

      return { status: newStatus, tradeprintStatus: tpStatus.status };
    }),

  /** Refresh status for all pending print orders for a show */
  refreshAllPendingOrders: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Find all orders that are in-flight (submitted or in production)
      const pendingOrders = await ctx.db.query.printOrders.findMany({
        where: and(
          eq(printOrders.showId, input.showId),
          inArray(printOrders.status, [...PENDING_STATUSES])
        ),
      });

      if (pendingOrders.length === 0) {
        return { updated: 0, results: [] };
      }

      const results = await Promise.all(
        pendingOrders.map(async (order) => {
          if (!order.tradeprintOrderRef) {
            return { orderId: order.id, status: order.status, changed: false };
          }

          const tpStatus = await getOrderStatus(order.tradeprintOrderRef);
          if (!tpStatus) {
            console.warn(`[print-orders] Could not fetch status for order ${order.id} (ref: ${order.tradeprintOrderRef})`);
            return { orderId: order.id, status: order.status, changed: false };
          }

          const { newStatus, changed } = await applyTradeprintStatus(ctx.db, order, tpStatus);

          return { orderId: order.id, status: newStatus, changed };
        })
      );

      return {
        updated: results.filter((r) => r.changed).length,
        results,
      };
    }),
});

// ── Helpers ──

async function getShowStatsForPrinting(
  db: Parameters<typeof verifyShowAccess>[0],
  showId: string
): Promise<ShowStats> {
  // catalogueOrders comes from the show-metrics service — catalogues
  // are sold as sundry items now, not via the legacy
  // entries.catalogue_requested flag (which is dead — every checkout
  // hardcodes false). This used to count entries with that flag set,
  // which silently always returned 0 and made the Print Shop suggest
  // "0 catalogues" no matter how many were actually sold.
  const [metrics, classCount, ringCount] = await Promise.all([
    computeShowMetrics(db, showId),
    db
      .select({ count: sql<number>`count(*)` })
      .from(showClasses)
      .where(eq(showClasses.showId, showId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(rings)
      .where(eq(rings.showId, showId)),
  ]);

  return {
    confirmedEntries: metrics.confirmedEntryCount,
    totalClasses: Number(classCount[0]?.count ?? 0),
    catalogueOrders: metrics.paidPrintedCatalogueCount,
    ringCount: Number(ringCount[0]?.count ?? 0),
    placementsPerClass: 4,
  };
}

async function computeDeductionBalance(
  db: Parameters<typeof verifyShowAccess>[0],
  showId: string
) {
  const [metrics, [row]] = await Promise.all([
    computeShowMetrics(db, showId),
    db
      .select({ total: sql<string>`coalesce(sum(total_amount), '0')` })
      .from(printOrders)
      .where(and(
        eq(printOrders.showId, showId),
        eq(printOrders.paymentMethod, PRINT_PAYMENT_METHODS.DEDUCTED_FROM_PAYOUT),
        notInArray(printOrders.status, ['cancelled', 'failed']),
      )),
  ]);
  const alreadyDeductedPence = Number(row?.total ?? 0);
  return {
    clubReceivablePence: metrics.clubReceivablePence,
    alreadyDeductedPence,
    availablePence: metrics.clubReceivablePence - alreadyDeductedPence,
  };
}
