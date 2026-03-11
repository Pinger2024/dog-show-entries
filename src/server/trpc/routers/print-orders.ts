import { z } from 'zod';
import { and, eq, desc, sql, isNull, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter } from '../init';
import { secretaryProcedure } from '../procedures';
import { verifyShowAccess } from '../verify-show-access';
import {
  printOrders,
  printOrderItems,
  entries,
  showClasses,
  rings,
  entryClasses,
} from '@/server/db/schema';
import {
  getPrintableProducts,
  getProductByType,
  calculateSellingPrice,
  CANCELLABLE_STATUSES,
  formatOrderRef,
  type ShowStats,
} from '@/lib/print-products';
import {
  getTradePrice,
  getAvailableQuantities,
  getDeliveryEstimate,
  getOrderStatus,
} from '@/server/services/tradeprint';
import { createPaymentIntent } from '@/server/services/stripe';
import { generateAndUploadForPrint } from '@/server/services/pdf-generation';

export const printOrdersRouter = createTRPCRouter({
  /** Get available products with quantity suggestions for a show */
  getAvailableProducts: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      // Get show stats for quantity suggestions
      const stats = await getShowStatsForPrinting(ctx.db, input.showId);
      const products = getPrintableProducts();

      const available = await Promise.all(
        products.map(async (product) => {
          try {
            const quantities = await getAvailableQuantities(
              product.tradeprintProductId,
              product.defaultSpecs
            );
            if (quantities.length === 0) return null;

            const suggestedQty = product.suggestQuantity(stats);
            // Find closest available quantity >= suggested
            const bestQty = quantities.find((q) => q >= suggestedQty) ?? quantities[quantities.length - 1];

            return {
              documentType: product.documentType,
              label: product.label,
              description: product.description,
              suggestedQuantity: bestQty,
              availableQuantities: quantities,
              tradeprintProductId: product.tradeprintProductId,
            };
          } catch {
            // Product not available from Tradeprint — hide it
            return null;
          }
        })
      );

      return available.filter(Boolean);
    }),

  /** Get a quote for selected items */
  getQuote: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        items: z.array(
          z.object({
            documentType: z.string(),
            documentFormat: z.string().optional(),
            quantity: z.number().int().positive(),
          })
        ),
        serviceLevel: z.enum(['saver', 'standard', 'express']).default('standard'),
        postcode: z.string().min(3),
      })
    )
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      // Fetch prices and delivery estimate in parallel
      const firstProduct = getProductByType(input.items[0].documentType);

      const [quotedItems, deliveryEst] = await Promise.all([
        Promise.all(
          input.items.map(async (item) => {
            const product = getProductByType(item.documentType);
            if (!product || product.downloadOnly) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Product not available: ${item.documentType}`,
              });
            }

            const tradeCost = await getTradePrice(
              product.tradeprintProductName,
              product.defaultSpecs,
              item.quantity,
              input.serviceLevel
            );

            if (tradeCost === null) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Quantity ${item.quantity} not available for ${product.label}. Try a different quantity.`,
              });
            }

            const sellingPrice = calculateSellingPrice(tradeCost);
            const lineTotal = sellingPrice * item.quantity;

            return {
              documentType: item.documentType,
              documentFormat: item.documentFormat,
              label: product.label,
              quantity: item.quantity,
              unitTradeCost: tradeCost,
              unitSellingPrice: sellingPrice,
              lineTotal,
              tradeprintProductId: product.tradeprintProductId,
              printSpecs: product.defaultSpecs,
            };
          })
        ),
        firstProduct
          ? getDeliveryEstimate(
              firstProduct.tradeprintProductId,
              input.serviceLevel,
              input.items[0].quantity,
              firstProduct.defaultSpecs,
              input.postcode
            )
          : null,
      ]);

      const subtotal = quotedItems.reduce((sum, item) => sum + item.lineTotal, 0);

      return {
        items: quotedItems,
        subtotal,
        total: subtotal,
        deliveryEstimate: deliveryEst?.formattedDate ?? null,
        serviceLevel: input.serviceLevel,
      };
    }),

  /** Create a draft print order */
  createDraftOrder: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        items: z.array(
          z.object({
            documentType: z.string(),
            documentFormat: z.string().optional(),
            documentLabel: z.string(),
            quantity: z.number().int().positive(),
            unitTradeCost: z.number().int(),
            unitSellingPrice: z.number().int(),
            lineTotal: z.number().int(),
            tradeprintProductId: z.string(),
            printSpecs: z.record(z.string()).optional(),
          })
        ),
        serviceLevel: z.enum(['saver', 'standard', 'express']).default('standard'),
        deliveryName: z.string().min(1),
        deliveryAddress1: z.string().min(1),
        deliveryAddress2: z.string().optional(),
        deliveryTown: z.string().min(1),
        deliveryPostcode: z.string().min(3),
        deliveryPhone: z.string().optional(),
        estimatedDeliveryDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const show = await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      const subtotal = input.items.reduce((sum, item) => sum + item.lineTotal, 0);
      const tradeCostTotal = input.items.reduce(
        (sum, item) => sum + item.unitTradeCost * item.quantity,
        0
      );
      const markupAmount = subtotal - Math.round(tradeCostTotal * 1.2);

      const [order] = await ctx.db
        .insert(printOrders)
        .values({
          showId: input.showId,
          orderedByUserId: ctx.session.user.id,
          organisationId: show.organisationId,
          status: 'draft',
          subtotalAmount: subtotal,
          markupAmount,
          totalAmount: subtotal,
          serviceLevel: input.serviceLevel,
          deliveryName: input.deliveryName,
          deliveryAddress1: input.deliveryAddress1,
          deliveryAddress2: input.deliveryAddress2 ?? null,
          deliveryTown: input.deliveryTown,
          deliveryPostcode: input.deliveryPostcode,
          deliveryPhone: input.deliveryPhone ?? null,
          estimatedDeliveryDate: input.estimatedDeliveryDate ?? null,
        })
        .returning();

      await ctx.db.insert(printOrderItems).values(
        input.items.map((item) => ({
          printOrderId: order.id,
          documentType: item.documentType,
          documentFormat: item.documentFormat ?? null,
          documentLabel: item.documentLabel,
          tradeprintProductId: item.tradeprintProductId,
          quantity: item.quantity,
          printSpecs: item.printSpecs ?? null,
          unitTradeCost: item.unitTradeCost,
          unitSellingPrice: item.unitSellingPrice,
          lineTotal: item.lineTotal,
        }))
      );

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

      await verifyShowAccess(ctx.db, ctx.session.user.id, order.showId);

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

      await verifyShowAccess(ctx.db, ctx.session.user.id, order.showId);
      return order;
    }),

  /** List all print orders for a show */
  listByShow: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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

      await verifyShowAccess(ctx.db, ctx.session.user.id, order.showId);

      if (!(CANCELLABLE_STATUSES as readonly string[]).includes(order.status)) {
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

      await verifyShowAccess(ctx.db, ctx.session.user.id, order.showId);

      if (!order.tradeprintOrderRef) {
        return { status: order.status, message: 'Order not yet submitted to Tradeprint' };
      }

      const tpStatus = await getOrderStatus(order.tradeprintOrderRef);

      if (!tpStatus) {
        return { status: order.status, message: 'Could not retrieve status from Tradeprint' };
      }

      // Map Tradeprint status to our enum
      type PrintOrderStatus = 'submitted' | 'in_production' | 'dispatched' | 'delivered';
      const statusMap: Record<string, PrintOrderStatus> = {
        received: 'submitted',
        'in production': 'in_production',
        printing: 'in_production',
        dispatched: 'dispatched',
        delivered: 'delivered',
      };

      const newStatus = statusMap[tpStatus.status] ?? order.status;

      await ctx.db
        .update(printOrders)
        .set({
          status: newStatus,
          tradeprintStatus: tpStatus.status,
          trackingNumber: tpStatus.trackingNumber ?? order.trackingNumber,
          trackingUrl: tpStatus.trackingUrl ?? order.trackingUrl,
          estimatedDeliveryDate: tpStatus.estimatedDeliveryDate ?? order.estimatedDeliveryDate,
        })
        .where(eq(printOrders.id, order.id));

      return { status: newStatus, tradeprintStatus: tpStatus.status };
    }),
});

// ── Helpers ──

async function getShowStatsForPrinting(
  db: Parameters<typeof verifyShowAccess>[0],
  showId: string
): Promise<ShowStats> {
  // Run independent queries in parallel; combine both entries counts into one query
  const [entryStats, classCount, ringCount] = await Promise.all([
    db
      .select({
        confirmed: sql<number>`count(*)`,
        catalogueOrders: sql<number>`count(*) filter (where ${entries.catalogueRequested} = true)`,
      })
      .from(entries)
      .where(
        and(
          eq(entries.showId, showId),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        )
      ),
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
    confirmedEntries: Number(entryStats[0]?.confirmed ?? 0),
    totalClasses: Number(classCount[0]?.count ?? 0),
    catalogueOrders: Number(entryStats[0]?.catalogueOrders ?? 0),
    ringCount: Number(ringCount[0]?.count ?? 0),
    placementsPerClass: 4,
  };
}
