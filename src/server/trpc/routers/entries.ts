import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, inArray, asc, desc, sql } from 'drizzle-orm';
import { differenceInMonths, differenceInWeeks } from 'date-fns';
import {
  protectedProcedure,
  secretaryProcedure,
} from '../procedures';
import { createTRPCRouter } from '../init';
import { verifyShowAccess } from '../verify-show-access';
import {
  entries,
  entryClasses,
  dogs,
  dogPhotos,
  shows,
  showClasses,
  payments,
  entryAuditLog,
  users,
  dogOwners,
  judgeAssignments,
} from '@/server/db/schema';
import {
  createPaymentIntent,
  calculatePlatformFee,
  getStripe,
} from '@/server/services/stripe';

export const entriesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        dogId: z.string().uuid(),
        showId: z.string().uuid(),
        classIds: z.array(z.string().uuid()).min(1),
        handlerId: z.string().uuid().optional(),
        isNfc: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate dog belongs to user
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(
          eq(dogs.id, input.dogId),
          eq(dogs.ownerId, ctx.session.user.id),
          isNull(dogs.deletedAt)
        ),
        with: { breed: true },
      });

      if (!dog) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Dog not found or you do not own this dog',
        });
      }

      // Validate show is accepting entries
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
      });

      if (!show) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Show not found',
        });
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

      // Breed validation for single-breed shows.
      // Primary source: the show's own breedId. Fallback: derive from show
      // classes and judge assignments for legacy shows without show.breedId.
      if (show.showScope === 'single_breed') {
        const allowedBreedIds = new Set<string>();
        if (show.breedId) allowedBreedIds.add(show.breedId);

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

        if (allowedBreedIds.size > 0 && !allowedBreedIds.has(dog.breedId)) {
          const dogName = dog.registeredName ?? 'This dog';
          const breedName = dog.breed?.name ?? 'its breed';
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${dogName} (${breedName}) cannot be entered in this single-breed show. Only dogs of the show breed are eligible.`,
          });
        }
      }

      // Breed validation for individual classes (all show types)
      {
        const entryClasses = await ctx.db.query.showClasses.findMany({
          where: and(
            inArray(showClasses.id, input.classIds),
            eq(showClasses.showId, input.showId)
          ),
          with: { classDefinition: true },
        });
        for (const sc of entryClasses) {
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
      if (dog.dateOfBirth) {
        const showDate = new Date(show.startDate);
        const dob = new Date(dog.dateOfBirth);
        const ageMonths = differenceInMonths(showDate, dob);
        const ageWeeks = differenceInWeeks(showDate, dob);
        const dogName = dog.registeredName ?? 'This dog';

        if (input.isNfc) {
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

      // Check for duplicate classes against confirmed entries only
      // (pending entries from abandoned checkouts should not block re-entry)
      const existingEntry = await ctx.db.query.entries.findFirst({
        where: and(
          eq(entries.dogId, input.dogId),
          eq(entries.showId, input.showId),
          isNull(entries.deletedAt),
          eq(entries.status, 'confirmed')
        ),
        with: { entryClasses: true },
      });

      if (existingEntry) {
        const existingClassIds = new Set(existingEntry.entryClasses.map((ec) => ec.showClassId));
        const duplicateClassIds = input.classIds.filter((id) => existingClassIds.has(id));

        if (duplicateClassIds.length > 0) {
          const dupClasses = await ctx.db.query.showClasses.findMany({
            where: inArray(showClasses.id, duplicateClassIds),
            with: { classDefinition: true },
          });
          const names = dupClasses.map((c) => c.classDefinition.name).join(', ');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `This dog is already entered in: ${names}`,
          });
        }
      }

      // Judge conflict check: exhibitors cannot exhibit at shows they are judging
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

      // Validate classes exist and belong to the show
      const selectedClasses = await ctx.db.query.showClasses.findMany({
        where: and(
          inArray(showClasses.id, input.classIds),
          eq(showClasses.showId, input.showId)
        ),
      });

      if (selectedClasses.length !== input.classIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more classes are invalid for this show',
        });
      }

      // Calculate total fee for the new classes
      const newClassesFee = selectedClasses.reduce(
        (sum, sc) => sum + sc.entryFee,
        0
      );

      // If the dog already has an entry, add classes to it; otherwise create a new entry
      if (existingEntry) {
        // Add new classes to the existing entry
        await ctx.db.insert(entryClasses).values(
          selectedClasses.map((sc) => ({
            entryId: existingEntry.id,
            showClassId: sc.id,
            fee: sc.entryFee,
          }))
        );

        // Update the total fee on the existing entry
        const [updated] = await ctx.db
          .update(entries)
          .set({ totalFee: existingEntry.totalFee + newClassesFee })
          .where(eq(entries.id, existingEntry.id))
          .returning();

        return updated!;
      }

      // Create new entry and entry classes
      const [entry] = await ctx.db
        .insert(entries)
        .values({
          showId: input.showId,
          dogId: input.dogId,
          exhibitorId: ctx.session.user.id,
          handlerId: input.handlerId ?? null,
          isNfc: input.isNfc,
          totalFee: newClassesFee,
        })
        .returning();

      await ctx.db.insert(entryClasses).values(
        selectedClasses.map((sc) => ({
          entryId: entry!.id,
          showClassId: sc.id,
          fee: sc.entryFee,
        }))
      );

      return entry!;
    }),

  list: protectedProcedure
    .input(
      z.object({
        dogId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(entries.exhibitorId, ctx.session.user.id),
        isNull(entries.deletedAt),
      ];
      if (input.dogId) {
        conditions.push(eq(entries.dogId, input.dogId));
      }
      const where = and(...conditions);

      const items = await ctx.db.query.entries.findMany({
        where,
        with: {
          show: {
            with: {
              organisation: true,
              venue: true,
            },
          },
          dog: {
            with: {
              breed: true,
            },
          },
          entryClasses: {
            with: {
              showClass: {
                with: {
                  classDefinition: true,
                },
              },
            },
          },
        },
        orderBy: [desc(entries.createdAt)],
        limit: input.limit,
        offset: input.cursor,
      });

      // Batch-fetch primary photos for all dogs in results
      const dogIds = items.map((e) => e.dogId).filter((id): id is string => !!id);
      const primaryPhotos = dogIds.length > 0
        ? await ctx.db.query.dogPhotos.findMany({
            where: and(
              inArray(dogPhotos.dogId, dogIds),
              eq(dogPhotos.isPrimary, true),
            ),
            columns: { dogId: true, url: true },
          })
        : [];
      const photoMap = new Map(primaryPhotos.map((p) => [p.dogId, p.url]));

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(entries)
        .where(where);

      const total = Number(countResult[0]?.count ?? 0);

      return {
        items: items.map((item) => ({
          ...item,
          dogPhotoUrl: item.dogId ? photoMap.get(item.dogId) ?? null : null,
        })),
        total,
        nextCursor:
          input.cursor + input.limit < total
            ? input.cursor + input.limit
            : null,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.query.entries.findFirst({
        where: and(eq(entries.id, input.id), isNull(entries.deletedAt)),
        with: {
          show: {
            with: {
              organisation: true,
              venue: true,
            },
          },
          dog: {
            with: {
              breed: true,
            },
          },
          entryClasses: {
            with: {
              showClass: {
                with: {
                  classDefinition: true,
                  breed: true,
                },
              },
            },
          },
          payments: true,
        },
      });

      if (!entry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Entry not found',
        });
      }

      // Non-secretary users can only see their own entries
      if (
        entry.exhibitorId !== ctx.session.user.id &&
        ctx.session.user.role !== 'secretary' &&
        ctx.session.user.role !== 'admin'
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this entry',
        });
      }

      // Fetch primary photo for the dog
      let dogPhotoUrl: string | null = null;
      if (entry.dogId) {
        const photo = await ctx.db.query.dogPhotos.findFirst({
          where: and(
            eq(dogPhotos.dogId, entry.dogId),
            eq(dogPhotos.isPrimary, true),
          ),
          columns: { url: true },
        });
        dogPhotoUrl = photo?.url ?? null;
      }

      return { ...entry, dogPhotoUrl };
    }),

  getForShow: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        status: z
          .enum(['pending', 'confirmed', 'withdrawn', 'transferred', 'cancelled'])
          .optional(),
        limit: z.number().min(1).max(500).default(50),
        cursor: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const conditions = [
        eq(entries.showId, input.showId),
        isNull(entries.deletedAt),
      ];

      if (input.status) {
        conditions.push(eq(entries.status, input.status));
      }

      const where = and(...conditions);

      const items = await ctx.db.query.entries.findMany({
        where,
        with: {
          dog: {
            with: {
              breed: true,
            },
          },
          exhibitor: true,
          entryClasses: {
            with: {
              showClass: {
                with: {
                  classDefinition: true,
                },
              },
            },
          },
          // Payments are linked at the order level (one Stripe charge per
          // multi-entry order). entries.payments (via payments.entry_id) is
          // currently always empty; order.payments is the live link.
          payments: true,
          order: {
            with: {
              payments: true,
            },
          },
        },
        orderBy: [asc(entries.createdAt)],
        limit: input.limit,
        offset: input.cursor,
      });

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(entries)
        .where(where);

      const total = Number(countResult[0]?.count ?? 0);

      return {
        items,
        total,
        nextCursor:
          input.cursor + input.limit < total
            ? input.cursor + input.limit
            : null,
      };
    }),

  withdraw: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.query.entries.findFirst({
        where: and(eq(entries.id, input.id), isNull(entries.deletedAt)),
      });

      if (!entry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Entry not found',
        });
      }

      if (entry.exhibitorId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not own this entry',
        });
      }

      if (entry.status === 'withdrawn' || entry.status === 'cancelled') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Entry is already withdrawn or cancelled',
        });
      }

      const [updated] = await ctx.db
        .update(entries)
        .set({ status: 'withdrawn' })
        .where(eq(entries.id, input.id))
        .returning();

      // Audit log
      await ctx.db.insert(entryAuditLog).values({
        entryId: input.id,
        action: 'withdrawn',
        userId: ctx.session.user.id,
      });

      return updated!;
    }),

  // ── Entry editing (class changes) ────────────────────────

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        classIds: z.array(z.string().uuid()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.query.entries.findFirst({
        where: and(eq(entries.id, input.id), isNull(entries.deletedAt)),
        with: {
          show: true,
          entryClasses: true,
          payments: true,
        },
      });

      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      }

      if (entry.exhibitorId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your entry' });
      }

      if (entry.show.status !== 'entries_open') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Show is no longer accepting entry changes',
        });
      }

      if (entry.status !== 'confirmed' && entry.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only confirmed or pending entries can be modified',
        });
      }

      // Validate new classes
      const newClasses = await ctx.db.query.showClasses.findMany({
        where: and(
          inArray(showClasses.id, input.classIds),
          eq(showClasses.showId, entry.showId)
        ),
      });

      if (newClasses.length !== input.classIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more classes are invalid',
        });
      }

      const oldFee = entry.totalFee;
      // Use show-level tiered pricing if available, otherwise sum per-class fees
      let newFee: number;
      if (entry.show.firstEntryFee != null) {
        const subsequentRate = entry.show.subsequentEntryFee ?? entry.show.firstEntryFee;
        newFee = newClasses.length > 0
          ? entry.show.firstEntryFee + subsequentRate * (newClasses.length - 1)
          : 0;
      } else {
        newFee = newClasses.reduce((sum, sc) => sum + sc.entryFee, 0);
      }
      const feeDiff = newFee - oldFee;

      const oldClassIds = entry.entryClasses.map((ec) => ec.showClassId);

      // Delete old entry classes and insert new ones
      await ctx.db
        .delete(entryClasses)
        .where(eq(entryClasses.entryId, input.id));

      await ctx.db.insert(entryClasses).values(
        newClasses.map((sc) => ({
          entryId: input.id,
          showClassId: sc.id,
          fee: sc.entryFee,
        }))
      );

      // Update entry total
      await ctx.db
        .update(entries)
        .set({ totalFee: newFee })
        .where(eq(entries.id, input.id));

      // Audit log
      await ctx.db.insert(entryAuditLog).values({
        entryId: input.id,
        action: 'classes_changed',
        userId: ctx.session.user.id,
        changes: {
          oldClassIds,
          newClassIds: input.classIds,
          oldFee,
          newFee,
          feeDiff,
        },
      });

      let paymentResult: { requiresPayment: boolean; clientSecret?: string } = {
        requiresPayment: false,
      };

      // Handle fee difference
      if (feeDiff > 0) {
        // Additional payment needed. Platform-mode charge — money lands
        // in Remi's balance, we include the diff in the next payout to
        // the club.
        const platformFeePence = calculatePlatformFee(feeDiff);
        const grossAmount = feeDiff + platformFeePence;

        const pi = await createPaymentIntent(grossAmount, {
          entryId: input.id,
          showId: entry.showId,
          exhibitorId: ctx.session.user.id,
          type: 'adjustment',
          platformFeePence: String(platformFeePence),
          subtotalPence: String(feeDiff),
        });

        await ctx.db.insert(payments).values({
          entryId: input.id,
          stripePaymentId: pi.id,
          amount: grossAmount,
          status: 'pending',
          type: 'adjustment',
        });

        paymentResult = {
          requiresPayment: true,
          clientSecret: pi.client_secret!,
        };
      } else if (feeDiff < 0) {
        // Refund needed — find the original successful payment
        // Check entry-level payments first, then order-level payments
        let originalPayment = entry.payments.find(
          (p) => p.status === 'succeeded' && p.stripePaymentId
        );

        if (!originalPayment && entry.orderId) {
          originalPayment = await ctx.db.query.payments.findFirst({
            where: and(
              eq(payments.orderId, entry.orderId),
              eq(payments.status, 'succeeded'),
            ),
          }) ?? undefined;
        }

        if (originalPayment?.stripePaymentId) {
          const stripe = getStripe();
          await stripe.refunds.create({
            payment_intent: originalPayment.stripePaymentId,
            amount: Math.abs(feeDiff),
          });

          await ctx.db.insert(payments).values({
            entryId: input.id,
            stripePaymentId: originalPayment.stripePaymentId,
            amount: Math.abs(feeDiff),
            status: 'succeeded',
            type: 'refund',
          });
        }
      }

      return {
        entryId: input.id,
        oldFee,
        newFee,
        feeDiff,
        ...paymentResult,
      };
    }),

  // ── Validate exhibitor profile for entry ──────────────────

  validateExhibitorForEntry: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
      });

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // If name or address are missing, try to auto-fill from the user's
      // dog owner records — they already entered this info when adding a dog.
      const missingName = !user.name;
      const missingAddress = !user.address;

      if (missingName || missingAddress) {
        const primaryOwner = await ctx.db.query.dogOwners.findFirst({
          where: and(
            eq(dogOwners.userId, ctx.session.user.id),
            eq(dogOwners.isPrimary, true),
          ),
          orderBy: [desc(dogOwners.createdAt)],
        });

        if (primaryOwner) {
          const updates: Record<string, string> = {};
          if (missingName && primaryOwner.ownerName) updates.name = primaryOwner.ownerName;
          if (missingAddress && primaryOwner.ownerAddress) updates.address = primaryOwner.ownerAddress;
          if (!user.phone && primaryOwner.ownerPhone) updates.phone = primaryOwner.ownerPhone;

          if (Object.keys(updates).length > 0) {
            await ctx.db.update(users).set(updates).where(eq(users.id, ctx.session.user.id));
            // Re-read after update so we return the fresh data
            const updated = await ctx.db.query.users.findFirst({
              where: eq(users.id, ctx.session.user.id),
            });
            if (updated) {
              return {
                valid: !!(updated.name && updated.address),
                issues: [
                  ...(!updated.name ? ['Name is required'] : []),
                  ...(!updated.address ? ['Address is required for show entries'] : []),
                ],
                user: {
                  name: updated.name,
                  address: updated.address,
                  phone: updated.phone,
                  kcAccountNo: updated.kcAccountNo,
                },
              };
            }
          }
        }
      }

      const issues: string[] = [];
      if (!user.address) issues.push('Address is required for show entries');
      if (!user.name) issues.push('Name is required');

      return {
        valid: issues.length === 0,
        issues,
        user: {
          name: user.name,
          address: user.address,
          phone: user.phone,
          kcAccountNo: user.kcAccountNo,
        },
      };
    }),
});
