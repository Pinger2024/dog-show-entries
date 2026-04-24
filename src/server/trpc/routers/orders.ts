import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, inArray, desc, sql, asc } from 'drizzle-orm';
import { differenceInMonths, differenceInWeeks } from 'date-fns';
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
  judgeAssignments,
  judges,
  users,
  achievements,
} from '@/server/db/schema';
import {
  createPaymentIntent,
  calculatePlatformFee,
} from '@/server/services/stripe';

const cartEntrySchema = z.object({
  entryType: z.enum(['standard', 'junior_handler']).default('standard'),
  dogId: z.string().uuid().optional(),
  classIds: z.array(z.string().uuid()),
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
        /** RKC F(1).11.b.(6)/(8) — exhibitor right to withhold name/address from catalogue */
        withholdFromPublication: z.boolean().default(false),
        sundryItems: z.array(z.object({
          sundryItemId: z.string().uuid(),
          quantity: z.number().int().min(1),
        })).default([]),
        /** Channel the exhibitor arrived from (from the show page's ?src= param). */
        referralSource: z
          .string()
          .regex(/^[a-z0-9_-]+$/i, 'invalid source')
          .max(32)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate show is accepting entries. Remi is merchant of record —
      // exhibitor entry fees land in Remi's Stripe balance and are paid
      // out to the club by BACS after the show. No need to fetch the
      // host org's payment config here.
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

      // Also reject if entry close date has passed
      if (show.entryCloseDate && new Date(show.entryCloseDate).getTime() < Date.now()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Entry closing date has passed',
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
          with: { breed: true },
        });

        if (userDogs.length !== new Set(dogIds).size) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'One or more dogs not found or not owned by you',
          });
        }

        // Breed validation for single-breed shows.
        // Primary source: the show's own breedId (set when the single-breed show is created).
        // Fallback: derive from show classes and judge assignments for legacy shows.
        if (show.showScope === 'single_breed') {
          const allowedBreedIds = new Set<string>();
          if (show.breedId) allowedBreedIds.add(show.breedId);

          // Fallback for shows without show.breedId set
          if (allowedBreedIds.size === 0) {
            const showClassRows = await ctx.db.query.showClasses.findMany({
              where: eq(showClasses.showId, input.showId),
              columns: { breedId: true },
            });
            const judgeAssignmentRows = await ctx.db.query.judgeAssignments.findMany({
              where: eq(judgeAssignments.showId, input.showId),
              columns: { breedId: true },
            });
            for (const sc of showClassRows) {
              if (sc.breedId) allowedBreedIds.add(sc.breedId);
            }
            for (const ja of judgeAssignmentRows) {
              if (ja.breedId) allowedBreedIds.add(ja.breedId);
            }
          }

          // If we found breed constraints, validate each dog
          if (allowedBreedIds.size > 0) {
            for (const dog of userDogs) {
              if (!allowedBreedIds.has(dog.breedId)) {
                const dogName = dog.registeredName ?? 'This dog';
                const breedName = dog.breed?.name ?? 'its breed';
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: `${dogName} (${breedName}) cannot be entered in this single-breed show. Only dogs of the show breed are eligible.`,
                });
              }
            }
          }
        }

        // Breed validation for individual classes (all show types)
        // Ensure each dog is only entered in classes matching its breed, or AV/unassigned classes
        for (const entryInput of input.entries) {
          if (entryInput.entryType !== 'standard' || !entryInput.dogId) continue;
          if (entryInput.classIds.length === 0) continue;
          const dog = userDogs.find((d) => d.id === entryInput.dogId);
          if (!dog) continue;

          const entryClasses = await ctx.db.query.showClasses.findMany({
            where: and(
              inArray(showClasses.id, entryInput.classIds),
              eq(showClasses.showId, input.showId)
            ),
            with: { classDefinition: true },
          });

          for (const sc of entryClasses) {
            // Classes with no breedId are AV (Any Variety) or universal — any breed is allowed
            // Junior handler classes also accept any breed
            if (!sc.breedId || sc.classDefinition.type === 'junior_handler') continue;
            if (sc.breedId !== dog.breedId) {
              const dogName = dog.registeredName ?? 'This dog';
              const breedName = dog.breed?.name ?? 'its breed';
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `${dogName} (${breedName}) cannot be entered in the class "${sc.classDefinition.name}" as it is restricted to a different breed.`,
              });
            }
          }
        }

        // RKC age validation: dogs must meet minimum age on show day
        const showDate = new Date(show.startDate);
        const dogMap = new Map(userDogs.map((d) => [d.id, d]));

        for (const entryInput of input.entries) {
          if (entryInput.entryType !== 'standard' || !entryInput.dogId) continue;
          const dog = dogMap.get(entryInput.dogId);
          if (!dog?.dateOfBirth) continue;

          const dob = new Date(dog.dateOfBirth);
          const ageMonths = differenceInMonths(showDate, dob);
          const ageWeeks = differenceInWeeks(showDate, dob);
          const dogName = dog.registeredName ?? 'This dog';

          if (entryInput.isNfc) {
            // NFC entries: minimum 12 weeks (RKC 2026 regulations)
            if (ageWeeks < 12) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `${dogName} will only be ${ageWeeks} weeks old on show day. Dogs must be at least 12 weeks old for NFC entries.`,
              });
            }
          } else {
            // Competition entries: minimum 6 months
            if (ageMonths < 4) {
              // Under 4 months: reject entirely
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `${dogName} will only be ${ageMonths} months old on show day. Dogs must be at least 6 months old to enter competition classes, or at least 12 weeks old for Not For Competition (NFC) entries.`,
              });
            } else if (ageMonths < 6) {
              // Between 4 and 6 months: suggest NFC
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `${dogName} will only be ${ageMonths} months old on show day. Dogs must be at least 6 months old for competition classes. You can enter Not For Competition (NFC) instead.`,
              });
            }
          }
        }
      }

      // Limited show eligibility check (2026 RKC rule)
      if (show.showType === 'limited' && dogIds.length > 0) {
        for (const dogId of [...new Set(dogIds)]) {
          const ccTypes = ['cc', 'dog_cc', 'bitch_cc'] as const;
          const ccRows = await ctx.db
            .select({ count: sql<number>`count(*)::int` })
            .from(achievements)
            .where(
              and(
                eq(achievements.dogId, dogId),
                inArray(achievements.type, [...ccTypes])
              )
            );
          const ccCount = ccRows[0]?.count ?? 0;

          if (ccCount > 0) {
            const dog = await ctx.db.query.dogs.findFirst({
              where: eq(dogs.id, dogId),
              columns: { registeredName: true },
            });
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `${dog?.registeredName ?? 'This dog'} has won a CC and is ineligible for Limited shows`,
            });
          }

          const rccTypes = ['reserve_cc', 'reserve_dog_cc', 'reserve_bitch_cc'] as const;
          const rccRows = await ctx.db
            .select({ judgeId: achievements.judgeId })
            .from(achievements)
            .where(
              and(
                eq(achievements.dogId, dogId),
                inArray(achievements.type, [...rccTypes])
              )
            );
          const distinctJudges = new Set(rccRows.map((r) => r.judgeId ?? 'unknown'));
          if (distinctJudges.size >= 5) {
            const dog = await ctx.db.query.dogs.findFirst({
              where: eq(dogs.id, dogId),
              columns: { registeredName: true },
            });
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `${dog?.registeredName ?? 'This dog'} has 5+ RCCs under different judges and is ineligible for Limited shows (2026 rule)`,
            });
          }
        }
      }

      // Non-NFC entries must have at least one class
      for (const entryInput of input.entries) {
        if (!entryInput.isNfc && entryInput.classIds.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Each entry must have at least one class selected (unless entering NFC)',
          });
        }
      }

      // Clean up stale entries from previous abandoned/failed checkout attempts
      // so they don't block the current checkout
      const staleOrders = await ctx.db.query.orders.findMany({
        where: and(
          eq(orders.showId, input.showId),
          eq(orders.exhibitorId, ctx.session.user.id),
          inArray(orders.status, ['pending_payment', 'failed'])
        ),
        columns: { id: true },
      });

      if (staleOrders.length > 0) {
        const staleOrderIds = staleOrders.map((o) => o.id);
        // Soft-delete stale entries so they don't block duplicate checks
        await ctx.db
          .update(entries)
          .set({ deletedAt: new Date(), status: 'cancelled' })
          .where(
            and(
              inArray(entries.orderId, staleOrderIds),
              eq(entries.status, 'pending'),
              isNull(entries.deletedAt)
            )
          );
        // Mark stale orders as cancelled
        await ctx.db
          .update(orders)
          .set({ status: 'cancelled' })
          .where(inArray(orders.id, staleOrderIds));
      }

      // Check for duplicate classes against confirmed entries only
      // (pending entries from previous attempts have been cleaned up above)
      for (const entryInput of input.entries) {
        if (entryInput.entryType === 'standard' && entryInput.dogId) {
          const existingEntry = await ctx.db.query.entries.findFirst({
            where: and(
              eq(entries.dogId, entryInput.dogId),
              eq(entries.showId, input.showId),
              isNull(entries.deletedAt),
              eq(entries.status, 'confirmed')
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

      // Judge conflict check: warn if exhibitor's name matches an assigned judge
      const exhibitor = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
        columns: { name: true },
      });
      if (exhibitor?.name) {
        const assignedJudges = await ctx.db.query.judgeAssignments.findMany({
          where: eq(judgeAssignments.showId, input.showId),
          with: { judge: { columns: { name: true } } },
        });
        const exhibitorName = exhibitor.name.toLowerCase().trim();
        const isJudge = assignedJudges.some(
          (a) => a.judge?.name?.toLowerCase().trim() === exhibitorName
        );
        if (isJudge) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You appear to be assigned as a judge at this show. Judges cannot exhibit dogs at shows they are judging.',
          });
        }
      }

      // Collect all class IDs and validate
      const allClassIds = input.entries.flatMap((e) => e.classIds);
      const classMap = new Map<string, { id: string; entryFee: number }>();

      if (allClassIds.length > 0) {
        const selectedClasses = await ctx.db.query.showClasses.findMany({
          where: and(
            inArray(showClasses.id, allClassIds),
            eq(showClasses.showId, input.showId)
          ),
        });

        for (const sc of selectedClasses) {
          classMap.set(sc.id, sc);
        }

        // Verify all requested classes exist
        for (const classId of allClassIds) {
          if (!classMap.has(classId)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Invalid class ID: ${classId}`,
            });
          }
        }
      }

      // Calculate total amount using show-level fee tiers if available
      let totalAmount = 0;
      for (const entry of input.entries) {
        const classCount = entry.classIds.length;

        if (entry.entryType === 'junior_handler' && show.juniorHandlerFee != null) {
          totalAmount += show.juniorHandlerFee;
        } else if (entry.isNfc && show.nfcEntryFee != null) {
          totalAmount += classCount > 0 ? show.nfcEntryFee * classCount : show.nfcEntryFee;
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

      // Platform handling fee (£1 + 1% of subtotal) — the exhibitor pays
      // totalAmount + platformFee at Stripe. Fee is 0 for £0 orders so
      // free entries bypass Stripe entirely.
      const platformFeePence =
        totalAmount === 0 ? 0 : calculatePlatformFee(totalAmount);

      // Create order
      const [order] = await ctx.db
        .insert(orders)
        .values({
          showId: input.showId,
          exhibitorId: ctx.session.user.id,
          status: 'pending_payment',
          totalAmount,
          platformFeePence,
          referralSource: input.referralSource?.toLowerCase() ?? null,
        })
        .returning();

      // Create entries and entry classes
      const createdEntries: { id: string; dogId: string | null }[] = [];

      for (const entryInput of input.entries) {
        const classCount = entryInput.classIds.length;
        let entryFee: number;

        if (entryInput.entryType === 'junior_handler' && show.juniorHandlerFee != null) {
          entryFee = show.juniorHandlerFee;
        } else if (entryInput.isNfc && show.nfcEntryFee != null) {
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
            withholdFromPublication: input.withholdFromPublication,
          })
          .returning();

        createdEntries.push({
          id: entry!.id,
          dogId: entryInput.dogId ?? null,
        });

        // Create entry classes with per-class fees. The sum of these must
        // match entries.total_fee above — the JH and NFC branches have to
        // stay aligned between the two loops or the financial "Entries by
        // Class" breakdown disagrees with the order-level revenue.
        await ctx.db.insert(entryClasses).values(
          entryInput.classIds.map((cid, idx) => {
            let classFee: number;
            if (entryInput.entryType === 'junior_handler' && show.juniorHandlerFee != null) {
              // JH fee is a flat per-entry charge — attribute to the first
              // class, zero for the rest. Typically only one class anyway.
              classFee = idx === 0 ? show.juniorHandlerFee : 0;
            } else if (entryInput.isNfc && show.nfcEntryFee != null) {
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

      // Free entries (£0) — skip Stripe, auto-confirm
      if (totalAmount === 0) {
        await ctx.db
          .update(orders)
          .set({ status: 'paid' })
          .where(eq(orders.id, order!.id));

        // Confirm all entries immediately
        for (const entry of createdEntries) {
          await ctx.db
            .update(entries)
            .set({ status: 'confirmed' })
            .where(eq(entries.id, entry.id));
        }

        return {
          clientSecret: null,
          orderId: order!.id,
          totalAmount: 0,
          entryCount: createdEntries.length,
          freeEntry: true,
        };
      }

      // Gross = what the exhibitor is charged (subtotal + £1+1% handling
      // fee). Money lands in Remi's platform Stripe account; the
      // subtotal is forwarded to the club by BACS after entries close.
      // The platformFeePence column on orders + the metadata below keep
      // the two components separable for reconciliation and payouts.
      const grossAmount = totalAmount + platformFeePence;

      const paymentIntent = await createPaymentIntent(grossAmount, {
        orderId: order!.id,
        showId: input.showId,
        exhibitorId: ctx.session.user.id,
        entryCount: String(input.entries.length),
        platformFeePence: String(platformFeePence),
        subtotalPence: String(totalAmount),
      });

      // Update order with Stripe PI ID
      await ctx.db
        .update(orders)
        .set({ stripePaymentIntentId: paymentIntent.id })
        .where(eq(orders.id, order!.id));

      // Create payment record. amount here reflects what the exhibitor
      // is being charged (gross) so the sum reconciles with Stripe's
      // own balance transactions.
      await ctx.db.insert(payments).values({
        orderId: order!.id,
        stripePaymentId: paymentIntent.id,
        amount: grossAmount,
        status: 'pending',
        type: 'initial',
      });

      return {
        clientSecret: paymentIntent.client_secret!,
        orderId: order!.id,
        totalAmount,
        platformFeePence,
        grossAmount,
        entryCount: createdEntries.length,
        freeEntry: false,
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
