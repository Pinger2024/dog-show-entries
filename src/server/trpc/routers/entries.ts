import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, or, eq, isNull, inArray, notInArray, asc, desc, sql } from 'drizzle-orm';
import { differenceInWeeks } from 'date-fns';
import {
  protectedProcedure,
  secretaryProcedure,
} from '../procedures';
import { createTRPCRouter } from '../init';
import { verifyShowAccess } from '../verify-show-access';
import { publicOrgColumns } from '../public-org-columns';
import {
  entries,
  entryClasses,
  dogs,
  dogPhotos,
  shows,
  showClasses,
  orders,
  payments,
  entryAuditLog,
  users,
  dogOwners,
  judgeAssignments,
  showDiscountGroups,
  dogSvProfile,
} from '@/server/db/schema';
import {
  computeOrderFees,
  type DogEntryInput,
  type FeeContext,
} from '@/lib/fee-calc';
import {
  computeRegionalOrderFees,
  regionalClassFlatFee,
  type RegionalDogEntryInput,
  type RegionalFeeContext,
} from '@/lib/regional-fee-calc';
import {
  createPaymentIntent,
  calculatePlatformFee,
} from '@/server/services/stripe';
import { executeStripeRefund } from '@/server/services/stripe-refunds';
import { svEntryMissingRequirements, svEntryBlockedMessage } from '@/lib/sv-entry-validation';
import { hasJudgingConflict } from '@/lib/judge-exhibitor-conflict';
import { getCompetitionAgeError } from '@/lib/date-utils';

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

      // Breed validation for individual classes (all show types). Fetched
      // once and reused by the age check below. (Named to avoid shadowing the
      // `entryClasses` schema table used by the inserts further down.)
      const entryShowClasses = await ctx.db.query.showClasses.findMany({
        where: and(
          inArray(showClasses.id, input.classIds),
          eq(showClasses.showId, input.showId)
        ),
        with: { classDefinition: true },
      });
      for (const sc of entryShowClasses) {
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

      // RKC age validation: competition age is judged against the specific
      // class(es) entered, so Baby Puppy (4–6 months) isn't caught by the
      // general 6-month floor.
      if (dog.dateOfBirth) {
        const showDate = new Date(show.startDate);
        const dob = new Date(dog.dateOfBirth);
        const dogName = dog.registeredName ?? 'This dog';

        if (input.isNfc) {
          // NFC entries: minimum 12 weeks (RKC 2026 regulations)
          const ageWeeks = differenceInWeeks(showDate, dob);
          if (ageWeeks < 12) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `${dogName} will only be ${ageWeeks} weeks old on show day. Dogs must be at least 12 weeks old for NFC entries.`,
            });
          }
        } else {
          const ageError = getCompetitionAgeError({
            dogName,
            dob,
            showDate,
            classes: entryShowClasses.map((sc) => sc.classDefinition),
          });
          if (ageError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: ageError });
          }
        }
      }

      // WUSV / regional rule (Amanda 2026-05-26): one class per dog at a
      // regional show, and once a dog is on the show they can't be entered
      // again. Mirrors the same guard on the exhibitor checkout path in
      // orders.ts createOrder.
      if (show.showRuleset === 'wusv' && !input.isNfc) {
        if (input.classIds.length > 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'At a regional show, a dog can only be entered in one class. Please pick a single class.',
          });
        }
        const dupOnShow = await ctx.db.query.entries.findFirst({
          where: and(
            eq(entries.dogId, input.dogId),
            eq(entries.showId, input.showId),
            isNull(entries.deletedAt),
          ),
          columns: { id: true },
        });
        if (dupOnShow) {
          const dogName = dog.registeredName ?? 'This dog';
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${dogName} is already entered in this regional show. Each dog can only be entered once at a regional.`,
          });
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

      // Judge conflict check: a judge can't exhibit in classes they judge.
      // Junior Handling judges assess the handler, not the dog, so a JH-only
      // judge IS allowed to enter (Amanda 2026-06-01). See hasJudgingConflict.
      const exhibitor = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
        columns: { name: true },
      });
      if (exhibitor?.name) {
        const assignedJudges = await ctx.db.query.judgeAssignments.findMany({
          where: eq(judgeAssignments.showId, input.showId),
          with: { judge: { columns: { name: true } } },
        });
        if (hasJudgingConflict(assignedJudges, exhibitor.name)) {
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
        with: { classDefinition: true },
      });

      if (selectedClasses.length !== input.classIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more classes are invalid for this show',
        });
      }

      // WUSV coat type validation: if the class specifies a coat type, the dog must match
      if (show.showRuleset === 'wusv' && dog.coatType) {
        for (const sc of selectedClasses) {
          if (sc.svCoatType && sc.svCoatType !== dog.coatType) {
            const expected = sc.svCoatType === 'stock' ? 'Stock Coat' : 'Long Stock Coat';
            const actual = dog.coatType === 'stock' ? 'Stock Coat' : 'Long Stock Coat';
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `This class is for ${expected} dogs but your dog is registered as ${actual}. Please select the correct class.`,
            });
          }
        }
      }

      // SV regional entry requirements (Amanda 2026-05-28): every dog needs
      // a registration number + microchip; Junior class and above need the
      // hip/elbow/DNA triad; Working class also needs a working title.
      // Single source of truth shared with the exhibitor checkout path.
      if (show.showRuleset === 'wusv') {
        const svProfile = await ctx.db.query.dogSvProfile.findFirst({
          where: eq(dogSvProfile.dogId, dog.id),
        });
        const missing = svEntryMissingRequirements({
          dog,
          svProfile,
          classNames: selectedClasses
            .map((sc) => sc.classDefinition?.name)
            .filter((n): n is string => !!n),
        });
        if (missing.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: svEntryBlockedMessage(dog.registeredName, missing),
          });
        }
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
              organisation: { columns: publicOrgColumns },
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
          // Order status lets us separate abandoned checkouts (pending entry
          // on an unpaid order) from real entries (Amanda 2026-05-28).
          order: { columns: { id: true, status: true } },
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

      // An abandoned checkout leaves a 'pending' entry on an unpaid
      // ('pending_payment'/'failed') order. Amanda 2026-05-28: these should
      // NOT appear as real entries — surface them separately so the page can
      // show a gentle "your entry isn't finished" notice with a link back to
      // complete it, rather than a confusing pending row.
      const isUnfinished = (item: (typeof items)[number]) =>
        item.status === 'pending' &&
        (item.order?.status === 'pending_payment' || item.order?.status === 'failed');

      const withPhoto = items.map((item) => ({
        ...item,
        dogPhotoUrl: item.dogId ? photoMap.get(item.dogId) ?? null : null,
      }));

      return {
        items: withPhoto.filter((item) => !isUnfinished(item)),
        unfinished: withPhoto
          .filter(isUnfinished)
          .map((item) => ({
            id: item.id,
            showId: item.showId,
            showName: item.show?.name ?? 'this show',
            showSlug: item.show?.slug ?? item.showId,
            dogName: item.dog?.registeredName ?? 'your dog',
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
              organisation: { columns: publicOrgColumns },
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

      // The owner can always see their own entry. Anyone else must have
      // secretary access to THIS show's organisation — a global 'secretary'
      // role is NOT enough (per-org access lives in the memberships table),
      // else a secretary at one club could read another club's entered dogs
      // (a pre-judging privacy risk). Mirrors getForShow's verifyShowAccess.
      const isAdmin = ctx.session.user.role === 'admin';
      if (entry.exhibitorId !== ctx.session.user.id && !isAdmin) {
        await verifyShowAccess(ctx.db, ctx.session.user.id, entry.show.id, {
          callerIsAdmin: isAdmin,
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

      // Entries don't belong in the secretary's list when their order is:
      //  - refunded  (exhibitor pulled out + got their money back), or
      //  - unpaid    (pending_payment / failed — an abandoned checkout that
      //               was never booked in; Amanda 2026-05-28).
      // The rows stay in the DB for audit; the Financial tab surfaces refunds.
      //
      // EXCEPTION: when the secretary explicitly asks for the "pending"
      // (awaiting-payment) list — via the Pending status filter — surface the
      // pending_payment-order entries so she can see WHO started but hasn't paid
      // and chase them (Mandy 2026-07-20; the filter used to return nothing).
      // Refunded/failed stay hidden either way.
      const excludedStatuses =
        input.status === 'pending'
          ? (['refunded', 'failed'] as const)
          : (['refunded', 'pending_payment', 'failed'] as const);
      const excludedOrderRows = await ctx.db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.showId, input.showId),
            inArray(orders.status, [...excludedStatuses]),
          ),
        );
      const excludedOrderIds = excludedOrderRows.map((r) => r.id);

      const conditions = [
        eq(entries.showId, input.showId),
        isNull(entries.deletedAt),
      ];

      if (excludedOrderIds.length > 0) {
        // NULL NOT IN (...) evaluates to NULL (not TRUE) in Postgres, so a bare
        // notInArray silently drops every entry with a NULL order_id (NFC /
        // pending / legacy rows) from BOTH the list and the count. Keep them.
        conditions.push(
          or(
            isNull(entries.orderId),
            notInArray(entries.orderId, excludedOrderIds),
          )!,
        );
      }

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
        with: { classDefinition: { columns: { type: true, name: true } } },
      });

      if (newClasses.length !== input.classIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more classes are invalid',
        });
      }

      const oldFee = entry.totalFee;

      // Recompute fees via the shared service. When this entry is part of
      // an order we also load the order's discount-group + sibling entries
      // so the multi-dog package re-slots correctly. Without an order we
      // still use the service — it cleanly handles the simple single-entry
      // ladder case.
      const orderId = entry.orderId;
      let newFee: number;
      let perClassFees: number[];

      const regionalCfg =
        entry.show.showRuleset === 'wusv' ? entry.show.regionalFeeConfig : null;

      if (regionalCfg != null) {
        // Regional (SV/WUSV) edit — price on the per-dog tier scale, NOT the raw
        // class fee (Mandy 2026-07-02). Checkout runs this engine but edits used
        // to fall through to the legacy per-class sum, so swapping a class
        // demanded a bogus top-up (a 3rd dog priced £16 jumped to £20). We
        // recompute the WHOLE order with the new class and let the edited entry
        // absorb the order-total delta, leaving siblings untouched: regional
        // per-dog attribution is order-arbitrary, so a swap that doesn't change
        // the order total costs nothing and moves no other dog's fee.
        const membershipOptions = regionalCfg.memberships ?? [
          { label: 'BRG/League member' },
        ];

        type RegSib = {
          id: string;
          entryType: string;
          totalFee: number;
          entryClasses: {
            showClass?: {
              entryFee: number;
              classDefinition?: { name: string | null; type: string | null } | null;
            } | null;
          }[];
        };

        // Reconstruct the exact context checkout used: the order's declared
        // membership + first-time status (persisted on the order) and every
        // sibling entry so the scale total is computed across the full order.
        let regionalMembershipLabel: string | null = null;
        let regionalFirstTime = false;
        let siblingEntries: RegSib[] = [
          {
            id: input.id,
            entryType: entry.entryType,
            totalFee: entry.totalFee,
            entryClasses: [],
          },
        ];

        if (orderId) {
          const [orderRow, dbSiblings] = await Promise.all([
            ctx.db.query.orders.findFirst({
              where: eq(orders.id, orderId),
              columns: {
                regionalMembership: true,
                regionalFirstTimeExhibitor: true,
              },
            }),
            ctx.db.query.entries.findMany({
              where: and(eq(entries.orderId, orderId), isNull(entries.deletedAt)),
              with: {
                entryClasses: {
                  columns: { id: true },
                  with: {
                    showClass: {
                      columns: { entryFee: true },
                      with: { classDefinition: { columns: { name: true, type: true } } },
                    },
                  },
                },
              },
            }),
          ]);
          regionalMembershipLabel = orderRow?.regionalMembership ?? null;
          regionalFirstTime = !!orderRow?.regionalFirstTimeExhibitor;
          siblingEntries = dbSiblings as RegSib[];
        }

        const declared = regionalMembershipLabel
          ? membershipOptions.find((m) => m.label === regionalMembershipLabel)
          : undefined;
        const regionalCtx: RegionalFeeContext = {
          tiers: declared?.tiers ?? regionalCfg.tiers,
          isMember: !!declared && !declared.tiers,
          firstTimeExhibitor: regionalFirstTime && !!regionalCfg.firstTimeEnabled,
          firstTimeFeePence: regionalCfg.firstTimeFeePence ?? 0,
          juniorHandlerFeePence: entry.show.juniorHandlerFee ?? 0,
        };

        // Regional dogs sit in one class. Use the NEW class for the edited entry,
        // each sibling's existing class for the rest. Flat detection uses the
        // config tiers exactly as checkout does (`resolveClassFlatFee`).
        const regionalEntries: RegionalDogEntryInput[] = siblingEntries.map((sib) => {
          const isEdited = sib.id === input.id;
          const cls = isEdited
            ? {
                name: newClasses[0]?.classDefinition?.name,
                type: newClasses[0]?.classDefinition?.type,
                entryFee: newClasses[0]?.entryFee,
              }
            : {
                name: sib.entryClasses[0]?.showClass?.classDefinition?.name,
                type: sib.entryClasses[0]?.showClass?.classDefinition?.type,
                entryFee: sib.entryClasses[0]?.showClass?.entryFee,
              };
          return {
            key: sib.id,
            kind:
              (isEdited ? entry.entryType : sib.entryType) === 'junior_handler'
                ? 'junior_handler'
                : 'standard',
            flatFeePence: regionalClassFlatFee(
              { className: cls.name, classType: cls.type, entryFee: cls.entryFee ?? null },
              regionalCfg.tiers,
            ),
          };
        });

        const regionalResult = computeRegionalOrderFees(regionalEntries, regionalCtx);
        const newOrderTotal = regionalResult.entriesTotal;
        const oldOrderTotal = siblingEntries.reduce((sum, s) => sum + s.totalFee, 0);
        // The edited entry absorbs the whole order delta; siblings stay put. So
        // feeDiff (= newFee − oldFee, below) is exactly the order-level change,
        // and the existing upgrade/downgrade + refund path handles it unchanged.
        newFee = oldFee + (newOrderTotal - oldOrderTotal);
        // Regional entries carry one fee per dog — attribute it to the first
        // class slot (0 for any extra NFC classes) so the rows sum to newFee.
        perClassFees = newClasses.map((_, i) => (i === 0 ? newFee : 0));
      } else if (entry.show.firstEntryFee != null) {
        const entryKind = entry.entryType === 'junior_handler'
          ? 'junior_handler'
          : entry.isNfc
            ? 'nfc'
            : 'standard';

        let discountGroup: FeeContext['discountGroup'] = null;
        type SiblingClass = { id: string; showClass?: { entryFee: number; classDefinition?: { type: string } | null } | null };
        let siblingEntries: { id: string; entryType: string; isNfc: boolean; entryClasses: SiblingClass[]; totalFee: number }[] = [
          {
            id: input.id,
            entryType: entry.entryType,
            isNfc: entry.isNfc,
            entryClasses: newClasses.map((_, i) => ({ id: `c${i}` })),
            totalFee: entry.totalFee,
          },
        ];

        if (orderId) {
          const [orderRow, dbSiblings] = await Promise.all([
            ctx.db.query.orders.findFirst({
              where: eq(orders.id, orderId),
              columns: { discountGroupId: true },
            }),
            ctx.db.query.entries.findMany({
              where: and(eq(entries.orderId, orderId), isNull(entries.deletedAt)),
              with: {
                entryClasses: {
                  columns: { id: true },
                  with: { showClass: { columns: { entryFee: true }, with: { classDefinition: { columns: { type: true } } } } },
                },
              },
            }),
          ]);
          siblingEntries = dbSiblings;

          if (orderRow?.discountGroupId) {
            const dg = await ctx.db.query.showDiscountGroups.findFirst({
              where: eq(showDiscountGroups.id, orderRow.discountGroupId),
            });
            if (dg) {
              discountGroup = {
                firstEntryFeePence: dg.firstEntryFeePence,
                multiDogPackagePence: dg.multiDogPackagePence,
              };
            }
          }
        }

        const feeCtx: FeeContext = {
          firstEntryFeePence: entry.show.firstEntryFee,
          subsequentEntryFeePence: entry.show.subsequentEntryFee,
          nfcEntryFeePence: entry.show.nfcEntryFee,
          juniorHandlerFeePence: entry.show.juniorHandlerFee,
          multiDogThreshold: entry.show.multiDogThreshold,
          multiDogPackagePence: entry.show.multiDogPackagePence,
          discountGroup,
        };

        // Special Award Classes charge their own fee, not the tier (Mandy
        // 2026-07-19). The edited entry's specials come from newClasses; each
        // sibling's from its loaded show classes.
        const specialFeesFor = (e: (typeof siblingEntries)[number]): (number | null)[] =>
          e.id === input.id
            ? newClasses.map((sc) => (sc.classDefinition?.type === 'special' ? sc.entryFee : null))
            : e.entryClasses.map((ec) =>
                ec.showClass?.classDefinition?.type === 'special' ? ec.showClass.entryFee : null,
              );
        const dogEntries: DogEntryInput[] = siblingEntries.map((e) => ({
          key: e.id,
          kind: (e.id === input.id ? entryKind : e.entryType === 'junior_handler'
            ? 'junior_handler'
            : e.isNfc
              ? 'nfc'
              : 'standard'),
          classCount: e.id === input.id ? newClasses.length : e.entryClasses.length,
          specialClassFees: specialFeesFor(e),
        }));

        const result = computeOrderFees(dogEntries, feeCtx);
        const myBreak = result.perEntry.find((b) => b.key === input.id)!;
        newFee = myBreak.fee;
        perClassFees = myBreak.perClassFees;

        // Re-slot sibling fees only when an order exists — the multi-dog
        // package may have shifted across rounding. Skip for a deferred upgrade
        // (newFee > oldFee): siblings must not move until the adjustment is paid.
        if (orderId && newFee <= oldFee) {
          for (const sib of siblingEntries) {
            if (sib.id === input.id) continue;
            const sibBreak = result.perEntry.find((b) => b.key === sib.id);
            if (sibBreak && sibBreak.fee !== sib.totalFee) {
              await ctx.db
                .update(entries)
                .set({ totalFee: sibBreak.fee })
                .where(eq(entries.id, sib.id));
            }
          }
        }
      } else {
        // Legacy per-class fallback for shows that never set show-level fees.
        newFee = newClasses.reduce((sum, sc) => sum + sc.entryFee, 0);
        perClassFees = newClasses.map((sc) => sc.entryFee);
      }

      const feeDiff = newFee - oldFee;

      const oldClassIds = entry.entryClasses.map((ec) => ec.showClassId);

      // Apply the new class list + fee. For an UPGRADE (feeDiff > 0) this is
      // NOT called here — it's deferred until the adjustment payment succeeds
      // (applied by the Stripe webhook), so an abandoned top-up can't leave the
      // exhibitor with upgraded classes for free + overstated club revenue.
      const applyClassChange = async () => {
        await ctx.db
          .delete(entryClasses)
          .where(eq(entryClasses.entryId, input.id));

        await ctx.db.insert(entryClasses).values(
          newClasses.map((sc, idx) => ({
            entryId: input.id,
            showClassId: sc.id,
            fee: perClassFees[idx] ?? sc.entryFee,
          }))
        );

        await ctx.db
          .update(entries)
          .set({ totalFee: newFee })
          .where(eq(entries.id, input.id));
      };

      // NB: the audit-log entry is written where the change actually lands:
      // immediately (else branch) for a downgrade/no-change, or by the Stripe
      // webhook on payment success for a deferred upgrade. Writing it here would
      // log a "classes_changed" that never happens if the top-up is abandoned.

      let paymentResult: { requiresPayment: boolean; clientSecret?: string } = {
        requiresPayment: false,
      };

      // Handle fee difference
      if (feeDiff > 0) {
        // UPGRADE: additional payment needed. Platform-mode charge — money
        // lands in Remi's balance, we include the diff in the next payout to
        // the club. The new classes/fee are DEFERRED: they travel in the
        // PaymentIntent metadata and are applied by the webhook on success, so
        // an abandoned top-up leaves the entry exactly as it was (no free
        // upgrade, no overstated club revenue).
        const platformFeePence = calculatePlatformFee(feeDiff);
        const grossAmount = feeDiff + platformFeePence;

        // classIds + per-class fees travel in Stripe metadata (string values,
        // 500-char limit). Realistic entries are a handful of classes; refuse
        // the rare oversize case rather than truncate and corrupt the change.
        const pendingClassIds = input.classIds.join(',');
        const pendingPerClassFees = perClassFees.join(',');
        if (pendingClassIds.length > 480 || pendingPerClassFees.length > 480) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Too many classes to adjust online — please contact the show secretary.',
          });
        }

        const pi = await createPaymentIntent(grossAmount, {
          entryId: input.id,
          showId: entry.showId,
          exhibitorId: ctx.session.user.id,
          type: 'adjustment',
          platformFeePence: String(platformFeePence),
          subtotalPence: String(feeDiff),
          pendingClassIds,
          pendingPerClassFees,
          pendingFee: String(newFee),
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
        // NB: applyClassChange() intentionally NOT called — deferred to webhook.
      } else {
        // Downgrade or no change — safe to apply the class change immediately.
        await applyClassChange();

        // Audit the change now that it has actually landed (an upgrade is
        // audited by the webhook instead, on payment success).
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

        if (feeDiff < 0) {
          // Refund the reduction via the shared helper so the original payment's
          // refundAmount, the refund row's orderId, and the payment status are all
          // updated consistently. The previous ad-hoc stripe.refunds.create +
          // manual insert never incremented refundAmount and left orderId null,
          // which silently desynced the books (enabling later over-refunds and
          // club over-payouts via show-metrics skipping the orphan row).
          let originalPayment = entry.payments.find(
            (p) =>
              (p.status === 'succeeded' || p.status === 'partially_refunded') &&
              p.stripePaymentId
          );

          if (!originalPayment && entry.orderId) {
            originalPayment = await ctx.db.query.payments.findFirst({
              where: and(
                eq(payments.orderId, entry.orderId),
                inArray(payments.status, ['succeeded', 'partially_refunded']),
              ),
            }) ?? undefined;
          }

          if (originalPayment?.stripePaymentId) {
            await executeStripeRefund(ctx.db, originalPayment, {
              amountPence: Math.abs(feeDiff),
              entryId: input.id,
            });
          }
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
