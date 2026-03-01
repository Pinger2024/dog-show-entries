import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, inArray, asc, desc, sql } from 'drizzle-orm';
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
  shows,
  showClasses,
  payments,
  entryAuditLog,
  users,
} from '@/server/db/schema';
import { createPaymentIntent, getStripe } from '@/server/services/stripe';

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

      // Check for duplicate entry (same dog + same show, non-withdrawn)
      const existingEntry = await ctx.db.query.entries.findFirst({
        where: and(
          eq(entries.dogId, input.dogId),
          eq(entries.showId, input.showId),
          isNull(entries.deletedAt),
          sql`${entries.status} NOT IN ('withdrawn', 'cancelled')`
        ),
      });

      if (existingEntry) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This dog is already entered in this show',
        });
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

      // Calculate total fee
      const totalFee = selectedClasses.reduce(
        (sum, sc) => sum + sc.entryFee,
        0
      );

      // Create entry and entry classes in a transaction-like approach
      const [entry] = await ctx.db
        .insert(entries)
        .values({
          showId: input.showId,
          dogId: input.dogId,
          exhibitorId: ctx.session.user.id,
          handlerId: input.handlerId ?? null,
          isNfc: input.isNfc,
          totalFee,
        })
        .returning();

      // Create entry class records
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

      return entry;
    }),

  getForShow: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        status: z
          .enum(['pending', 'confirmed', 'withdrawn', 'transferred', 'cancelled'])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
          payments: true,
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
      const newFee = newClasses.reduce((sum, sc) => sum + sc.entryFee, 0);
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
        // Additional payment needed
        const pi = await createPaymentIntent(feeDiff, {
          entryId: input.id,
          showId: entry.showId,
          exhibitorId: ctx.session.user.id,
          type: 'adjustment',
        });

        await ctx.db.insert(payments).values({
          entryId: input.id,
          stripePaymentId: pi.id,
          amount: feeDiff,
          status: 'pending',
          type: 'adjustment',
        });

        paymentResult = {
          requiresPayment: true,
          clientSecret: pi.client_secret!,
        };
      } else if (feeDiff < 0) {
        // Refund needed — find the original successful payment
        const originalPayment = entry.payments.find(
          (p) => p.status === 'succeeded' && p.stripePaymentId
        );

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
