import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, inArray, desc, sql, asc } from 'drizzle-orm';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import {
  orders,
  entries,
  entryClasses,
  dogs,
  shows,
  showClasses,
  payments,
  juniorHandlerDetails,
  entryAuditLog,
  sundryItems,
  orderSundryItems,
} from '@/server/db/schema';
import { createPaymentIntent } from '@/server/services/stripe';

const cartEntrySchema = z.object({
  entryType: z.enum(['standard', 'junior_handler']).default('standard'),
  dogId: z.string().uuid().optional(),
  classIds: z.array(z.string().uuid()).min(1),
  isNfc: z.boolean().default(false),
  // Junior handler fields
  handlerName: z.string().optional(),
  handlerDob: z.string().optional(),
  handlerKcNumber: z.string().optional(),
});

export const ordersRouter = createTRPCRouter({
  checkout: protectedProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        entries: z.array(cartEntrySchema).min(1),
        catalogueRequested: z.boolean().default(false),
        sundryItems: z.array(z.object({
          sundryItemId: z.string().uuid(),
          quantity: z.number().int().min(1),
        })).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate show is accepting entries
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
      });

      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      if (show.status !== 'entries_open') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Show is not accepting entries',
        });
      }

      // Validate all dogs belong to user (for standard entries)
      const dogIds = input.entries
        .filter((e) => e.entryType === 'standard' && e.dogId)
        .map((e) => e.dogId!);

      if (dogIds.length > 0) {
        const userDogs = await ctx.db.query.dogs.findMany({
          where: and(
            inArray(dogs.id, dogIds),
            eq(dogs.ownerId, ctx.session.user.id),
            isNull(dogs.deletedAt)
          ),
        });

        if (userDogs.length !== new Set(dogIds).size) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'One or more dogs not found or not owned by you',
          });
        }
      }

      // Check for duplicate classes (same dog can enter multiple classes, but not the same class twice)
      for (const entryInput of input.entries) {
        if (entryInput.entryType === 'standard' && entryInput.dogId) {
          const existingEntry = await ctx.db.query.entries.findFirst({
            where: and(
              eq(entries.dogId, entryInput.dogId),
              eq(entries.showId, input.showId),
              isNull(entries.deletedAt),
              sql`${entries.status} NOT IN ('withdrawn', 'cancelled')`
            ),
            with: { entryClasses: true },
          });

          if (existingEntry) {
            const existingClassIds = new Set(existingEntry.entryClasses.map((ec) => ec.showClassId));
            const duplicateClassIds = entryInput.classIds.filter((id) => existingClassIds.has(id));

            if (duplicateClassIds.length > 0) {
              const dog = await ctx.db.query.dogs.findFirst({
                where: eq(dogs.id, entryInput.dogId),
              });
              const dupClasses = await ctx.db.query.showClasses.findMany({
                where: inArray(showClasses.id, duplicateClassIds),
                with: { classDefinition: true },
              });
              const classNames = dupClasses.map((c) => c.classDefinition.name).join(', ');
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `${dog?.registeredName ?? 'This dog'} is already entered in: ${classNames}`,
              });
            }
          }
        }
      }

      // Collect all class IDs and validate
      const allClassIds = input.entries.flatMap((e) => e.classIds);
      const selectedClasses = await ctx.db.query.showClasses.findMany({
        where: and(
          inArray(showClasses.id, allClassIds),
          eq(showClasses.showId, input.showId)
        ),
      });

      const classMap = new Map(selectedClasses.map((sc) => [sc.id, sc]));

      // Verify all requested classes exist
      for (const classId of allClassIds) {
        if (!classMap.has(classId)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid class ID: ${classId}`,
          });
        }
      }

      // Calculate total amount using show-level fee tiers if available
      let totalAmount = 0;
      for (const entry of input.entries) {
        const classCount = entry.classIds.length;

        if (entry.isNfc && show.nfcEntryFee != null) {
          totalAmount += show.nfcEntryFee * classCount;
        } else if (show.firstEntryFee != null) {
          const subsequentRate = show.subsequentEntryFee ?? show.firstEntryFee;
          totalAmount += show.firstEntryFee + subsequentRate * (classCount - 1);
        } else {
          // Fallback: per-class fees
          for (const classId of entry.classIds) {
            totalAmount += classMap.get(classId)!.entryFee;
          }
        }
      }

      // Validate and calculate sundry items
      let sundryTotal = 0;
      const validatedSundryItems: { sundryItemId: string; quantity: number; unitPrice: number }[] = [];

      if (input.sundryItems.length > 0) {
        const requestedIds = input.sundryItems.map((s) => s.sundryItemId);
        const availableItems = await ctx.db.query.sundryItems.findMany({
          where: and(
            inArray(sundryItems.id, requestedIds),
            eq(sundryItems.showId, input.showId),
            eq(sundryItems.enabled, true)
          ),
        });

        const itemMap = new Map(availableItems.map((i) => [i.id, i]));

        for (const requested of input.sundryItems) {
          const item = itemMap.get(requested.sundryItemId);
          if (!item) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Sundry item not found or not available: ${requested.sundryItemId}`,
            });
          }
          if (item.maxPerOrder != null && requested.quantity > item.maxPerOrder) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Maximum ${item.maxPerOrder} of "${item.name}" per order`,
            });
          }
          const lineTotal = item.priceInPence * requested.quantity;
          sundryTotal += lineTotal;
          validatedSundryItems.push({
            sundryItemId: item.id,
            quantity: requested.quantity,
            unitPrice: item.priceInPence,
          });
        }
      }

      totalAmount += sundryTotal;

      // Create order
      const [order] = await ctx.db
        .insert(orders)
        .values({
          showId: input.showId,
          exhibitorId: ctx.session.user.id,
          status: 'pending_payment',
          totalAmount,
        })
        .returning();

      // Create entries and entry classes
      const createdEntries: { id: string; dogId: string | null }[] = [];

      for (const entryInput of input.entries) {
        const classCount = entryInput.classIds.length;
        let entryFee: number;

        if (entryInput.isNfc && show.nfcEntryFee != null) {
          entryFee = show.nfcEntryFee * classCount;
        } else if (show.firstEntryFee != null) {
          const subsequentRate = show.subsequentEntryFee ?? show.firstEntryFee;
          entryFee = show.firstEntryFee + subsequentRate * (classCount - 1);
        } else {
          entryFee = entryInput.classIds.reduce(
            (sum, cid) => sum + (classMap.get(cid)?.entryFee ?? 0),
            0
          );
        }

        const [entry] = await ctx.db
          .insert(entries)
          .values({
            showId: input.showId,
            dogId: entryInput.dogId ?? null,
            exhibitorId: ctx.session.user.id,
            orderId: order!.id,
            entryType: entryInput.entryType,
            isNfc: entryInput.isNfc,
            status: 'pending',
            totalFee: entryFee,
            catalogueRequested: input.catalogueRequested,
          })
          .returning();

        createdEntries.push({
          id: entry!.id,
          dogId: entryInput.dogId ?? null,
        });

        // Create entry classes with tiered fees
        await ctx.db.insert(entryClasses).values(
          entryInput.classIds.map((cid, idx) => {
            let classFee: number;
            if (entryInput.isNfc && show.nfcEntryFee != null) {
              classFee = show.nfcEntryFee;
            } else if (show.firstEntryFee != null) {
              classFee = idx === 0 ? show.firstEntryFee : (show.subsequentEntryFee ?? show.firstEntryFee);
            } else {
              classFee = classMap.get(cid)!.entryFee;
            }
            return {
              entryId: entry!.id,
              showClassId: cid,
              fee: classFee,
            };
          })
        );

        // Create junior handler details if applicable
        if (
          entryInput.entryType === 'junior_handler' &&
          entryInput.handlerName
        ) {
          await ctx.db.insert(juniorHandlerDetails).values({
            entryId: entry!.id,
            handlerName: entryInput.handlerName,
            dateOfBirth: entryInput.handlerDob!,
            kcNumber: entryInput.handlerKcNumber ?? null,
          });
        }

        // Create audit log
        await ctx.db.insert(entryAuditLog).values({
          entryId: entry!.id,
          action: 'created',
          userId: ctx.session.user.id,
          changes: {
            classIds: entryInput.classIds,
            entryType: entryInput.entryType,
          },
        });
      }

      // Create order sundry items
      if (validatedSundryItems.length > 0) {
        await ctx.db.insert(orderSundryItems).values(
          validatedSundryItems.map((s) => ({
            orderId: order!.id,
            sundryItemId: s.sundryItemId,
            quantity: s.quantity,
            unitPrice: s.unitPrice,
          }))
        );
      }

      // Create Stripe PaymentIntent
      const paymentIntent = await createPaymentIntent(totalAmount, {
        orderId: order!.id,
        showId: input.showId,
        exhibitorId: ctx.session.user.id,
        entryCount: String(input.entries.length),
      });

      // Update order with Stripe PI ID
      await ctx.db
        .update(orders)
        .set({ stripePaymentIntentId: paymentIntent.id })
        .where(eq(orders.id, order!.id));

      // Create payment record
      await ctx.db.insert(payments).values({
        orderId: order!.id,
        stripePaymentId: paymentIntent.id,
        amount: totalAmount,
        status: 'pending',
        type: 'initial',
      });

      return {
        clientSecret: paymentIntent.client_secret!,
        orderId: order!.id,
        totalAmount,
        entryCount: createdEntries.length,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.id),
        with: {
          show: {
            with: {
              organisation: true,
              venue: true,
            },
          },
          entries: {
            with: {
              dog: { with: { breed: true } },
              entryClasses: {
                with: {
                  showClass: { with: { classDefinition: true } },
                },
              },
              juniorHandlerDetails: true,
            },
          },
          payments: true,
          orderSundryItems: {
            with: { sundryItem: true },
          },
        },
      });

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      if (order.exhibitorId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your order' });
      }

      return order;
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const where = eq(orders.exhibitorId, ctx.session.user.id);

      const items = await ctx.db.query.orders.findMany({
        where,
        with: {
          show: { with: { venue: true } },
          entries: {
            with: {
              dog: true,
            },
          },
        },
        orderBy: [desc(orders.createdAt)],
        limit: input.limit,
        offset: input.cursor,
      });

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(where);

      return {
        items,
        total: Number(countResult[0]?.count ?? 0),
        nextCursor:
          input.cursor + input.limit < Number(countResult[0]?.count ?? 0)
            ? input.cursor + input.limit
            : null,
      };
    }),
});
