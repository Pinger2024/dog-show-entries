import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, or, eq, isNull, inArray, notInArray, asc, desc, sql } from 'drizzle-orm';
import { differenceInWeeks } from 'date-fns';
import {
  protectedProcedure,
  secretaryProcedure,
} from '../procedures';
import { createTRPCRouter } from '../init';
import { countPriorRegionalPayingDogs } from '@/server/services/regional-pricing';
import { priceEntryClassChange } from '@/server/services/entry-change-pricing';
import { entryWindowOpen } from '@/lib/show-status';
import { priorPackageStanding } from '@/server/services/package-pricing';
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
  dogSvProfile,
} from '@/server/db/schema';
import {
  createPaymentIntent,
  calculatePlatformFee,
} from '@/server/services/stripe';
import { executeStripeRefund } from '@/server/services/stripe-refunds';
import { svEntryMissingRequirements, svEntryBlockedMessage } from '@/lib/sv-entry-validation';
import { pedigreeMissingForEntry } from '@/lib/sv-entry-readiness';
import { hasJudgingConflict } from '@/lib/judge-exhibitor-conflict';
import { getCompetitionAgeError, isOldEnoughForNfc, nfcMinAgeMessage } from '@/lib/date-utils';
import { svCoatDisplayName } from '@/lib/class-labels';
import { dogAccessCondition } from '@/server/dog-access';

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
      // Validate dog belongs to (or is co-owned by) the caller
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(
          eq(dogs.id, input.dogId),
          dogAccessCondition(ctx.db, ctx.session.user.id),
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

      // Baseline pedigree check — sire, dam, breeder and colour all print in
      // the show catalogue, so a dog can't be entered anywhere without them.
      // This endpoint always creates a standard (dog-attached) entry — there
      // is no Junior Handler branch here to skip. Deliberately applies to
      // NFC entries too: NFC dogs still appear in the printed catalogue, so
      // the catalogue-completeness reason for this check applies just the
      // same (unlike the SV/WUSV health-and-coat gate above, which is about
      // competition eligibility and rightly skips NFC).
      const entryPedigreeMissing = pedigreeMissingForEntry({
        sireName: dog.sireName,
        damName: dog.damName,
        breederName: dog.breederName,
        colour: dog.colour,
      });
      if (entryPedigreeMissing.length > 0) {
        const dogName = dog.registeredName ?? 'This dog';
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${dogName} can't be entered yet — please add ${entryPedigreeMissing.join(', ')}. These print in the show catalogue.`,
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

      // ONE owner for "is this show still accepting entries" — entryWindowOpen
      // (lib/show-status.ts). Also used by orders.checkout, priceEntryClassChange
      // (class-change top-ups) and priceOrderExtras (extras purchases).
      if (!entryWindowOpen(show)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Show is not accepting entries',
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
          // NFC entries: minimum 12 weeks (RKC 2026 regulations). ONE
          // owner — src/lib/date-utils.ts (CLAUDE.md, "One owner per rule").
          if (!isOldEnoughForNfc(dob, showDate)) {
            const ageWeeks = differenceInWeeks(showDate, dob);
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: nfcMinAgeMessage(dogName, ageWeeks),
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
            const expected = svCoatDisplayName(sc.svCoatType);
            const actual = svCoatDisplayName(dog.coatType);
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
          // Extras (add-extras-to-entry, 2026-09-21) live on the entry's
          // order — read via that one relation, never a second query.
          order: {
            with: {
              orderSundryItems: {
                with: { sundryItem: true },
              },
            },
          },
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
      // Pricing (reads only — no writes) has ONE owner: priceEntryClassChange.
      // entries.previewUpdate calls the exact same function.
      const pricing = await priceEntryClassChange(ctx.db, {
        entryId: input.id,
        classIds: input.classIds,
        userId: ctx.session.user.id,
      });
      const { entry, newClasses, oldFee, newFee, feeDiff, perClassFees } = pricing;

      // Re-slot sibling fees computed by the pricing function — applied here,
      // not there, because priceEntryClassChange performs no writes.
      for (const sib of pricing.siblingFeeUpdates) {
        await ctx.db
          .update(entries)
          .set({ totalFee: sib.fee })
          .where(eq(entries.id, sib.id));
      }

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

  /**
   * Read-only preview of what changing an entry's classes would cost — the
   * SAME computation `update` charges (`priceEntryClassChange`, ONE owner).
   * The edit page uses this instead of hand-summing class fees client-side,
   * which used to disagree with the server on first/subsequent tiers, the
   * regional scale, discounts and the multi-dog package. No writes.
   */
  previewUpdate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        classIds: z.array(z.string().uuid()).min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const pricing = await priceEntryClassChange(ctx.db, {
        entryId: input.id,
        classIds: input.classIds,
        userId: ctx.session.user.id,
      });

      return {
        currentFee: pricing.oldFee,
        newFee: pricing.newFee,
        feeDiff: pricing.feeDiff,
        requiresPayment: pricing.requiresPayment,
      };
    }),

  // ── Validate exhibitor profile for entry ──────────────────

  /**
   * Paying dogs this exhibitor already has at this show — what the regional
   * scale starts from. The enter-page fee preview needs it so the price shown
   * matches the price charged (same ONE owner as checkout: a 3rd dog quoted at
   * £20 and charged £16 is its own kind of wrong).
   */
  regionalPriorDogCount: protectedProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) =>
      countPriorRegionalPayingDogs(ctx.db, {
        showId: input.showId,
        exhibitorId: ctx.session.user.id,
      }),
    ),

  /**
   * The exhibitor's dogs already entered at this show for the RKC multi-dog
   * package — the enter-page preview needs it so the price shown matches the
   * price charged (same ONE owner as checkout). Zero when the show has no
   * package.
   */
  packagePriorStanding: protectedProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { multiDogThreshold: true, firstEntryFee: true, subsequentEntryFee: true },
      });
      if (!show) return { payingDogCount: 0, firstClassPaidPence: 0 };
      return priorPackageStanding(ctx.db, {
        showId: input.showId,
        exhibitorId: ctx.session.user.id,
        show,
      });
    }),

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
