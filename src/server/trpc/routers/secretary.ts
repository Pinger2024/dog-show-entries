import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, sql, isNull, isNotNull, inArray, asc, desc, ilike } from 'drizzle-orm';
import { secretaryProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { verifyShowAccess } from '../verify-show-access';
import { verifyOrgAccess } from '../verify-org-access';
import { getBaseUrl } from '@/server/lib/utils';
import { ACHIEVEMENT_TYPES } from '@/lib/placements';
import {
  shows,
  entries,
  entryClasses,
  organisations,
  venues,
  classDefinitions,
  memberships,
  showClasses,
  payments,
  dogOwners,
  dogs,
  entryAuditLog,
  orders,
  stewardAssignments,
  stewardBreedAssignments,
  users,
  judges,
  judgeAssignments,
  judgeContracts,
  rings,
  breeds,
  showChecklistItems,
  sundryItems,
  orderSundryItems,
  sponsors,
  showSponsors,
  classSponsorships,
  organisationPeople,
  achievements,
} from '@/server/db/schema';
import {
  DEFAULT_CHECKLIST_ITEMS,
  calculateDueDate,
} from '@/lib/default-checklist';
import { getStripe } from '@/server/services/stripe';
import { executeStripeRefund } from '@/server/services/stripe-refunds';
import { penceToPoundsString } from '@/lib/date-utils';
import { Resend } from 'resend';
import { searchKcJudges, fetchKcJudgeProfile } from '@/server/services/kc-judges';
import { ensureCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { generateJudgeContractPdf } from '@/server/services/judge-contract-pdf';
import { CATALOGUE_NAME_PATTERN, isCatalogueItem } from '@/lib/catalogue-utils';
import {
  aggregateShowMetrics,
  computeShowMetrics,
  computeShowsMetrics,
  getPaidOrderIdsForShow,
} from '@/server/services/show-metrics';

/** Build human-readable breed text for judge offer emails.
 *  When assignments have breedId=null, falls back to showBreedNames, then showName. */
function buildJudgeBreedText(
  assignments: { breed?: { name: string } | null; sex: string | null }[],
  showBreedNames: string[],
  showName?: string,
): string {
  const fallbackName = showBreedNames.length > 0
    ? showBreedNames.join(', ')
    : (showName ?? 'All breeds');
  const parts: string[] = [];
  for (const a of assignments) {
    const name = a.breed?.name ?? fallbackName;
    const suffix = a.sex === 'dog' ? ' (Dogs)' : a.sex === 'bitch' ? ' (Bitches)' : '';
    parts.push(name + suffix);
  }
  return [...new Set(parts)].join(', ') || 'All breeds';
}

/**
 * Derive a sundry row's status from the entries in the same order
 * rather than the order's payment status. The order might be
 * 'pending_payment' because the exhibitor abandoned checkout, but
 * if the entry itself was withdrawn the sundries were withdrawn
 * with it — showing "Pending" would misrepresent the state.
 * Preference: confirmed > withdrawn > pending.
 */
function statusFromEntries(orderEntries: ReadonlyArray<{ status: string }>): string {
  if (orderEntries.some((e) => e.status === 'confirmed')) return 'confirmed';
  if (orderEntries.every((e) => e.status === 'withdrawn')) return 'withdrawn';
  return orderEntries[0]?.status ?? 'pending';
}

export const secretaryRouter = createTRPCRouter({
  getDashboard: secretaryProcedure.query(async ({ ctx }) => {
    // Get organisations the user is a member of
    const userMemberships = await ctx.db.query.memberships.findMany({
      where: and(
        eq(memberships.userId, ctx.session.user.id),
        eq(memberships.status, 'active')
      ),
      with: { organisation: true },
    });

    const orgIds = userMemberships.map((m) => m.organisationId);

    if (orgIds.length === 0) {
      return {
        organisations: [],
        activeShows: [],
        pastShows: [],
        totalShows: 0,
        activeShowsCount: 0,
        totalEntries: 0,
        activeRevenue: 0,
        totalRevenue: 0,
      };
    }

    // Get all shows for the user's organisations
    const orgShows = await ctx.db.query.shows.findMany({
      where: inArray(shows.organisationId, orgIds),
      with: {
        organisation: true,
        venue: true,
      },
      orderBy: (shows, { desc }) => [desc(shows.startDate)],
    });

    // Split into active vs past/cancelled
    const inactiveStatuses = ['completed', 'cancelled'];
    const activeShows = orgShows.filter(
      (s) => !inactiveStatuses.includes(s.status)
    );
    const pastShows = orgShows.filter((s) =>
      inactiveStatuses.includes(s.status)
    );

    // Canonical metrics for all org shows — one batched call, paid-only
    // revenue (sundries included, net of refunds).
    const activeShowIds = activeShows.map((s) => s.id);
    const allShowIds = orgShows.map((s) => s.id);
    const metricsByShow = await computeShowsMetrics(ctx.db, allShowIds);

    let totalEntries = 0;
    let activeRevenue = 0;
    let totalRevenue = 0;
    for (const showId of allShowIds) {
      const m = metricsByShow.get(showId);
      if (!m) continue;
      const entryCount = m.confirmedEntryCount + m.pendingEntryCount;
      totalEntries += entryCount;
      totalRevenue += m.clubReceivablePence;
      if (activeShowIds.includes(showId)) {
        activeRevenue += m.clubReceivablePence;
      }
    }

    const enrichShow = (s: (typeof orgShows)[number]) => {
      const m = metricsByShow.get(s.id);
      return {
        ...s,
        entryCount: m ? m.confirmedEntryCount + m.pendingEntryCount : 0,
        showRevenue: m?.clubReceivablePence ?? 0,
      };
    };

    return {
      organisations: userMemberships.map((m) => m.organisation),
      activeShows: activeShows.map(enrichShow),
      pastShows: pastShows.map(enrichShow),
      totalShows: orgShows.length,
      activeShowsCount: activeShows.length,
      totalEntries,
      activeRevenue,
      totalRevenue,
    };
  }),

  getOrganisation: secretaryProcedure
    .input(z.object({ organisationId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // If an explicit org id is passed, return that one (gated on
      // active membership). Otherwise fall back to the user's first
      // active membership — legacy behaviour for callers that haven't
      // been migrated to pass the active-org id yet.
      if (input?.organisationId) {
        const membership = await ctx.db.query.memberships.findFirst({
          where: and(
            eq(memberships.userId, ctx.session.user.id),
            eq(memberships.organisationId, input.organisationId),
            eq(memberships.status, 'active')
          ),
          with: { organisation: true },
        });
        return membership?.organisation ?? null;
      }
      const membership = await ctx.db.query.memberships.findFirst({
        where: and(
          eq(memberships.userId, ctx.session.user.id),
          eq(memberships.status, 'active')
        ),
        with: { organisation: true },
      });
      return membership?.organisation ?? null;
    }),

  /** List active members of an organisation (for secretary picker, etc.) */
  orgMembers: secretaryProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Single query: fetch all active members and verify caller is among them
      const members = await ctx.db.query.memberships.findMany({
        where: and(
          eq(memberships.organisationId, input.organisationId),
          eq(memberships.status, 'active')
        ),
        with: {
          user: {
            columns: { id: true, name: true, email: true, phone: true, address: true, postcode: true },
          },
        },
      });

      if (!members.some((m) => m.userId === ctx.session.user.id)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this organisation' });
      }

      return members.map((m) => m.user);
    }),

  /** Update a secretary user's contact details (syncs back to their user record) */
  updateSecretaryUser: secretaryProcedure
    .input(z.object({
      userId: z.string().uuid(),
      name: z.string().nullable().optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      postcode: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId, ...updates } = input;
      const setData: Record<string, string | null> = {};
      if (updates.name !== undefined) setData.name = updates.name;
      if (updates.phone !== undefined) setData.phone = updates.phone;
      if (updates.address !== undefined) setData.address = updates.address;
      if (updates.postcode !== undefined) setData.postcode = updates.postcode;

      if (Object.keys(setData).length > 0) {
        await ctx.db.update(users).set(setData).where(eq(users.id, userId));
      }

      return { success: true };
    }),

  getShowStats: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const [metrics, classCount] = await Promise.all([
        computeShowMetrics(ctx.db, input.showId),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(showClasses)
          .where(eq(showClasses.showId, input.showId)),
      ]);

      // "Active" revenue is paid-orders-only, net of refunds, INCLUDING
      // sundry items (catalogues, donations, sponsorships). See the
      // show-metrics service for the canonical definition.
      return {
        // Revenue (paid only, sundry-inclusive)
        clubReceivablePence: metrics.clubReceivablePence,
        paidEntryFeesPence: metrics.paidEntryFeesPence,
        paidSundryRevenuePence: metrics.paidSundryRevenuePence,
        paidPlatformFeePence: metrics.paidPlatformFeePence,
        grossChargedPence: metrics.grossChargedPence,
        refundedPence: metrics.refundedPence,
        pendingClubReceivablePence: metrics.pendingClubReceivablePence,
        pendingPlatformFeePence: metrics.pendingPlatformFeePence,
        // Entry counts
        confirmedEntries: metrics.confirmedEntryCount,
        pendingEntries: metrics.pendingEntryCount,
        withdrawnEntries: metrics.withdrawnEntryCount,
        totalEntries: metrics.confirmedEntryCount + metrics.pendingEntryCount + metrics.withdrawnEntryCount,
        // Catalogue counts (paid only)
        paidPrintedCatalogueCount: metrics.paidPrintedCatalogueCount,
        paidOnlineCatalogueCount: metrics.paidOnlineCatalogueCount,
        // Class count
        totalClasses: Number(classCount[0]?.count ?? 0),
        // Back-compat alias — totalRevenue now means "club receivable, paid-only"
        totalRevenue: metrics.clubReceivablePence,
      };
    }),

  listVenues: secretaryProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyOrgAccess(ctx.db, ctx.session.user.id, input.organisationId);
      return ctx.db.query.venues.findMany({
        where: eq(venues.organisationId, input.organisationId),
        orderBy: (venues, { asc }) => [asc(venues.name)],
      });
    }),

  createVenue: secretaryProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        address: z.string().optional(),
        postcode: z.string().optional(),
        indoorOutdoor: z.string().optional(),
        organisationId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyOrgAccess(ctx.db, ctx.session.user.id, input.organisationId);

      // Auto-geocode from postcode for "Near Me" feature
      let lat: string | null = null;
      let lng: string | null = null;
      if (input.postcode) {
        try {
          const cleaned = input.postcode.trim().replace(/\s+/g, '');
          const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`, {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.status === 200 && data.result) {
              lat = String(data.result.latitude);
              lng = String(data.result.longitude);
            }
          }
        } catch {
          // Geocoding failed — venue will work without coordinates
        }
      }

      const [venue] = await ctx.db
        .insert(venues)
        .values({ ...input, lat, lng })
        .returning();
      return venue!;
    }),

  updateVenue: secretaryProcedure
    .input(
      z.object({
        venueId: z.string().uuid(),
        imageUrl: z.string().nullable().optional(),
        imageStorageKey: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { venueId, ...rest } = input;
      // Verify the caller's org owns this venue
      const venue = await ctx.db.query.venues.findFirst({
        where: eq(venues.id, venueId),
        columns: { organisationId: true },
      });
      if (!venue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Venue not found' });
      }
      if (venue.organisationId) {
        await verifyOrgAccess(ctx.db, ctx.session.user.id, venue.organisationId);
      }
      const [updated] = await ctx.db
        .update(venues)
        .set(rest)
        .where(eq(venues.id, venueId))
        .returning();
      return updated!;
    }),

  // ── Organisation People (My Club) ──────────────────────────
  listOrgPeople: secretaryProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyOrgAccess(ctx.db, ctx.session.user.id, input.organisationId);
      return ctx.db.query.organisationPeople.findMany({
        where: eq(organisationPeople.organisationId, input.organisationId),
        orderBy: (op, { asc }) => [asc(op.name)],
      });
    }),

  createOrgPerson: secretaryProcedure
    .input(z.object({
      organisationId: z.string().uuid(),
      name: z.string().min(1).max(255),
      position: z.string().max(100).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(50).optional(),
      address: z.string().optional(),
      isGuarantor: z.boolean().default(false),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyOrgAccess(ctx.db, ctx.session.user.id, input.organisationId);
      const [person] = await ctx.db.insert(organisationPeople).values(input).returning();
      return person!;
    }),

  updateOrgPerson: secretaryProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      position: z.string().max(100).nullable().optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().max(50).nullable().optional(),
      address: z.string().nullable().optional(),
      isGuarantor: z.boolean().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const person = await ctx.db.query.organisationPeople.findFirst({
        where: eq(organisationPeople.id, id),
      });
      if (!person) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyOrgAccess(ctx.db, ctx.session.user.id, person.organisationId);
      const [updated] = await ctx.db.update(organisationPeople).set(rest).where(eq(organisationPeople.id, id)).returning();
      return updated!;
    }),

  deleteOrgPerson: secretaryProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const person = await ctx.db.query.organisationPeople.findFirst({
        where: eq(organisationPeople.id, input.id),
      });
      if (!person) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyOrgAccess(ctx.db, ctx.session.user.id, person.organisationId);
      await ctx.db.delete(organisationPeople).where(eq(organisationPeople.id, input.id));
      return { deleted: true };
    }),

  listClassDefinitions: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.classDefinitions.findMany({
      orderBy: (cd, { asc }) => [asc(cd.sortOrder), asc(cd.name)],
    });
  }),

  updateOrganisation: secretaryProcedure
    .input(
      z.object({
        organisationId: z.string().uuid(),
        name: z.string().min(1).max(200),
        contactEmail: z.string().email().nullish(),
        contactPhone: z.string().max(30).nullish(),
        website: z.string().url().nullish(),
        logoUrl: z.string().url().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyOrgAccess(ctx.db, ctx.session.user.id, input.organisationId);

      const [updated] = await ctx.db
        .update(organisations)
        .set({
          name: input.name,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          website: input.website ?? null,
          logoUrl: input.logoUrl ?? null,
        })
        .where(eq(organisations.id, input.organisationId))
        .returning();
      return updated!;
    }),

  /**
   * Get the club's current payout bank details. Returned as the full
   * sort code + account number — the secretary is a member of the club
   * and is authorised to see these (auth check via verifyOrgAccess).
   * If you ever expose this outside the secretary context, mask the
   * middle of the account number.
   */
  getPayoutDetails: secretaryProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyOrgAccess(ctx.db, ctx.session.user.id, input.organisationId);
      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.organisationId),
        columns: {
          payoutAccountName: true,
          payoutSortCode: true,
          payoutAccountNumber: true,
        },
      });
      return {
        accountName: org?.payoutAccountName ?? null,
        sortCode: org?.payoutSortCode ?? null,
        accountNumber: org?.payoutAccountNumber ?? null,
      };
    }),

  /**
   * Save the club's payout bank details. We validate the shape (UK sort
   * code 6 digits, account number 8 digits) but don't verify the account
   * exists — that gets confirmed the first time we send a payment and
   * it either lands or bounces.
   *
   * All three fields must be provided together. Partial updates don't
   * make sense for bank details — you either have a full set or you
   * don't.
   */
  updatePayoutDetails: secretaryProcedure
    .input(
      z.object({
        organisationId: z.string().uuid(),
        accountName: z.string().min(1).max(140),
        sortCode: z
          .string()
          .regex(/^\d{2}-?\d{2}-?\d{2}$/, 'Sort code must be 6 digits (e.g. 10-88-00)'),
        accountNumber: z
          .string()
          .regex(/^\d{8}$/, 'Account number must be exactly 8 digits'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyOrgAccess(ctx.db, ctx.session.user.id, input.organisationId);
      // Normalise the sort code to hyphenated form so storage matches
      // what we render back.
      const digits = input.sortCode.replace(/-/g, '');
      const normalisedSortCode = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;

      await ctx.db
        .update(organisations)
        .set({
          payoutAccountName: input.accountName,
          payoutSortCode: normalisedSortCode,
          payoutAccountNumber: input.accountNumber,
        })
        .where(eq(organisations.id, input.organisationId));

      return { success: true };
    }),

  // ── Catalogue number assignment ────────────────────────────

  assignCatalogueNumbers: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Fetch all confirmed entries with breed + class info for ordering
      const confirmedEntries = await ctx.db.query.entries.findMany({
        where: and(
          eq(entries.showId, input.showId),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        ),
        with: {
          dog: {
            with: {
              breed: { with: { group: true } },
            },
          },
          entryClasses: {
            with: {
              showClass: true,
            },
          },
        },
        orderBy: [asc(entries.entryDate)],
      });

      // Sort by: lowest class number → group → breed → sex → entry date
      // This ensures catalogue numbers follow class order in the catalogue
      const sorted = [...confirmedEntries].sort((a, b) => {
        // First: sort by the entry's lowest class number
        const aMinClass = Math.min(
          ...a.entryClasses.map((ec) => ec.showClass?.classNumber ?? ec.showClass?.sortOrder ?? 999)
        );
        const bMinClass = Math.min(
          ...b.entryClasses.map((ec) => ec.showClass?.classNumber ?? ec.showClass?.sortOrder ?? 999)
        );
        if (aMinClass !== bMinClass) return aMinClass - bMinClass;

        // Then: group → breed → sex → entry date (as before)
        const aGroup = a.dog?.breed?.group?.sortOrder ?? 99;
        const bGroup = b.dog?.breed?.group?.sortOrder ?? 99;
        if (aGroup !== bGroup) return aGroup - bGroup;

        const aBreed = a.dog?.breed?.name ?? '';
        const bBreed = b.dog?.breed?.name ?? '';
        if (aBreed !== bBreed) return aBreed.localeCompare(bBreed);

        const sexOrder = { dog: 0, bitch: 1 };
        const aSex = a.dog?.sex ? sexOrder[a.dog.sex] : 2;
        const bSex = b.dog?.sex ? sexOrder[b.dog.sex] : 2;
        if (aSex !== bSex) return aSex - bSex;

        return new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
      });

      // Assign sequential catalogue numbers
      if (sorted.length > 0) {
        await ctx.db.transaction(async (tx) => {
          for (let i = 0; i < sorted.length; i++) {
            await tx
              .update(entries)
              .set({ catalogueNumber: String(i + 1), updatedAt: new Date() })
              .where(eq(entries.id, sorted[i].id));
          }
        });
      }

      return { assigned: sorted.length };
    }),

  // ── Catalogue data ─────────────────────────────────────────

  getCatalogueData: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Auto-assign catalogue numbers in class order the first time the
      // secretary opens the catalogue page, so they don't have to hunt
      // for a button. No-op if numbers already exist.
      await ensureCatalogueNumbers(ctx.db, input.showId);

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        with: {
          organisation: true,
          venue: true,
        },
      });

      const catalogueEntries = await ctx.db.query.entries.findMany({
        where: and(
          eq(entries.showId, input.showId),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        ),
        with: {
          dog: {
            with: {
              breed: { with: { group: true } },
              owners: { orderBy: [asc(dogOwners.sortOrder)] },
              titles: true,
            },
          },
          exhibitor: true,
          handler: true,
          juniorHandlerDetails: true,
          entryClasses: {
            with: {
              showClass: { with: { classDefinition: true } },
            },
          },
        },
        orderBy: [asc(entries.catalogueNumber)],
      });

      return { show, entries: catalogueEntries };
    }),

  getAbsenteeList: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // An absentee is only meaningful for entries that were actually paid
      // for. Withdrawn entries from abandoned checkouts (order still in
      // pending_payment) never made the catalogue.
      const paidOrderIds = await getPaidOrderIdsForShow(ctx.db, input.showId);
      if (paidOrderIds.length === 0) return [];

      return ctx.db.query.entries.findMany({
        where: and(
          eq(entries.showId, input.showId),
          inArray(entries.orderId, paidOrderIds),
          sql`(${entries.status} = 'withdrawn' OR ${entries.absent} = true)`,
          isNull(entries.deletedAt)
        ),
        with: {
          dog: {
            with: {
              breed: true,
              owners: { orderBy: [asc(dogOwners.sortOrder)] },
            },
          },
          exhibitor: true,
          entryClasses: {
            with: {
              showClass: { with: { classDefinition: true } },
            },
          },
        },
        orderBy: [asc(entries.catalogueNumber)],
      });
    }),

  // ── Reports ────────────────────────────────────────────────

  getEntryReport: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Only entries on paid orders belong in reports — abandoned
      // pending_payment checkouts produce ghost entries that inflate
      // "Total Entries" and leak non-paying exhibitors into the tally.
      const paidOrderIds = await getPaidOrderIdsForShow(ctx.db, input.showId);
      if (paidOrderIds.length === 0) return [];

      return ctx.db.query.entries.findMany({
        where: and(
          eq(entries.showId, input.showId),
          inArray(entries.orderId, paidOrderIds),
          isNull(entries.deletedAt)
        ),
        with: {
          dog: {
            with: {
              breed: { with: { group: true } },
              owners: true,
            },
          },
          exhibitor: true,
          entryClasses: {
            with: {
              showClass: { with: { classDefinition: true, breed: true } },
            },
          },
          payments: true,
        },
        orderBy: [asc(entries.entryDate)],
      });
    }),

  getPaymentReport: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const [showEntries, orderRows, sundryLines, paymentRefundRows] = await Promise.all([
        // Exclude entries on refunded orders — they'd otherwise show up
        // as "cancelled" ghost rows in the report. Refund history lives
        // on the Financial tab's refund UI.
        ctx.db.query.entries.findMany({
          where: and(
            eq(entries.showId, input.showId),
            isNull(entries.deletedAt),
            sql`(${entries.orderId} IS NULL OR ${entries.orderId} NOT IN (
              SELECT id FROM ${orders} WHERE show_id = ${input.showId} AND status = 'refunded'
            ))`
          ),
          with: { payments: true, exhibitor: true, dog: true },
        }),
        ctx.db.query.orders.findMany({
          where: eq(orders.showId, input.showId),
          with: { exhibitor: true, payments: true },
        }),
        ctx.db
          .select({
            orderId: orderSundryItems.orderId,
            itemName: sundryItems.name,
            quantity: orderSundryItems.quantity,
            unitPrice: orderSundryItems.unitPrice,
          })
          .from(orderSundryItems)
          .innerJoin(orders, eq(orderSundryItems.orderId, orders.id))
          .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
          .where(eq(orders.showId, input.showId)),
        ctx.db
          .select({
            orderId: payments.orderId,
            refundAmount: payments.refundAmount,
          })
          .from(payments)
          .innerJoin(orders, eq(payments.orderId, orders.id))
          .where(and(eq(orders.showId, input.showId), isNotNull(payments.refundAmount))),
      ]);

      // Aggregate sundries per order (one "Sundry items" row per order,
      // not per line item — matches what secretaries reconcile against
      // their bank).
      const sundryTotalsByOrder = new Map<string, number>();
      const sundryBreakdownByOrder = new Map<string, string[]>();
      for (const line of sundryLines) {
        const total = line.quantity * line.unitPrice;
        sundryTotalsByOrder.set(
          line.orderId,
          (sundryTotalsByOrder.get(line.orderId) ?? 0) + total
        );
        const arr = sundryBreakdownByOrder.get(line.orderId) ?? [];
        arr.push(`${line.itemName}${line.quantity > 1 ? ` ×${line.quantity}` : ''}`);
        sundryBreakdownByOrder.set(line.orderId, arr);
      }

      type ReportRow = {
        kind: 'entry' | 'sundry';
        id: string;
        orderId: string | null;
        exhibitor: { name: string | null; email: string | null } | null;
        itemLabel: string;
        itemDetail?: string;  // tooltip/secondary line (sundry breakdown)
        entryFee: number;
        addons: number;
        total: number;
        status: string;
        // Payments live on the order. We attach them to the LAST row of
        // each order group so they read as the order's single total
        // payment in the UI rather than repeating on every line.
        payments: Array<{ amount: number; status: string }>;
      };

      // Group visible entries by orderId so we can attach sundries and
      // payments correctly. Orders whose entries are all deleted
      // (cancelled & soft-deleted) never appear in showEntries and are
      // therefore invisible here — exactly what we want: no ghost
      // "Sundry items — Cancelled" rows for abandoned checkouts.
      const entriesByOrder = new Map<string, typeof showEntries>();
      for (const e of showEntries) {
        if (!e.orderId) continue;
        const arr = entriesByOrder.get(e.orderId) ?? [];
        arr.push(e);
        entriesByOrder.set(e.orderId, arr);
      }

      // Orders that are visible (i.e. have at least one non-deleted
      // entry), in the order they first appear in showEntries. We use
      // this ordering to group the output so each order's entries +
      // sundry row appear contiguous on screen.
      const visibleOrderIds: string[] = [];
      const seen = new Set<string>();
      for (const e of showEntries) {
        const oid = e.orderId;
        if (oid && !seen.has(oid)) {
          visibleOrderIds.push(oid);
          seen.add(oid);
        }
      }

      const orderById = new Map(orderRows.map((o) => [o.id, o] as const));
      const rows: ReportRow[] = [];

      // Also include entries with no orderId (unusual) as their own
      // rows without grouping. Preserve the historical behaviour that
      // every non-deleted entry shows up.
      for (const e of showEntries) {
        if (e.orderId) continue;
        rows.push({
          kind: 'entry',
          id: `entry-${e.id}`,
          orderId: null,
          exhibitor: e.exhibitor
            ? { name: e.exhibitor.name, email: e.exhibitor.email }
            : null,
          itemLabel: e.dog?.registeredName ?? 'Junior Handler',
          entryFee: e.totalFee,
          addons: 0,
          total: e.totalFee,
          status: e.status,
          payments: e.payments.map((p) => ({ amount: p.amount, status: p.status })),
        });
      }

      for (const orderId of visibleOrderIds) {
        const orderEntries = entriesByOrder.get(orderId) ?? [];
        const order = orderById.get(orderId);
        const sundryTotal = sundryTotalsByOrder.get(orderId) ?? 0;
        const hasSundry = sundryTotal > 0;
        const orderStatus = statusFromEntries(orderEntries);
        const orderPayments = (order?.payments ?? []).map((p) => ({
          amount: p.amount,
          status: p.status,
        }));

        // Emit entry rows for this order. Payments are attached only
        // to the LAST row of the group (sundry if present, otherwise
        // the last entry).
        orderEntries.forEach((e, idx) => {
          const isLastRowOfGroup = !hasSundry && idx === orderEntries.length - 1;
          rows.push({
            kind: 'entry',
            id: `entry-${e.id}`,
            orderId,
            exhibitor: e.exhibitor
              ? { name: e.exhibitor.name, email: e.exhibitor.email }
              : null,
            itemLabel: e.dog?.registeredName ?? 'Junior Handler',
            entryFee: e.totalFee,
            addons: 0,
            total: e.totalFee,
            status: e.status,
            payments: isLastRowOfGroup ? orderPayments : [],
          });
        });

        if (hasSundry) {
          const breakdown = sundryBreakdownByOrder.get(orderId) ?? [];
          const firstExhibitor = orderEntries[0]?.exhibitor;
          rows.push({
            kind: 'sundry',
            id: `sundry-${orderId}`,
            orderId,
            exhibitor: firstExhibitor
              ? { name: firstExhibitor.name, email: firstExhibitor.email }
              : null,
            itemLabel: 'Sundry items',
            itemDetail: breakdown.join(', '),
            entryFee: 0,
            addons: sundryTotal,
            total: sundryTotal,
            status: orderStatus,
            payments: orderPayments,
          });
        }
      }

      const metrics = aggregateShowMetrics({
        orders: orderRows.map((o) => ({
          id: o.id,
          status: o.status,
          totalAmount: o.totalAmount,
          platformFeePence: o.platformFeePence,
        })),
        entries: showEntries.map((e) => ({
          id: e.id,
          orderId: e.orderId,
          status: e.status,
          totalFee: e.totalFee,
          deletedAt: e.deletedAt,
        })),
        sundries: sundryLines,
        payments: paymentRefundRows,
      });

      return {
        rows,
        summary: {
          totalRevenue: metrics.clubReceivablePence,
          paidCount: metrics.confirmedEntryCount,
          pendingCount: metrics.pendingEntryCount,
          totalEntries: showEntries.length,
        },
      };
    }),

  getCatalogueOrders: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Find catalogue sundry items for this show
      const catalogueItems = await ctx.db
        .select({ id: sundryItems.id, name: sundryItems.name })
        .from(sundryItems)
        .where(
          and(
            eq(sundryItems.showId, input.showId),
            ilike(sundryItems.name, CATALOGUE_NAME_PATTERN)
          )
        );

      if (catalogueItems.length === 0) return { printed: [], online: [] };

      const catalogueItemIds = catalogueItems.map((i) => i.id);

      // Only paid orders count — a catalogue "order" that never paid
      // isn't an order the club needs to fulfil.
      const catalogueOrders = await ctx.db
        .select({
          itemName: sundryItems.name,
          quantity: orderSundryItems.quantity,
          exhibitorName: users.name,
          exhibitorEmail: users.email,
        })
        .from(orderSundryItems)
        .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
        .innerJoin(orders, eq(orderSundryItems.orderId, orders.id))
        .innerJoin(users, eq(orders.exhibitorId, users.id))
        .where(
          and(
            inArray(orderSundryItems.sundryItemId, catalogueItemIds),
            eq(orders.status, 'paid')
          )
        );

      const printed: { name: string; email: string; quantity: number }[] = [];
      const online: { name: string; email: string; quantity: number }[] = [];

      for (const row of catalogueOrders) {
        const entry = {
          name: row.exhibitorName ?? '—',
          email: row.exhibitorEmail,
          quantity: row.quantity,
        };
        if (row.itemName.toLowerCase().includes('print')) {
          printed.push(entry);
        } else {
          online.push(entry);
        }
      }

      return { printed, online };
    }),

  // ── Dog editing (for secretary) ──────────────────────────

  updateDog: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        entryId: z.string().uuid(),
        changes: z.object({
          registeredName: z.string().min(1).optional(),
          sireName: z.string().optional(),
          damName: z.string().optional(),
          breederName: z.string().optional(),
        }),
        reason: z.string().min(1, 'A reason for the change is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Verify entry belongs to this show
      const entry = await ctx.db.query.entries.findFirst({
        where: and(
          eq(entries.id, input.entryId),
          eq(entries.showId, input.showId),
          isNull(entries.deletedAt)
        ),
        with: { dog: true },
      });

      if (!entry || !entry.dog) {
        throw new Error('Entry or dog not found');
      }

      const oldValues: Record<string, string | null> = {};
      const newValues: Record<string, string | null | undefined> = {};
      for (const [key, val] of Object.entries(input.changes)) {
        if (val !== undefined) {
          oldValues[key] = entry.dog[key as keyof typeof entry.dog] as string | null;
          newValues[key] = val;
        }
      }

      if (Object.keys(newValues).length === 0) {
        throw new Error('No changes provided');
      }

      // Apply changes
      await ctx.db
        .update(dogs)
        .set(input.changes)
        .where(eq(dogs.id, entry.dog.id));

      // Create audit log
      await ctx.db.insert(entryAuditLog).values({
        entryId: input.entryId,
        action: 'classes_changed',
        userId: ctx.session.user.id,
        changes: { oldValues, newValues, type: 'dog_edit' },
        reason: input.reason,
      });

      return { updated: true };
    }),

  // ── Audit log ───────────────────────────────────────────

  getAuditLog: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Get all entries for this show, then their audit logs
      const showEntries = await ctx.db.query.entries.findMany({
        where: and(
          eq(entries.showId, input.showId),
          isNull(entries.deletedAt)
        ),
        columns: { id: true },
      });

      const entryIds = showEntries.map((e) => e.id);
      if (entryIds.length === 0) return [];

      return ctx.db.query.entryAuditLog.findMany({
        where: inArray(entryAuditLog.entryId, entryIds),
        with: {
          entry: {
            with: {
              dog: { columns: { registeredName: true } },
              exhibitor: { columns: { name: true } },
            },
          },
        },
        orderBy: [desc(entryAuditLog.createdAt)],
      });
    }),

  // ── Class transfer ─────────────────────────────────────────

  transferClass: secretaryProcedure
    .input(
      z.object({
        entryClassId: z.string().uuid(),
        newShowClassId: z.string().uuid(),
        reason: z.string().min(1, 'A reason for the transfer is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find the entry class and its current show class
      const ec = await ctx.db.query.entryClasses.findFirst({
        where: eq(entryClasses.id, input.entryClassId),
        with: {
          showClass: {
            with: { classDefinition: true },
          },
          entry: {
            columns: { id: true, showId: true, status: true, deletedAt: true },
            with: {
              dog: { columns: { registeredName: true } },
            },
          },
        },
      });

      if (!ec || ec.entry.deletedAt) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Entry class not found',
        });
      }

      await verifyShowAccess(ctx.db, ctx.session.user.id, ec.entry.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Validate the new class exists and belongs to the same show
      const newShowClass = await ctx.db.query.showClasses.findFirst({
        where: and(
          eq(showClasses.id, input.newShowClassId),
          eq(showClasses.showId, ec.entry.showId)
        ),
        with: { classDefinition: true },
      });

      if (!newShowClass) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Target class not found or belongs to a different show',
        });
      }

      if (input.newShowClassId === ec.showClass.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Entry is already in this class',
        });
      }

      const oldClassName = ec.showClass.classDefinition.name;
      const newClassName = newShowClass.classDefinition.name;

      // Update the entry class
      await ctx.db
        .update(entryClasses)
        .set({ showClassId: input.newShowClassId })
        .where(eq(entryClasses.id, input.entryClassId));

      // Log the transfer in the audit log
      await ctx.db.insert(entryAuditLog).values({
        entryId: ec.entry.id,
        action: 'class_transferred',
        userId: ctx.session.user.id,
        changes: {
          fromClassId: ec.showClass.id,
          fromClassName: oldClassName,
          toClassId: input.newShowClassId,
          toClassName: newClassName,
        },
        reason: input.reason,
      });

      return {
        transferred: true,
        dogName: ec.entry.dog?.registeredName ?? 'Unknown',
        fromClass: oldClassName,
        toClass: newClassName,
      };
    }),

  // ── Custom class definition creation ─────────────────────

  createClassDefinition: secretaryProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(classDefinitions)
        .values({
          name: input.name,
          type: 'special',
          description: input.description,
        })
        .returning();
      return created!;
    }),

  // ── Add individual show class ───────────────────────────

  addShowClass: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        classDefinitionId: z.string().uuid(),
        breedId: z.string().uuid().optional(),
        sex: z.enum(['dog', 'bitch']).nullable().optional(),
        entryFee: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Get max sort order for this show
      const [maxSort] = await ctx.db
        .select({ max: sql<number>`coalesce(max(${showClasses.sortOrder}), -1)` })
        .from(showClasses)
        .where(eq(showClasses.showId, input.showId));

      const [created] = await ctx.db
        .insert(showClasses)
        .values({
          showId: input.showId,
          classDefinitionId: input.classDefinitionId,
          breedId: input.breedId ?? null,
          sex: input.sex ?? null,
          entryFee: input.entryFee,
          sortOrder: (Number(maxSort?.max) ?? -1) + 1,
          isBreedSpecific: !!input.breedId,
        })
        .returning();
      return created!;
    }),

  // ── Bulk class creation from templates ────────────────────

  bulkCreateClasses: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        breedIds: z.array(z.string().uuid()),
        classDefinitionIds: z.array(z.string().uuid()),
        entryFee: z.number().int().nonnegative(),
        splitBySex: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Sort class definition IDs in proper RKC show order:
      // 1. Age classes (youngest first, Veteran last)
      // 2. Achievement classes (Maiden through Open)
      // 3. Special classes
      // 4. Junior Handler classes
      const classDefRows = await ctx.db.query.classDefinitions.findMany({
        where: inArray(classDefinitions.id, input.classDefinitionIds),
        columns: { id: true, sortOrder: true, type: true, name: true },
      });

      // RKC type ordering: age first (but Veteran last), then achievement, special, junior_handler
      const typeOrder: Record<string, number> = {
        age: 0,
        achievement: 1,
        special: 2,
        junior_handler: 3,
      };

      classDefRows.sort((a, b) => {
        const isVeteranA = a.name.toLowerCase().includes('veteran');
        const isVeteranB = b.name.toLowerCase().includes('veteran');

        // Veteran always sorts after all standard age + achievement classes
        if (isVeteranA && !isVeteranB) return 1;
        if (!isVeteranA && isVeteranB) return -1;
        if (isVeteranA && isVeteranB) return a.sortOrder - b.sortOrder;

        // Sort by type group, then by sortOrder within each type
        const typeA = typeOrder[a.type] ?? 99;
        const typeB = typeOrder[b.type] ?? 99;
        if (typeA !== typeB) return typeA - typeB;
        return a.sortOrder - b.sortOrder;
      });

      const sortedClassDefIds = classDefRows.map((cd) => cd.id);

      // Start from max existing sortOrder so we don't collide with existing classes
      const [maxSort] = await ctx.db
        .select({ max: sql<number>`coalesce(max(${showClasses.sortOrder}), -1)` })
        .from(showClasses)
        .where(eq(showClasses.showId, input.showId));
      let sortOrder = (Number(maxSort?.max) ?? -1) + 1;

      const values: Array<{
        showId: string;
        breedId: string | null;
        classDefinitionId: string;
        sex: 'dog' | 'bitch' | null;
        entryFee: number;
        sortOrder: number;
        isBreedSpecific: boolean;
      }> = [];

      if (input.breedIds.length === 0) {
        // Handling classes — no breeds, no sex split
        for (const classDefId of sortedClassDefIds) {
          values.push({
            showId: input.showId,
            breedId: null,
            classDefinitionId: classDefId,
            sex: null,
            entryFee: input.entryFee,
            sortOrder: sortOrder++,
            isBreedSpecific: false,
          });
        }
      } else {
        // Build a type map from the already-fetched classDefRows
        const classDefTypeMap = new Map(classDefRows.map((cd) => [cd.id, cd.type]));

        // Track JH class definitions already added (they should only appear once
        // across all breeds, not once per breed)
        const addedJhClassDefIds = new Set<string>();

        for (const breedId of input.breedIds) {
          if (input.splitBySex) {
            // All Dog classes first, then all Bitch classes (within each breed)
            // But junior_handler classes are never split by sex and only added once total
            for (const sex of ['dog', 'bitch'] as const) {
              for (const classDefId of sortedClassDefIds) {
                const classType = classDefTypeMap.get(classDefId);
                if (classType === 'junior_handler') {
                  // JH classes only added once total (not per breed, not per sex)
                  if (sex === 'dog' && !addedJhClassDefIds.has(classDefId)) {
                    addedJhClassDefIds.add(classDefId);
                    values.push({
                      showId: input.showId,
                      breedId: null,
                      classDefinitionId: classDefId,
                      sex: null,
                      entryFee: input.entryFee,
                      sortOrder: sortOrder++,
                      isBreedSpecific: false,
                    });
                  }
                } else {
                  values.push({
                    showId: input.showId,
                    breedId,
                    classDefinitionId: classDefId,
                    sex,
                    entryFee: input.entryFee,
                    sortOrder: sortOrder++,
                    isBreedSpecific: true,
                  });
                }
              }
            }
          } else {
            for (const classDefId of sortedClassDefIds) {
              const classType = classDefTypeMap.get(classDefId);
              if (classType === 'junior_handler') {
                // JH classes only added once total, not per breed
                if (!addedJhClassDefIds.has(classDefId)) {
                  addedJhClassDefIds.add(classDefId);
                  values.push({
                    showId: input.showId,
                    breedId: null,
                    classDefinitionId: classDefId,
                    sex: null,
                    entryFee: input.entryFee,
                    sortOrder: sortOrder++,
                    isBreedSpecific: false,
                  });
                }
              } else {
                values.push({
                  showId: input.showId,
                  breedId,
                  classDefinitionId: classDefId,
                  sex: null,
                  entryFee: input.entryFee,
                  sortOrder: sortOrder++,
                  isBreedSpecific: true,
                });
              }
            }
          }
        }
      }

      if (values.length > 0) {
        await ctx.db.insert(showClasses).values(values);

        // Auto-number all classes for this show based on sort order
        const allClasses = await ctx.db.query.showClasses.findMany({
          where: eq(showClasses.showId, input.showId),
          columns: { id: true },
          orderBy: [asc(showClasses.sortOrder)],
        });
        for (let i = 0; i < allClasses.length; i++) {
          await ctx.db
            .update(showClasses)
            .set({ classNumber: i + 1 })
            .where(eq(showClasses.id, allClasses[i].id));
        }
      }

      return { created: values.length };
    }),

  // ── Individual class management ────────────────────────────

  updateShowClass: secretaryProcedure
    .input(
      z.object({
        showClassId: z.string().uuid(),
        entryFee: z.number().int().min(0).optional(),
        sortOrder: z.number().int().optional(),
        classNumber: z.number().int().min(1).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via show
      const sc = await ctx.db.query.showClasses.findFirst({
        where: eq(showClasses.id, input.showClassId),
        columns: { showId: true },
      });
      if (!sc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Class not found' });
      await verifyShowAccess(ctx.db, ctx.session.user.id, sc.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const updates: Record<string, unknown> = {};
      if (input.entryFee !== undefined) updates.entryFee = input.entryFee;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (input.classNumber !== undefined) updates.classNumber = input.classNumber;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No fields to update',
        });
      }

      const [updated] = await ctx.db
        .update(showClasses)
        .set(updates)
        .where(eq(showClasses.id, input.showClassId))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Class not found' });
      }

      return updated;
    }),

  deleteShowClass: secretaryProcedure
    .input(z.object({ showClassId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await ctx.db.query.showClasses.findFirst({
        where: eq(showClasses.id, input.showClassId),
        columns: { showId: true },
      });
      if (!sc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Class not found' });
      await verifyShowAccess(ctx.db, ctx.session.user.id, sc.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const [deleted] = await ctx.db
        .delete(showClasses)
        .where(eq(showClasses.id, input.showClassId))
        .returning({ id: showClasses.id });

      return deleted!;
    }),

  bulkDeleteShowClasses: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        showClassIds: z.array(z.string().uuid()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Check for existing entries on any of these classes
      const existingEntries = await ctx.db.query.entryClasses.findFirst({
        where: inArray(entryClasses.showClassId, input.showClassIds),
        columns: { id: true },
      });
      if (existingEntries) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot delete — one or more of these classes already has entries. Remove the entries first.',
        });
      }

      const deleted = await ctx.db
        .delete(showClasses)
        .where(
          and(
            inArray(showClasses.id, input.showClassIds),
            eq(showClasses.showId, input.showId)
          )
        )
        .returning({ id: showClasses.id });

      return { deleted: deleted.length };
    }),

  reorderClasses: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        classIds: z.array(z.string().uuid()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      await ctx.db.transaction(async (tx) => {
        await Promise.all(
          input.classIds.map((id, i) =>
            tx
              .update(showClasses)
              .set({ sortOrder: i, classNumber: i + 1 })
              .where(
                and(
                  eq(showClasses.id, id),
                  eq(showClasses.showId, input.showId)
                )
              )
          )
        );
      });
      return { updated: input.classIds.length };
    }),

  // ── Class number assignment ────────────────────────────

  assignClassNumbers: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        assignments: z.array(
          z.object({
            classId: z.string().uuid(),
            classNumber: z.number().int().min(1),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      for (const { classId, classNumber } of input.assignments) {
        await ctx.db
          .update(showClasses)
          .set({ classNumber })
          .where(and(eq(showClasses.id, classId), eq(showClasses.showId, input.showId)));
      }
      return { updated: input.assignments.length };
    }),

  autoAssignClassNumbers: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Fetch all classes with breed group info for ordering
      const classes = await ctx.db.query.showClasses.findMany({
        where: eq(showClasses.showId, input.showId),
        with: {
          classDefinition: true,
          breed: {
            with: { group: true },
          },
        },
        orderBy: [asc(showClasses.sortOrder)],
      });

      // Single-breed shows often have breed_id set inconsistently across
      // classes. Skip breed in the sort unless there are genuinely ≥3
      // distinct breeds — otherwise a "German Shepherd Dog" value sorts
      // before the "ZZZ" null-breed fallback and bubbles mixed-breed
      // classes to the wrong position.
      const distinctBreeds = new Set(classes.filter((c) => c.breed).map((c) => c.breed!.name));
      const isMultiBreed = distinctBreeds.size >= 3;

      // Sex tier for numbering order:
      //   0 = non-JH Mixed (Veteran etc.) — class 1, rendered at the top
      //   1 = Dog
      //   2 = Bitch
      //   3 = JH (excluded from numbering below)
      // Non-JH Mixed classes go first because RKC ordering places Veteran
      // before the per-sex classes — a Veteran-winning dog must still be
      // eligible for the Dog Challenge, which hasn't been judged yet.
      const sexTier = (cls: (typeof classes)[number]): number => {
        if (cls.classDefinition?.type === 'junior_handler') return 3;
        if (cls.sex === 'dog') return 1;
        if (cls.sex === 'bitch') return 2;
        return 0;
      };

      const sorted = [...classes].sort((a, b) => {
        if (isMultiBreed) {
          const groupA = a.breed?.group?.name ?? 'ZZZ';
          const groupB = b.breed?.group?.name ?? 'ZZZ';
          if (groupA !== groupB) return groupA.localeCompare(groupB);

          const breedA = a.breed?.name ?? 'ZZZ';
          const breedB = b.breed?.name ?? 'ZZZ';
          if (breedA !== breedB) return breedA.localeCompare(breedB);
        }

        const tierA = sexTier(a);
        const tierB = sexTier(b);
        if (tierA !== tierB) return tierA - tierB;

        return a.sortOrder - b.sortOrder;
      });

      // RKC show licences count only breed classes, not Junior Handler —
      // so JH classes stay unnumbered (classNumber = null) and are
      // rendered as JHA, JHB, … at display time. Numbered sequence is
      // reserved for the RKC-licensed breed classes.
      let numbered = 0;
      let skipped = 0;
      for (const cls of sorted) {
        if (cls.classDefinition?.type === 'junior_handler') {
          await ctx.db
            .update(showClasses)
            .set({ classNumber: null })
            .where(eq(showClasses.id, cls.id));
          skipped++;
        } else {
          numbered++;
          await ctx.db
            .update(showClasses)
            .set({ classNumber: numbered })
            .where(eq(showClasses.id, cls.id));
        }
      }

      return { assigned: numbered, jhSkipped: skipped };
    }),

  resortShowClasses: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Fetch all show classes with their definitions and breeds
      const allClasses = await ctx.db.query.showClasses.findMany({
        where: eq(showClasses.showId, input.showId),
        with: {
          classDefinition: true,
          breed: { with: { group: true } },
          entryClasses: { columns: { id: true }, limit: 1 },
        },
        orderBy: [asc(showClasses.sortOrder)],
      });

      // 1. Identify duplicate JH classes — same classDefinitionId where the class type is junior_handler
      //    Keep the one with sex=null (or the first one), delete the rest
      const jhGroups = new Map<string, typeof allClasses>();
      for (const sc of allClasses) {
        if (sc.classDefinition?.type === 'junior_handler') {
          const key = sc.classDefinitionId;
          if (!jhGroups.has(key)) jhGroups.set(key, []);
          jhGroups.get(key)!.push(sc);
        }
      }

      const toDelete: string[] = [];
      const toFixSex: string[] = []; // JH classes that should have sex=null, breedId=null
      for (const [, group] of jhGroups) {
        if (group.length > 1) {
          // Prefer the one with sex=null, otherwise keep the first
          const keeper = group.find((c) => c.sex === null) ?? group[0]!;
          for (const sc of group) {
            if (sc.id !== keeper.id) {
              // Only delete if no entries exist on this class
              if (sc.entryClasses.length === 0) {
                toDelete.push(sc.id);
              }
            }
          }
          toFixSex.push(keeper.id);
        } else {
          // Single JH class — ensure sex=null, breedId=null
          toFixSex.push(group[0]!.id);
        }
      }

      // Delete duplicate JH classes
      let deletedCount = 0;
      if (toDelete.length > 0) {
        const deleted = await ctx.db
          .delete(showClasses)
          .where(
            and(
              inArray(showClasses.id, toDelete),
              eq(showClasses.showId, input.showId)
            )
          )
          .returning({ id: showClasses.id });
        deletedCount = deleted.length;
      }

      // Fix JH classes to have sex=null, breedId=null
      for (const id of toFixSex) {
        await ctx.db
          .update(showClasses)
          .set({ sex: null, breedId: null })
          .where(and(eq(showClasses.id, id), eq(showClasses.showId, input.showId)));
      }

      // 2. Re-fetch surviving classes for sorting
      const remaining = await ctx.db.query.showClasses.findMany({
        where: eq(showClasses.showId, input.showId),
        with: {
          classDefinition: true,
          breed: { with: { group: true } },
        },
      });

      // 3. Sort using correct RKC order
      // For single-breed shows: Dog first, then Bitch, then Any Sex
      //   Within each sex: age classes first (by sortOrder), achievement (by sortOrder),
      //   Veteran last within age, then special, then junior_handler
      // For multi-breed: group by breed group → breed → sex → class type → sortOrder
      const distinctBreeds = new Set(remaining.filter((c) => c.breed).map((c) => c.breed!.name));
      const isMultiBreed = distinctBreeds.size >= 3;

      const classTypeRank = (type: string | null) => {
        switch (type) {
          case 'age': return 0;
          case 'achievement': return 1;
          case 'special': return 2;
          case 'junior_handler': return 3;
          default: return 4;
        }
      };

      const sexRank = (s: string | null) => (s === 'dog' ? 0 : s === 'bitch' ? 1 : 2);

      const sorted = [...remaining].sort((a, b) => {
        if (isMultiBreed) {
          // Multi-breed: group → breed → sex → class type → sort order
          const groupA = a.breed?.group?.sortOrder ?? 999;
          const groupB = b.breed?.group?.sortOrder ?? 999;
          if (groupA !== groupB) return groupA - groupB;

          const breedA = a.breed?.name ?? 'ZZZ';
          const breedB = b.breed?.name ?? 'ZZZ';
          if (breedA !== breedB) return breedA.localeCompare(breedB);
        }

        // Sex: Dog first, Bitch second, null (any sex / JH) last
        const sa = sexRank(a.sex), sb = sexRank(b.sex);
        if (sa !== sb) return sa - sb;

        // Class type: age → achievement → special → junior_handler
        const ta = classTypeRank(a.classDefinition?.type ?? null);
        const tb = classTypeRank(b.classDefinition?.type ?? null);
        if (ta !== tb) return ta - tb;

        // Within the same type, sort by class definition sortOrder
        const soA = a.classDefinition?.sortOrder ?? 999;
        const soB = b.classDefinition?.sortOrder ?? 999;
        return soA - soB;
      });

      // 4. Update sortOrder and classNumber sequentially
      for (let i = 0; i < sorted.length; i++) {
        await ctx.db
          .update(showClasses)
          .set({ sortOrder: i, classNumber: i + 1 })
          .where(eq(showClasses.id, sorted[i]!.id));
      }

      return { deleted: deletedCount, resorted: sorted.length };
    }),

  // ── Steward management ───────────────────────────────

  getShowStewards: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      return ctx.db.query.stewardAssignments.findMany({
        where: eq(stewardAssignments.showId, input.showId),
        with: {
          user: {
            columns: { id: true, name: true, email: true, image: true },
          },
          ring: true,
          breedAssignments: {
            with: { breed: true },
          },
        },
      });
    }),

  assignSteward: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        email: z.string().email(),
        ringId: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Find user by email
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email.toLowerCase()),
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No user found with that email address. They need to create an account first.',
        });
      }

      // Check not already assigned
      const existing = await ctx.db.query.stewardAssignments.findFirst({
        where: and(
          eq(stewardAssignments.showId, input.showId),
          eq(stewardAssignments.userId, user.id)
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This user is already assigned as a steward for this show',
        });
      }

      // Update user role to steward if they're an exhibitor
      if (user.role === 'exhibitor') {
        await ctx.db
          .update(users)
          .set({ role: 'steward' })
          .where(eq(users.id, user.id));
      }

      const [assignment] = await ctx.db
        .insert(stewardAssignments)
        .values({
          showId: input.showId,
          userId: user.id,
          ringId: input.ringId ?? null,
        })
        .returning();

      return assignment!;
    }),

  removeSteward: secretaryProcedure
    .input(z.object({ assignmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Look up assignment to verify show ownership
      const assignment = await ctx.db.query.stewardAssignments.findFirst({
        where: eq(stewardAssignments.id, input.assignmentId),
      });
      if (!assignment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Steward assignment not found' });
      }
      await verifyShowAccess(ctx.db, ctx.session.user.id, assignment.showId, { callerIsAdmin: ctx.callerIsAdmin });

      await ctx.db
        .delete(stewardAssignments)
        .where(eq(stewardAssignments.id, input.assignmentId));

      // Revert role if this was their only steward assignment
      const remainingAssignments = await ctx.db.query.stewardAssignments.findFirst({
        where: eq(stewardAssignments.userId, assignment.userId),
      });
      if (!remainingAssignments) {
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, assignment.userId),
          columns: { role: true },
        });
        if (user?.role === 'steward') {
          await ctx.db.update(users).set({ role: 'exhibitor' }).where(eq(users.id, assignment.userId));
        }
      }

      return { removed: true };
    }),

  // ── Steward breed assignments ─────────────────────────
  setStewardBreeds: secretaryProcedure
    .input(
      z.object({
        stewardAssignmentId: z.string().uuid(),
        breeds: z.array(
          z.object({
            breedId: z.string().uuid(),
            showDate: z.string(), // YYYY-MM-DD
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Look up assignment to verify show ownership
      const assignment = await ctx.db.query.stewardAssignments.findFirst({
        where: eq(stewardAssignments.id, input.stewardAssignmentId),
      });
      if (!assignment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Steward assignment not found' });
      }
      await verifyShowAccess(ctx.db, ctx.session.user.id, assignment.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Replace all breed assignments for this steward
      await ctx.db
        .delete(stewardBreedAssignments)
        .where(eq(stewardBreedAssignments.stewardAssignmentId, input.stewardAssignmentId));

      if (input.breeds.length > 0) {
        await ctx.db.insert(stewardBreedAssignments).values(
          input.breeds.map((b) => ({
            stewardAssignmentId: input.stewardAssignmentId,
            breedId: b.breedId,
            showDate: b.showDate,
          }))
        );
      }

      return { updated: true };
    }),

  deleteShow: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
      });

      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      if (show.status !== 'draft') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Only draft shows can be deleted. Change the status to draft first, or cancel the show instead.',
        });
      }

      // Check for entries
      const [entryCount] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(entries)
        .where(and(eq(entries.showId, input.showId), isNull(entries.deletedAt)));

      if (Number(entryCount?.count) > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot delete a show that has entries. Cancel the show instead.',
        });
      }

      // Check for orders
      const [orderCount] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(eq(orders.showId, input.showId));

      if (Number(orderCount?.count) > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot delete a show that has orders. Cancel the show instead.',
        });
      }

      // Safe to delete — showClasses, rings, judgeAssignments, catalogues cascade
      try {
        await ctx.db.delete(shows).where(eq(shows.id, input.showId));
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete show. It may have dependent records.',
          cause: err,
        });
      }

      return { deleted: true };
    }),

  // ─── Ring Management ──────────────────────────────────
  getShowRings: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      return ctx.db.query.rings.findMany({
        where: eq(rings.showId, input.showId),
        orderBy: asc(rings.number),
      });
    }),

  addRing: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        number: z.number().int().min(1),
        showDay: z.number().int().min(1).nullable().optional(),
        startTime: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const [ring] = await ctx.db
        .insert(rings)
        .values({
          showId: input.showId,
          number: input.number,
          showDay: input.showDay ?? null,
          startTime: input.startTime ?? null,
        })
        .returning();

      return ring!;
    }),

  updateRing: secretaryProcedure
    .input(
      z.object({
        ringId: z.string().uuid(),
        number: z.number().int().min(1).optional(),
        showDay: z.number().int().min(1).nullable().optional(),
        startTime: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ring = await ctx.db.query.rings.findFirst({
        where: eq(rings.id, input.ringId),
        columns: { showId: true },
      });
      if (!ring) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ring not found' });
      await verifyShowAccess(ctx.db, ctx.session.user.id, ring.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const { ringId, ...data } = input;
      const updateData: Record<string, unknown> = {};
      if (data.number !== undefined) updateData.number = data.number;
      if (data.showDay !== undefined) updateData.showDay = data.showDay;
      if (data.startTime !== undefined) updateData.startTime = data.startTime;

      const [updated] = await ctx.db
        .update(rings)
        .set(updateData)
        .where(eq(rings.id, ringId))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ring not found' });
      }
      return updated;
    }),

  removeRing: secretaryProcedure
    .input(z.object({ ringId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ring = await ctx.db.query.rings.findFirst({
        where: eq(rings.id, input.ringId),
        columns: { showId: true },
      });
      if (!ring) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ring not found' });
      await verifyShowAccess(ctx.db, ctx.session.user.id, ring.showId, { callerIsAdmin: ctx.callerIsAdmin });

      await ctx.db.delete(rings).where(eq(rings.id, input.ringId));
      return { removed: true };
    }),

  // ─── Judge Management ─────────────────────────────────
  getJudges: secretaryProcedure
    .query(async ({ ctx }) => {
      const allJudges = await ctx.db.query.judges.findMany({
        orderBy: asc(judges.name),
      });

      // Deduplicate: prefer judges with a kcNumber, then by most recently updated
      const seen = new Map<string, typeof allJudges[number]>();
      for (const judge of allJudges) {
        // Key by kcNumber if available, otherwise by lowercased name
        const key = judge.kcNumber?.trim() || judge.name.toLowerCase().trim();
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, judge);
        } else {
          // Keep the one with more data (has kcNumber, has email, newer)
          const existingScore = (existing.kcNumber ? 2 : 0) + (existing.contactEmail ? 1 : 0);
          const newScore = (judge.kcNumber ? 2 : 0) + (judge.contactEmail ? 1 : 0);
          if (newScore > existingScore) {
            seen.set(key, judge);
          }
        }
      }

      return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
    }),

  addJudge: secretaryProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        kcNumber: z.string().optional(),
        contactEmail: z.string().email().optional(),
        kennelClubAffix: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [judge] = await ctx.db
        .insert(judges)
        .values({
          name: input.name,
          kcNumber: input.kcNumber ?? null,
          contactEmail: input.contactEmail ?? null,
          kennelClubAffix: input.kennelClubAffix ?? null,
        })
        .returning();

      return judge!;
    }),

  getShowJudges: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      return ctx.db.query.judgeAssignments.findMany({
        where: eq(judgeAssignments.showId, input.showId),
        with: {
          judge: true,
          breed: true,
          ring: true,
        },
      });
    }),

  assignJudge: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        judgeId: z.string().uuid(),
        breedId: z.string().uuid().nullable().optional(),
        ringId: z.string().uuid().nullable().optional(),
        sex: z.enum(['dog', 'bitch']).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const [assignment] = await ctx.db
        .insert(judgeAssignments)
        .values({
          showId: input.showId,
          judgeId: input.judgeId,
          breedId: input.breedId ?? null,
          ringId: input.ringId ?? null,
          sex: input.sex ?? null,
        })
        .returning();

      return assignment!;
    }),

  // Bulk assign: assign a judge to multiple breeds at once
  bulkAssignJudge: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        judgeId: z.string().uuid(),
        breedIds: z.array(z.string().uuid()),
        ringId: z.string().uuid().nullable().optional(),
        sex: z.enum(['dog', 'bitch']).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      if (input.breedIds.length === 0) return { count: 0 };

      const values = input.breedIds.map((breedId) => ({
        showId: input.showId,
        judgeId: input.judgeId,
        breedId,
        ringId: input.ringId ?? null,
        sex: input.sex ?? null,
      }));

      const rows = await ctx.db
        .insert(judgeAssignments)
        .values(values)
        .returning();

      return { count: rows.length };
    }),

  removeJudgeAssignment: secretaryProcedure
    .input(z.object({ assignmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ja = await ctx.db.query.judgeAssignments.findFirst({
        where: eq(judgeAssignments.id, input.assignmentId),
        columns: { showId: true },
      });
      if (!ja) throw new TRPCError({ code: 'NOT_FOUND', message: 'Judge assignment not found' });
      await verifyShowAccess(ctx.db, ctx.session.user.id, ja.showId, { callerIsAdmin: ctx.callerIsAdmin });

      await ctx.db.delete(judgeAssignments).where(eq(judgeAssignments.id, input.assignmentId));
      return { removed: true };
    }),

  // ─── Judge Wizard ─────────────────────────────────────

  /** Search local judge pool by name (for autocomplete). */
  searchJudges: secretaryProcedure
    .input(z.object({ query: z.string().min(1).max(100), limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      // Use DISTINCT ON to deduplicate judges with the same name,
      // preferring the row with a KC number (most complete record)
      const rows = await ctx.db
        .select()
        .from(judges)
        .where(ilike(judges.name, `%${input.query}%`))
        .orderBy(
          asc(judges.name),
          // Within each name, prefer rows that have a kcNumber (non-null sorts first with DESC)
          desc(judges.kcNumber),
          desc(judges.updatedAt),
        )
        .limit(input.limit * 3); // fetch extra to account for duplicates

      // Deduplicate by normalised name, keeping the first (best) row per name
      const seen = new Set<string>();
      const unique: typeof rows = [];
      for (const row of rows) {
        const key = row.name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(row);
        if (unique.length >= input.limit) break;
      }
      return unique;
    }),

  /** Edit a judge's details after creation. */
  updateJudge: secretaryProcedure
    .input(z.object({
      judgeId: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      kcNumber: z.string().max(50).optional(),
      // Allow an empty string so secretaries can clear a mis-entered
      // email — the mutation normalises '' → null below. Non-empty values
      // must still look like an email.
      contactEmail: z.union([z.string().email().max(255), z.literal('')]).optional(),
      contactPhone: z.string().max(50).optional(),
      bio: z.string().max(2000).optional(),
      photoUrl: z.union([z.string().url().max(500), z.literal('')]).optional(),
      kennelClubAffix: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { judgeId, ...updates } = input;
      const setValues: Record<string, unknown> = {};
      if (updates.name !== undefined) setValues.name = updates.name;
      if (updates.kcNumber !== undefined) setValues.kcNumber = updates.kcNumber || null;
      if (updates.contactEmail !== undefined) setValues.contactEmail = updates.contactEmail || null;
      if (updates.contactPhone !== undefined) setValues.contactPhone = updates.contactPhone || null;
      if (updates.bio !== undefined) setValues.bio = updates.bio || null;
      if (updates.photoUrl !== undefined) setValues.photoUrl = updates.photoUrl || null;
      if (updates.kennelClubAffix !== undefined) setValues.kennelClubAffix = updates.kennelClubAffix || null;
      if (Object.keys(setValues).length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No fields to update' });

      const [updated] = await ctx.db.update(judges).set(setValues).where(eq(judges.id, judgeId)).returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Judge not found' });
      return updated;
    }),

  /**
   * Atomic create-or-find judge + assign to show.
   * If kcNumber is provided and a judge with that number exists, reuse them.
   * Creates assignments for each breedId+sex combination.
   */
  addAndAssignJudge: secretaryProcedure
    .input(z.object({
      showId: z.string().uuid(),
      // Judge details
      name: z.string().min(1).max(255),
      kcNumber: z.string().max(50).optional(),
      // Required for breed-judge assignments (needed to email the offer)
      // but optional for JH-only assignments — we don't send offers for JH.
      // The wizard enforces the "required when breed assignment present"
      // rule client-side; server stays tolerant of a blank string.
      contactEmail: z.union([z.string().email(), z.literal('')]).optional(),
      contactPhone: z.string().max(50).optional(),
      kcJudgeId: z.string().max(100).optional(),
      kennelClubAffix: z.string().max(100).optional(),
      // Assignment details — array of breed+sex combos
      assignments: z.array(z.object({
        breedId: z.string().uuid().nullable(),
        sex: z.enum(['dog', 'bitch']).nullable(),
      })).min(1),
      ringId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Find or create judge
      let judge: typeof judges.$inferSelect | undefined;

      // Try to find by KC number first (most reliable dedup)
      if (input.kcNumber) {
        judge = await ctx.db.query.judges.findFirst({
          where: eq(judges.kcNumber, input.kcNumber),
        }) ?? undefined;
      }

      // Fallback: match by name + email to avoid creating duplicates
      if (!judge && input.contactEmail) {
        judge = await ctx.db.query.judges.findFirst({
          where: and(
            ilike(judges.name, input.name.trim()),
            eq(judges.contactEmail, input.contactEmail),
          ),
        }) ?? undefined;
      }

      if (!judge) {
        // Create new judge
        const [created] = await ctx.db.insert(judges).values({
          name: input.name,
          kcNumber: input.kcNumber || null,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone || null,
          kcJudgeId: input.kcJudgeId || null,
          kennelClubAffix: input.kennelClubAffix || null,
        }).returning();
        judge = created!;
      } else {
        // Update email/phone/affix if provided (judge already exists, may have new info)
        await ctx.db.update(judges).set({
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone ?? judge.contactPhone,
          kcJudgeId: input.kcJudgeId ?? judge.kcJudgeId,
          kennelClubAffix: input.kennelClubAffix ?? judge.kennelClubAffix,
        }).where(eq(judges.id, judge.id));
      }

      // Create assignments (skip duplicates via onConflictDoNothing)
      const assignmentValues = input.assignments.map((a) => ({
        showId: input.showId,
        judgeId: judge!.id,
        breedId: a.breedId,
        ringId: input.ringId ?? null,
        sex: a.sex,
      }));

      const rows = await ctx.db.insert(judgeAssignments)
        .values(assignmentValues)
        .onConflictDoNothing({
          target: [
            judgeAssignments.showId,
            judgeAssignments.judgeId,
            judgeAssignments.breedId,
            judgeAssignments.sex,
          ],
        })
        .returning();

      return { judge, assignmentCount: rows.length };
    }),

  /**
   * Coverage dashboard: which breed+sex combos in this show have judges vs which don't.
   */
  getJudgeCoverage: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Get the show (for single-breed name) and all classes + assignments in parallel
      const [show, classes, assignmentRows] = await Promise.all([
        ctx.db.query.shows.findFirst({
          where: eq(shows.id, input.showId),
          columns: { showScope: true },
        }),
        ctx.db.query.showClasses.findMany({
          where: eq(showClasses.showId, input.showId),
          with: { breed: true, classDefinition: true },
        }),
        ctx.db.query.judgeAssignments.findMany({
          where: eq(judgeAssignments.showId, input.showId),
          with: { judge: true, breed: true },
        }),
      ]);
      const assignments = assignmentRows;

      // Build unique breed+sex requirements from classes
      // Group classes by breedId+sex to get the unique combos that need judges
      const requirementsMap = new Map<string, {
        breedId: string | null;
        breedName: string | null;
        label: string; // Display label — breed name or class definition name (e.g. "Junior Handling")
        sex: string | null;
        classCount: number;
      }>();

      for (const sc of classes) {
        const key = `${sc.breedId ?? 'all'}:${sc.sex ?? 'both'}`;
        const existing = requirementsMap.get(key);
        if (existing) {
          existing.classCount++;
        } else {
          // For breed-less classes: use breed name, class name (JH), or scope-aware fallback
          const isJuniorHandling = sc.classDefinition?.name?.toLowerCase().includes('handling');
          const label = sc.breed?.name
            ?? (isJuniorHandling ? 'Junior Handling'
              : show?.showScope === 'single_breed' ? 'Breed Classes' : 'All Breeds');
          requirementsMap.set(key, {
            breedId: sc.breedId,
            breedName: sc.breed?.name ?? null,
            label,
            sex: sc.sex,
            classCount: 1,
          });
        }
      }

      // Check which requirements are covered by assignments
      const coverage = Array.from(requirementsMap.values()).map((req) => {
        // Find ALL matching assignments. breed=null or sex=null on an
        // assignment is treated as a catch-all — "any breed" / "any sex".
        const matching = assignments.filter((a) => {
          const breedMatch = req.breedId
            ? a.breedId === req.breedId || a.breedId === null
            : a.breedId === null;
          const sexMatch = req.sex === null
            ? a.sex === null
            : (a.sex === null || a.sex === req.sex);
          return breedMatch && sexMatch;
        });

        // Prefer assignments that match BOTH breed and sex exactly over
        // catch-all matches. Without this, a null-breed null-sex assignment
        // (e.g. Junior Handling) wrongly claims coverage of a breed-
        // specific mixed-sex class like Veteran — they have the same
        // shape in the DB. Exact breed + exact sex wins; catch-alls
        // only appear when nothing more specific exists.
        const exact = matching.filter(
          (a) =>
            a.sex === req.sex &&
            (req.breedId ? a.breedId === req.breedId : a.breedId === null),
        );
        const best = exact.length > 0 ? exact : matching;

        // Deduplicate by judge
        const seen = new Set<string>();
        const judges: { judgeId: string; judgeName: string; assignmentId: string }[] = [];
        for (const a of best) {
          if (!seen.has(a.judgeId)) {
            seen.add(a.judgeId);
            judges.push({ judgeId: a.judgeId, judgeName: a.judge.name, assignmentId: a.id });
          }
        }

        return {
          breedId: req.breedId,
          breedName: req.breedName,
          label: req.label,
          sex: req.sex,
          classCount: req.classCount,
          covered: judges.length > 0,
          judges,
          // Keep flat fields for backwards compat
          judgeName: judges[0]?.judgeName ?? null,
          judgeId: judges[0]?.judgeId ?? null,
        };
      });

      const coveredCount = coverage.filter((c) => c.covered).length;
      const totalCount = coverage.length;

      return { coverage, coveredCount, totalCount };
    }),

  // ─── RKC Judge Lookup ────────────────────────────────

  kcJudgeSearch: secretaryProcedure
    .input(
      z.object({
        surname: z.string().min(2).max(100),
        breed: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const results = await searchKcJudges(input.surname, input.breed || undefined);
      if (results.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No RKC judges found matching "${input.surname}"${input.breed ? ` for ${input.breed}` : ''}. Check the spelling and try again.`,
        });
      }
      return results;
    }),

  kcJudgeProfile: secretaryProcedure
    .input(z.object({ kcJudgeId: z.string().min(1).max(100) }))
    .mutation(async ({ input }) => {
      const profile = await fetchKcJudgeProfile(input.kcJudgeId);
      if (!profile) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Could not fetch judge profile from RKC. Try again in a moment.',
        });
      }
      return profile;
    }),

  // ─── Refund Management ────────────────────────────────

  /**
   * Every paid order on a show with the full line-item breakdown needed to
   * render a refund card: exhibitor, entries (with dog + JH handler), sundry
   * lines (with item names), and the original Stripe payment + refund
   * history. Paid-only — draft/pending/cancelled orders never appear.
   */
  getRefundableOrders: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      return ctx.db.query.orders.findMany({
        where: and(eq(orders.showId, input.showId), eq(orders.status, 'paid')),
        with: {
          exhibitor: { columns: { id: true, name: true, email: true } },
          entries: {
            where: isNull(entries.deletedAt),
            with: {
              dog: true,
              juniorHandlerDetails: true,
              entryClasses: {
                with: {
                  showClass: { with: { classDefinition: true } },
                },
              },
            },
          },
          orderSundryItems: {
            with: { sundryItem: true },
          },
          payments: true,
        },
        orderBy: [desc(orders.createdAt)],
      });
    }),

  /**
   * Full-order refund: refunds every remaining penny on the order's Stripe
   * PaymentIntent (entry fees + sundries + platform fee all come back to the
   * exhibitor), cancels every live entry, and marks the payment refunded.
   *
   * Use this when the exhibitor pulls out entirely. For "refund one entry
   * but keep the catalogue", use issueRefund with an entryId instead.
   */
  refundOrder: secretaryProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });
      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }
      await verifyShowAccess(ctx.db, ctx.session.user.id, order.showId, { callerIsAdmin: ctx.callerIsAdmin });

      if (order.status !== 'paid') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only paid orders can be refunded' });
      }

      // Match any payment that still has money to give back — succeeded AND
      // partially_refunded both qualify. A pure 'succeeded' filter here would
      // break after any prior entry-level partial refund flipped the status.
      const originalPayment = await ctx.db.query.payments.findFirst({
        where: and(
          eq(payments.orderId, input.orderId),
          inArray(payments.status, ['succeeded', 'partially_refunded'])
        ),
      });
      if (!originalPayment?.stripePaymentId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No completed payment found for this order',
        });
      }

      const alreadyRefunded = originalPayment.refundAmount ?? 0;
      const remainingPence = originalPayment.amount - alreadyRefunded;
      if (remainingPence <= 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Order has already been fully refunded',
        });
      }

      const result = await executeStripeRefund(ctx.db, originalPayment, {
        amountPence: remainingPence,
        reason: input.reason,
      });

      // Cancel every live entry on this order — exhibitor has pulled out
      await ctx.db
        .update(entries)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(entries.orderId, input.orderId),
            inArray(entries.status, ['pending', 'confirmed'])
          )
        );

      return { refunded: true, amount: result.amount };
    }),

  issueRefund: secretaryProcedure
    .input(
      z.object({
        entryId: z.string().uuid(),
        amount: z.number().int().min(1).optional(), // pence; omit for full refund
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find the entry and its show
      const entry = await ctx.db.query.entries.findFirst({
        where: eq(entries.id, input.entryId),
        with: { show: true },
      });

      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      }

      await verifyShowAccess(ctx.db, ctx.session.user.id, entry.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Payments on new (merchant-of-record) orders are linked by orderId —
      // multiple entries share one order + one Stripe charge. Fall back to
      // the legacy per-entry payment linkage for older test/data rows where
      // payment.entryId is populated instead.
      const originalPayment = entry.orderId
        ? await ctx.db.query.payments.findFirst({
            where: and(
              eq(payments.orderId, entry.orderId),
              eq(payments.status, 'succeeded'),
            ),
          })
        : await ctx.db.query.payments.findFirst({
            where: and(
              eq(payments.entryId, input.entryId),
              eq(payments.status, 'succeeded'),
            ),
          });

      if (!originalPayment?.stripePaymentId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No completed payment found for this entry',
        });
      }

      const refundAmount = input.amount ?? entry.totalFee;
      const alreadyRefunded = originalPayment.refundAmount ?? 0;
      const maxRefundable = originalPayment.amount - alreadyRefunded;

      if (refundAmount > maxRefundable) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot refund more than the remaining amount (${maxRefundable}p)`,
        });
      }

      const result = await executeStripeRefund(ctx.db, originalPayment, {
        amountPence: refundAmount,
        reason: input.reason,
        entryId: input.entryId,
      });

      // If this refund cleared the remaining balance, the whole order is
      // gone — cancel this entry so it drops out of the catalogue.
      if (result.fullyRefunded) {
        await ctx.db
          .update(entries)
          .set({ status: 'cancelled' })
          .where(eq(entries.id, input.entryId));
      }

      return {
        refunded: true,
        amount: result.amount,
        fullyRefunded: result.fullyRefunded,
      };
    }),

  // ─── Secretary-Initiated Entries ───────────────────────
  searchDogs: secretaryProcedure
    .input(
      z.object({
        query: z.string().min(1).max(255),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.dogs.findMany({
        where: and(
          ilike(dogs.registeredName, `%${input.query}%`),
          isNull(dogs.deletedAt)
        ),
        with: {
          breed: { with: { group: true } },
          owners: { orderBy: [asc(dogOwners.sortOrder)], limit: 1 },
          titles: true,
        },
        limit: input.limit,
      });
    }),

  registerDogForExhibitor: secretaryProcedure
    .input(
      z.object({
        registeredName: z.string().min(1).max(255),
        kcRegNumber: z.string().optional(),
        breedId: z.string().uuid(),
        sex: z.enum(['dog', 'bitch']),
        dateOfBirth: z.string(),
        sireName: z.string().optional(),
        damName: z.string().optional(),
        breederName: z.string().optional(),
        colour: z.string().optional(),
        exhibitorEmail: z.string().email(),
        ownerName: z.string().min(1),
        ownerAddress: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { exhibitorEmail, ownerName, ownerAddress, ...dogData } = input;

      // Look up the exhibitor by email — create a placeholder if not found
      let exhibitor = await ctx.db.query.users.findFirst({
        where: eq(users.email, exhibitorEmail.toLowerCase()),
      });

      const exhibitorId = exhibitor?.id ?? ctx.session.user.id;

      const [dog] = await ctx.db
        .insert(dogs)
        .values({
          registeredName: dogData.registeredName,
          kcRegNumber: dogData.kcRegNumber ?? null,
          breedId: dogData.breedId,
          sex: dogData.sex,
          dateOfBirth: dogData.dateOfBirth,
          sireName: dogData.sireName ?? null,
          damName: dogData.damName ?? null,
          breederName: dogData.breederName ?? null,
          colour: dogData.colour ?? null,
          ownerId: exhibitorId,
        })
        .returning();

      // Create primary owner record
      await ctx.db.insert(dogOwners).values({
        dogId: dog!.id,
        userId: exhibitor ? exhibitor.id : null,
        ownerName,
        ownerAddress,
        ownerEmail: exhibitorEmail,
        isPrimary: true,
        sortOrder: 0,
      });

      return dog!;
    }),

  createManualEntry: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        dogId: z.string().uuid(),
        classIds: z.array(z.string().uuid()).min(1),
        exhibitorEmail: z.string().email(),
        handlerName: z.string().optional(),
        isNfc: z.boolean().default(false),
        paymentMethod: z.enum(['postal', 'cash', 'bank_transfer', 'online']).default('postal'),
        sundryItems: z
          .array(z.object({ sundryItemId: z.string().uuid(), quantity: z.number().int().min(1) }))
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Validate the show accepts entries (allow entries_open OR entries_closed for postal)
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
      });

      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      if (!['entries_open', 'entries_closed', 'published'].includes(show.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Show is not in a state that accepts entries',
        });
      }

      // Validate dog exists
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.dogId), isNull(dogs.deletedAt)),
      });

      if (!dog) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dog not found' });
      }

      // Find exhibitor by email
      const exhibitor = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.exhibitorEmail.toLowerCase()),
      });

      const exhibitorId = exhibitor?.id ?? ctx.session.user.id;

      // Validate classes belong to this show
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

      // Validate and price sundry items
      const sundryInputs = input.sundryItems ?? [];
      let selectedSundryItems: { id: string; name: string; priceInPence: number; quantity: number }[] = [];
      if (sundryInputs.length > 0) {
        const sundryIds = sundryInputs.map((s) => s.sundryItemId);
        const foundItems = await ctx.db.query.sundryItems.findMany({
          where: and(
            inArray(sundryItems.id, sundryIds),
            eq(sundryItems.showId, input.showId),
            eq(sundryItems.enabled, true)
          ),
        });
        if (foundItems.length !== sundryIds.length) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more sundry items are invalid' });
        }
        selectedSundryItems = foundItems.map((item) => ({
          id: item.id,
          name: item.name,
          priceInPence: item.priceInPence,
          quantity: sundryInputs.find((s) => s.sundryItemId === item.id)!.quantity,
        }));
      }

      const classFee = selectedClasses.reduce((sum, sc) => sum + sc.entryFee, 0);
      const sundryFee = selectedSundryItems.reduce((sum, s) => sum + s.priceInPence * s.quantity, 0);
      const totalAmount = classFee + sundryFee;

      // Create an order record (enables sundry item tracking + consistent reporting)
      const [order] = await ctx.db
        .insert(orders)
        .values({
          showId: input.showId,
          exhibitorId,
          status: 'paid',
          totalAmount,
        })
        .returning();

      // If the show already has catalogue numbers assigned to earlier
      // entries, slot this new entry in at the next available number so
      // Amanda doesn't have to remember to re-run the "Assign catalogue
      // numbers" action every time she adds a late entry. This uses
      // append-mode (max+1) so existing numbers stay stable — secretary
      // can still run a full class-first re-sort explicitly if desired.
      const existingNumbered = await ctx.db.query.entries.findFirst({
        where: and(
          eq(entries.showId, input.showId),
          eq(entries.status, 'confirmed'),
          isNotNull(entries.catalogueNumber),
        ),
      });
      let nextCatalogueNumber: string | null = null;
      if (existingNumbered) {
        const allNumbered = await ctx.db.query.entries.findMany({
          where: and(
            eq(entries.showId, input.showId),
            eq(entries.status, 'confirmed'),
            isNotNull(entries.catalogueNumber),
          ),
          columns: { catalogueNumber: true },
        });
        const highest = allNumbered.reduce((max, e) => {
          const n = Number(e.catalogueNumber);
          return Number.isFinite(n) && n > max ? n : max;
        }, 0);
        nextCatalogueNumber = String(highest + 1);
      }

      // Create entry — auto-confirmed for secretary entries
      const [entry] = await ctx.db
        .insert(entries)
        .values({
          showId: input.showId,
          dogId: input.dogId,
          exhibitorId,
          isNfc: input.isNfc,
          totalFee: classFee,
          orderId: order!.id,
          status: 'confirmed',
          catalogueNumber: nextCatalogueNumber,
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

      // Create sundry item records
      if (selectedSundryItems.length > 0) {
        await ctx.db.insert(orderSundryItems).values(
          selectedSundryItems.map((s) => ({
            orderId: order!.id,
            sundryItemId: s.id,
            quantity: s.quantity,
            unitPrice: s.priceInPence,
          }))
        );
      }

      // Create a payment record (manual — no Stripe), linked to the order
      await ctx.db.insert(payments).values({
        entryId: entry!.id,
        orderId: order!.id,
        amount: totalAmount,
        status: 'succeeded',
        type: 'initial',
      });

      // Audit log
      await ctx.db.insert(entryAuditLog).values({
        entryId: entry!.id,
        action: 'created',
        userId: ctx.session.user.id,
        changes: {
          source: 'secretary',
          paymentMethod: input.paymentMethod,
          exhibitorEmail: input.exhibitorEmail,
          handlerName: input.handlerName ?? null,
          sundryItems: selectedSundryItems.map((s) => ({ name: s.name, quantity: s.quantity })),
        },
        reason: `Entry created by secretary (${input.paymentMethod} payment)`,
      });

      return entry!;
    }),

  // ─── Show Requirements Checklist ───────────────────────

  getChecklist: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const items = await ctx.db.query.showChecklistItems.findMany({
        where: eq(showChecklistItems.showId, input.showId),
        orderBy: [asc(showChecklistItems.sortOrder)],
        with: {
          fileUpload: true,
        },
      });

      return items;
    }),

  seedChecklist: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Check if already seeded
      const [existing] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(showChecklistItems)
        .where(eq(showChecklistItems.showId, input.showId));

      if (Number(existing?.count) > 0) {
        return { seeded: false, message: 'Checklist already exists' };
      }

      // Get show details for date calculation and type filtering
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
      });

      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      const isChampionship = show.showType === 'championship';

      // Fetch assigned judges so we can create per-judge items
      const assignedJudges = await ctx.db.query.judgeAssignments.findMany({
        where: eq(judgeAssignments.showId, input.showId),
        with: { judge: true },
      });

      // Deduplicate judges (a judge may be assigned to multiple breeds)
      const uniqueJudges = new Map<string, { id: string; name: string }>();
      for (const a of assignedJudges) {
        if (a.judge && !uniqueJudges.has(a.judge.id)) {
          uniqueJudges.set(a.judge.id, { id: a.judge.id, name: a.judge.name });
        }
      }

      const itemsToInsert: Array<{
        showId: string;
        title: string;
        description: string | null;
        phase: typeof DEFAULT_CHECKLIST_ITEMS[number]['phase'];
        sortOrder: number;
        status: 'not_started';
        dueDate: string | null;
        autoDetectKey: string | null;
        actionKey: string | null;
        championshipOnly: boolean;
        relativeDueDays: number | null;
        requiresDocument: boolean;
        hasExpiry: boolean;
        entityType: string | null;
        entityId: string | null;
        entityName: string | null;
      }> = [];

      for (const item of DEFAULT_CHECKLIST_ITEMS) {
        if (item.championshipOnly && !isChampionship) continue;

        const dueDate =
          item.relativeDueDays !== undefined
            ? calculateDueDate(show.startDate, item.relativeDueDays)
            : null;

        if (item.perJudge && uniqueJudges.size > 0) {
          // Create one item per judge
          let subOrder = 0;
          for (const judge of uniqueJudges.values()) {
            itemsToInsert.push({
              showId: input.showId,
              title: `${item.title} — ${judge.name}`,
              description: item.description ?? null,
              phase: item.phase,
              sortOrder: item.sortOrder * 100 + subOrder,
              status: 'not_started',
              dueDate,
              autoDetectKey: item.autoDetectKey ?? null,
              actionKey: item.actionKey ?? null,
              championshipOnly: item.championshipOnly ?? false,
              relativeDueDays: item.relativeDueDays ?? null,
              requiresDocument: item.requiresDocument ?? false,
              hasExpiry: item.hasExpiry ?? false,
              entityType: 'judge',
              entityId: judge.id,
              entityName: judge.name,
            });
            subOrder++;
          }
        } else {
          // Regular item (or per-judge with no judges yet — create the base item)
          itemsToInsert.push({
            showId: input.showId,
            title: item.perJudge ? `${item.title} (per judge)` : item.title,
            description: item.description ?? null,
            phase: item.phase,
            sortOrder: item.sortOrder * 100,
            status: 'not_started',
            dueDate,
            autoDetectKey: item.autoDetectKey ?? null,
            actionKey: item.actionKey ?? null,
            championshipOnly: item.championshipOnly ?? false,
            relativeDueDays: item.relativeDueDays ?? null,
            requiresDocument: item.requiresDocument ?? false,
            hasExpiry: item.hasExpiry ?? false,
            entityType: null,
            entityId: null,
            entityName: null,
          });
        }
      }

      await ctx.db.insert(showChecklistItems).values(itemsToInsert);

      return { seeded: true, count: itemsToInsert.length };
    }),

  updateChecklistItem: secretaryProcedure
    .input(
      z.object({
        itemId: z.string().uuid(),
        status: z
          .enum(['not_started', 'in_progress', 'complete', 'not_applicable'])
          .optional(),
        notes: z.string().max(1000).nullable().optional(),
        assignedToName: z.string().max(255).nullable().optional(),
        fileUploadId: z.string().uuid().nullable().optional(),
        documentExpiryDate: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.showChecklistItems.findFirst({
        where: eq(showChecklistItems.id, input.itemId),
      });

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Checklist item not found',
        });
      }

      await verifyShowAccess(ctx.db, ctx.session.user.id, item.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const updates: Record<string, unknown> = {};
      if (input.status !== undefined) {
        updates.status = input.status;
        if (input.status === 'complete') {
          updates.completedAt = new Date();
          updates.completedByUserId = ctx.session.user.id;
        } else {
          updates.completedAt = null;
          updates.completedByUserId = null;
        }
      }
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.assignedToName !== undefined)
        updates.assignedToName = input.assignedToName;
      if (input.fileUploadId !== undefined)
        updates.fileUploadId = input.fileUploadId;
      if (input.documentExpiryDate !== undefined)
        updates.documentExpiryDate = input.documentExpiryDate;

      const [updated] = await ctx.db
        .update(showChecklistItems)
        .set(updates)
        .where(eq(showChecklistItems.id, input.itemId))
        .returning();

      return updated!;
    }),

  addChecklistItem: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        title: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
        phase: z.enum([
          'pre_planning',
          'planning',
          'pre_show',
          'final_prep',
          'show_day',
          'post_show',
        ]),
        dueDate: z.string().optional(),
        assignedToName: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Get max sort order for this phase
      const [maxSort] = await ctx.db
        .select({
          max: sql<number>`coalesce(max(${showChecklistItems.sortOrder}), -1)`,
        })
        .from(showChecklistItems)
        .where(
          and(
            eq(showChecklistItems.showId, input.showId),
            eq(showChecklistItems.phase, input.phase)
          )
        );

      const [created] = await ctx.db
        .insert(showChecklistItems)
        .values({
          showId: input.showId,
          title: input.title,
          description: input.description ?? null,
          phase: input.phase,
          sortOrder: (Number(maxSort?.max) ?? -1) + 1,
          dueDate: input.dueDate ?? null,
          assignedToName: input.assignedToName ?? null,
        })
        .returning();

      return created!;
    }),

  deleteChecklistItem: secretaryProcedure
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.showChecklistItems.findFirst({
        where: eq(showChecklistItems.id, input.itemId),
      });

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Checklist item not found',
        });
      }

      await verifyShowAccess(ctx.db, ctx.session.user.id, item.showId, { callerIsAdmin: ctx.callerIsAdmin });

      await ctx.db
        .delete(showChecklistItems)
        .where(eq(showChecklistItems.id, input.itemId));

      return { deleted: true };
    }),

  /** Returns auto-detection results for checklist items */
  getChecklistAutoDetect: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        with: {
          organisation: {
            columns: {
              payoutSortCode: true,
              payoutAccountNumber: true,
              payoutAccountName: true,
            },
          },
        },
      });

      if (!show) return {};

      const [classCount] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(showClasses)
        .where(eq(showClasses.showId, input.showId));

      // Use the same coverage logic as getJudgeCoverage — query classes + assignments
      const [showClassRows, assignmentRows, stewardCountRow, ringCountRow] = await Promise.all([
        ctx.db.query.showClasses.findMany({
          where: eq(showClasses.showId, input.showId),
          columns: { breedId: true, sex: true },
        }),
        ctx.db.query.judgeAssignments.findMany({
          where: eq(judgeAssignments.showId, input.showId),
          columns: { judgeId: true, breedId: true, sex: true },
        }),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(stewardAssignments)
          .where(eq(stewardAssignments.showId, input.showId)),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(rings)
          .where(eq(rings.showId, input.showId)),
      ]);

      const [stewardCount] = stewardCountRow;
      const [ringCount] = ringCountRow;

      // Full judge coverage: every unique breed+sex combo from classes must have a matching assignment
      const requiredCombos = new Map<string, { breedId: string | null; sex: string | null }>();
      for (const sc of showClassRows) {
        const key = `${sc.breedId ?? 'all'}:${sc.sex ?? 'null'}`;
        if (!requiredCombos.has(key)) requiredCombos.set(key, { breedId: sc.breedId, sex: sc.sex });
      }
      let allJudgesCovered = requiredCombos.size > 0;
      for (const req of requiredCombos.values()) {
        const covered = assignmentRows.some((a) => {
          const breedMatch = req.breedId === null ? a.breedId === null : (a.breedId === req.breedId || a.breedId === null);
          const sexMatch = req.sex === null ? a.sex === null : (a.sex === null || a.sex === req.sex);
          return breedMatch && sexMatch;
        });
        if (!covered) { allJudgesCovered = false; break; }
      }

      const detected: Record<string, boolean> = {
        venue_set: !!show.venueId,
        kc_licence_recorded: !!show.kcLicenceNo,
        classes_created: Number(classCount?.count) > 0,
        show_published: ['published', 'entries_open', 'entries_closed', 'in_progress', 'completed'].includes(show.status),
        entries_opened: ['entries_open', 'entries_closed', 'in_progress', 'completed'].includes(show.status),
        entries_closed: ['entries_closed', 'in_progress', 'completed'].includes(show.status),
        judges_assigned: allJudgesCovered,
        stewards_assigned: Number(stewardCount?.count) > 0,
        rings_created: Number(ringCount?.count) > 0,
        // Club needs payout bank details saved before we can open entries —
        // entry fees land in Remi's balance and we pay out by BACS after
        // the show.
        payout_details_set: !!(
          show.organisation?.payoutSortCode &&
          show.organisation?.payoutAccountNumber &&
          show.organisation?.payoutAccountName
        ),
      };

      // Check if all assigned judges have been sent offer letters
      if (assignmentRows.length > 0) {
        const uniqueJudgeIds = new Set(assignmentRows.map((a) => a.judgeId));

        const [contractCount] = await ctx.db
          .select({ count: sql<number>`count(distinct ${judgeContracts.judgeId})` })
          .from(judgeContracts)
          .where(eq(judgeContracts.showId, input.showId));

        detected.judge_offers_sent =
          Number(contractCount?.count) >= uniqueJudgeIds.size && uniqueJudgeIds.size > 0;
      } else {
        detected.judge_offers_sent = false;
      }

      // Additional auto-detect keys for lifecycle gates
      detected.entry_fees_set = show.firstEntryFee != null && show.firstEntryFee > 0;
      detected.entry_close_date_set = show.entryCloseDate != null;
      detected.secretary_details_set = !!(show.secretaryName && show.secretaryEmail);
      const scheduleData = show.scheduleData as Record<string, unknown> | null;
      const guarantors = (scheduleData?.guarantors as { name: string }[] | undefined) ?? [];
      const minGuarantors = show.showType === 'championship' ? 6 : 3;
      detected.guarantors_added = guarantors.length >= minGuarantors;

      // Championship shows: check Open + Limit for each sex per breed
      if (show.showType === 'championship' && Number(classCount?.count) > 0) {
        const showClassRows = await ctx.db.query.showClasses.findMany({
          where: eq(showClasses.showId, input.showId),
          with: { classDefinition: true },
        });

        let allBreedsComplete = true;
        const breedClassMap = new Map<string, { hasOpenDog: boolean; hasOpenBitch: boolean; hasLimitDog: boolean; hasLimitBitch: boolean }>();
        for (const sc of showClassRows) {
          if (!sc.breedId) continue;
          if (!breedClassMap.has(sc.breedId)) {
            breedClassMap.set(sc.breedId, { hasOpenDog: false, hasOpenBitch: false, hasLimitDog: false, hasLimitBitch: false });
          }
          const entry = breedClassMap.get(sc.breedId)!;
          const className = sc.classDefinition?.name?.toLowerCase() ?? '';
          if (className === 'open' && sc.sex === 'dog') entry.hasOpenDog = true;
          if (className === 'open' && sc.sex === 'bitch') entry.hasOpenBitch = true;
          if (className === 'limit' && sc.sex === 'dog') entry.hasLimitDog = true;
          if (className === 'limit' && sc.sex === 'bitch') entry.hasLimitBitch = true;
        }
        for (const [, entry] of breedClassMap) {
          if (!entry.hasOpenDog || !entry.hasOpenBitch || !entry.hasLimitDog || !entry.hasLimitBitch) {
            allBreedsComplete = false;
            break;
          }
        }
        detected.championship_classes_complete = breedClassMap.size > 0 && allBreedsComplete;
      } else {
        // Non-championship shows or shows with no classes — not applicable, mark as complete
        detected.championship_classes_complete = true;
      }

      return detected;
    }),

  // ── Phase Blockers (lifecycle gates) ──────────────────────
  getPhaseBlockers: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
      });
      if (!show) throw new TRPCError({ code: 'NOT_FOUND' });

      const [classCount, judgeCount, ringCount, stewardCount] = await Promise.all([
        ctx.db.select({ count: sql<number>`count(*)` }).from(showClasses).where(eq(showClasses.showId, input.showId)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(judgeAssignments).where(eq(judgeAssignments.showId, input.showId)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(rings).where(eq(rings.showId, input.showId)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(stewardAssignments).where(eq(stewardAssignments.showId, input.showId)),
      ]);

      const scheduleData = show.scheduleData as Record<string, unknown> | null;
      const guarantors = (scheduleData?.guarantors as { name: string }[] | undefined) ?? [];
      const minGuarantors = show.showType === 'championship' ? 6 : 3;

      type Blocker = {
        key: string;
        label: string;
        detail: string;
        actionPath: string;
        severity: 'required' | 'recommended';
      };

      // Blockers for opening entries
      const openEntriesBlockers: Blocker[] = [];

      if (Number(classCount[0]?.count) === 0) {
        openEntriesBlockers.push({
          key: 'no_classes', label: 'No classes created',
          detail: 'Add classes on the main show page',
          actionPath: '', severity: 'required',
        });
      }
      if (Number(judgeCount[0]?.count) === 0) {
        openEntriesBlockers.push({
          key: 'no_judge', label: 'No judge assigned',
          detail: 'Assign at least one judge on the People page',
          actionPath: '/people', severity: 'required',
        });
      }
      if (!show.firstEntryFee || show.firstEntryFee <= 0) {
        openEntriesBlockers.push({
          key: 'no_entry_fees', label: 'Entry fees not set',
          detail: 'Click Edit on the main show page to set entry fees',
          actionPath: '', severity: 'required',
        });
      }
      if (!show.entryCloseDate) {
        openEntriesBlockers.push({
          key: 'no_close_date', label: 'Entry close date not set',
          detail: 'Click Edit on the main show page to set a close date',
          actionPath: '', severity: 'required',
        });
      }
      if (!show.secretaryName || !show.secretaryEmail) {
        openEntriesBlockers.push({
          key: 'no_secretary_details', label: 'Secretary name or email missing',
          detail: 'Click Edit on the main show page to add secretary details',
          actionPath: '', severity: 'required',
        });
      }
      if (guarantors.length < minGuarantors) {
        openEntriesBlockers.push({
          key: 'insufficient_guarantors',
          label: `Guarantors (${guarantors.length} of ${minGuarantors})`,
          detail: `${show.showType === 'championship' ? 'Championship' : 'Open'} shows need ${minGuarantors} guarantors`,
          actionPath: '/schedule', severity: 'required',
        });
      }
      // Minimum class count validation (RKC regulation, non-companion shows only)
      if (show.showType !== 'companion') {
        const numClasses = Number(classCount[0]?.count);
        const minClasses = show.showScope === 'single_breed' ? 12 : 16;
        if (numClasses > 0 && numClasses < minClasses) {
          openEntriesBlockers.push({
            key: 'insufficient_classes',
            label: `Only ${numClasses} classes (RKC minimum: ${minClasses})`,
            detail: `${show.showScope === 'single_breed' ? 'Single breed' : 'Multi-breed'} shows should have at least ${minClasses} classes per RKC regulations`,
            actionPath: '', severity: 'recommended',
          });
        }
      }

      if (!show.venueId) {
        openEntriesBlockers.push({
          key: 'no_venue', label: 'Venue not confirmed',
          detail: 'Confirm the show venue',
          actionPath: '', severity: 'recommended',
        });
      }
      if (!show.kcLicenceNo) {
        openEntriesBlockers.push({
          key: 'no_rkc_licence', label: 'RKC licence not recorded',
          detail: 'Record the RKC licence number',
          actionPath: '', severity: 'recommended',
        });
      }

      // Championship shows: every breed with classes must have Open + Limit for each sex
      // Skip for single-breed shows — their classes are breed-less by design
      if (show.showType === 'championship' && show.showScope !== 'single_breed' && Number(classCount[0]?.count) > 0) {
        const showClassRows = await ctx.db.query.showClasses.findMany({
          where: eq(showClasses.showId, input.showId),
          with: { classDefinition: true },
        });

        // Group classes by breedId, only for breed-specific classes
        const breedClassMap = new Map<string, { hasOpenDog: boolean; hasOpenBitch: boolean; hasLimitDog: boolean; hasLimitBitch: boolean }>();
        for (const sc of showClassRows) {
          if (!sc.breedId) continue;
          if (!breedClassMap.has(sc.breedId)) {
            breedClassMap.set(sc.breedId, { hasOpenDog: false, hasOpenBitch: false, hasLimitDog: false, hasLimitBitch: false });
          }
          const entry = breedClassMap.get(sc.breedId)!;
          const className = sc.classDefinition?.name?.toLowerCase() ?? '';
          if (className === 'open' && sc.sex === 'dog') entry.hasOpenDog = true;
          if (className === 'open' && sc.sex === 'bitch') entry.hasOpenBitch = true;
          if (className === 'limit' && sc.sex === 'dog') entry.hasLimitDog = true;
          if (className === 'limit' && sc.sex === 'bitch') entry.hasLimitBitch = true;
        }

        // Find breeds missing required classes
        const missingBreedIds: string[] = [];
        for (const [breedId, entry] of breedClassMap) {
          if (!entry.hasOpenDog || !entry.hasOpenBitch || !entry.hasLimitDog || !entry.hasLimitBitch) {
            missingBreedIds.push(breedId);
          }
        }

        if (missingBreedIds.length > 0) {
          // Fetch breed names for the label
          const missingBreeds = await ctx.db.query.breeds.findMany({
            where: inArray(breeds.id, missingBreedIds),
            columns: { name: true },
          });
          const breedNames = missingBreeds.map((b) => b.name);
          const breedList = breedNames.length <= 3
            ? breedNames.join(', ')
            : `${breedNames.slice(0, 2).join(', ')} + ${breedNames.length - 2} more`;

          openEntriesBlockers.push({
            key: 'championship_missing_classes',
            label: `Open + Limit classes missing (${breedList})`,
            detail: 'Championship shows require Open and Limit classes for each sex per RKC regulations',
            actionPath: '', severity: 'required',
          });
        }
      }

      const requiredBlockers = openEntriesBlockers.filter((b) => b.severity === 'required');

      // Blockers for starting show (entries_closed → in_progress)
      const startShowBlockers: Blocker[] = [];
      if (Number(ringCount[0]?.count) === 0) {
        startShowBlockers.push({
          key: 'no_rings', label: 'Rings not set up',
          detail: 'Create at least one ring for judging',
          actionPath: '/people', severity: 'recommended',
        });
      }
      if (Number(stewardCount[0]?.count) === 0) {
        startShowBlockers.push({
          key: 'no_stewards', label: 'No stewards assigned',
          detail: 'Assign stewards to help on show day',
          actionPath: '/people', severity: 'recommended',
        });
      }

      return {
        canOpenEntries: requiredBlockers.length === 0,
        openEntriesBlockers,
        canStartShow: true, // start show blockers are all recommended
        startShowBlockers,
      };
    }),

  // ── Show Phase Context (lightweight, for section nav badges) ──
  getShowPhaseContext: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { status: true, resultsPublishedAt: true },
      });
      if (!show) return null;

      const phase = show.status === 'draft' || show.status === 'published' ? 'setup'
        : show.status === 'entries_open' ? 'entries_open'
        : show.status === 'entries_closed' ? 'pre_show'
        : show.status === 'in_progress' ? 'show_day'
        : show.status === 'completed' ? 'post_show'
        : 'setup';

      return {
        phase,
        resultsPublished: !!show.resultsPublishedAt,
      };
    }),

  // ─── Judge Contracts ────────────────────────────────────
  getJudgeContracts: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      return ctx.db.query.judgeContracts.findMany({
        where: eq(judgeContracts.showId, input.showId),
        with: {
          judge: true,
          show: { with: { venue: true, organisation: true } },
        },
        orderBy: desc(judgeContracts.createdAt),
      });
    }),

  updateJudgeExpenses: secretaryProcedure
    .input(
      z.object({
        contractId: z.string().uuid(),
        hotelCost: z.number().int().min(0).nullable(),
        travelCost: z.number().int().min(0).nullable(),
        otherExpenses: z.number().int().min(0).nullable(),
        expenseNotes: z.string().max(500).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.judgeContracts.findFirst({
        where: eq(judgeContracts.id, input.contractId),
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyShowAccess(ctx.db, ctx.session.user.id, contract.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const [updated] = await ctx.db
        .update(judgeContracts)
        .set({
          hotelCost: input.hotelCost,
          travelCost: input.travelCost,
          otherExpenses: input.otherExpenses,
          expenseNotes: input.expenseNotes,
        })
        .where(eq(judgeContracts.id, input.contractId))
        .returning();
      return updated!;
    }),

  sendJudgeOffer: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        judgeId: z.string().uuid(),
        judgeEmail: z.string().email(),
        notes: z.string().max(2000).optional(),
        hotelCost: z.number().int().min(0).optional(),
        travelCost: z.number().int().min(0).optional(),
        otherExpenses: z.number().int().min(0).optional(),
        expenseNotes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Fetch judge info
      const judge = await ctx.db.query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
      });
      if (!judge) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Judge not found' });
      }

      // Update judge's contact email if not already set
      if (!judge.contactEmail) {
        await ctx.db
          .update(judges)
          .set({ contactEmail: input.judgeEmail })
          .where(eq(judges.id, input.judgeId));
      }

      // Fetch show with venue, org, breed, and classes
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        with: { venue: true, organisation: true, breed: true, showClasses: { with: { breed: true } } },
      });
      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      // Get breeds assigned to this judge for this show
      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: and(
          eq(judgeAssignments.showId, input.showId),
          eq(judgeAssignments.judgeId, input.judgeId)
        ),
        with: { breed: true, ring: true },
      });

      // Derive breed text: show.breed (single-breed), class breeds, or show name
      const showBreedNames = show.breed
        ? [show.breed.name]
        : [...new Set(show.showClasses.filter((sc) => sc.breed).map((sc) => sc.breed!.name))];
      const breedsText = buildJudgeBreedText(assignments, showBreedNames, show.name);

      // Token expires in 30 days
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);

      // Create contract record
      const [contract] = await ctx.db
        .insert(judgeContracts)
        .values({
          showId: input.showId,
          judgeId: input.judgeId,
          judgeName: judge.name,
          judgeEmail: input.judgeEmail,
          stage: 'offer_sent',
          offerSentAt: new Date(),
          tokenExpiresAt,
          notes: input.notes ?? null,
          hotelCost: input.hotelCost ?? null,
          travelCost: input.travelCost ?? null,
          otherExpenses: input.otherExpenses ?? null,
          expenseNotes: input.expenseNotes ?? null,
        })
        .returning();

      if (!contract) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create contract' });
      }

      // Build and send email
      const baseUrl = getBaseUrl();
      const acceptUrl = `${baseUrl}/api/judge-contract/${contract.offerToken}`;

      const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      const venue = show.venue
        ? `${show.venue.name}${show.venue.postcode ? `, ${show.venue.postcode}` : ''}`
        : 'Venue TBC';

      const orgName = show.organisation?.name ?? 'the Show Society';

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">

    <!-- Header -->
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; color: #2D5F3F; letter-spacing: -0.5px;">Remi</h1>
    </div>

    <!-- Main card -->
    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

      <!-- Banner -->
      <div style="background: #2D5F3F; padding: 24px 24px 20px; text-align: center;">
        <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Judging Appointment Offer</h2>
        <p style="margin: 8px 0 0; color: #b8d4c4; font-size: 14px;">
          from ${orgName}
        </p>
      </div>

      <!-- Letter body -->
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #1a1a1a; line-height: 1.6;">
          Dear ${judge.name},
        </p>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          On behalf of ${orgName}, I have much pleasure in inviting you to judge at our forthcoming show. The details are as follows:
        </p>

        <!-- Show details table -->
        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444; width: 120px;">Show</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${show.name}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Date</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${showDate}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Venue</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${venue}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Breeds</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${breedsText}</td>
          </tr>
          ${show.showType ? `<tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Show Type</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${show.showType.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</td>
          </tr>` : ''}
          ${(() => {
            const parts: string[] = [];
            if (input.hotelCost && input.hotelCost > 0) parts.push(`Hotel: £${(input.hotelCost / 100).toFixed(2)}`);
            if (input.travelCost && input.travelCost > 0) parts.push(`Travel: £${(input.travelCost / 100).toFixed(2)}`);
            if (input.otherExpenses && input.otherExpenses > 0) parts.push(`Other: £${(input.otherExpenses / 100).toFixed(2)}`);
            if (parts.length === 0) return '';
            const expText = parts.join(', ') + (input.expenseNotes ? ` (${input.expenseNotes})` : '');
            return `<tr>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Expenses</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${expText}</td>
            </tr>`;
          })()}
        </table>

        ${input.notes ? `<p style="font-size: 14px; color: #555; line-height: 1.6; padding: 12px; background: #f9f8f6; border-radius: 8px;">${input.notes}</p>` : ''}

        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          If you are willing to accept this appointment, please confirm by clicking the button below. This constitutes the formal written offer as required under Royal Kennel Club regulations.
        </p>

        <!-- Buttons -->
        <div style="text-align: center; margin: 28px 0;">
          <a href="${acceptUrl}?action=accept"
             style="display: inline-block; background: #2D5F3F; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none; margin-bottom: 12px;">
            Accept Appointment
          </a>
          <br>
          <a href="${acceptUrl}?action=decline"
             style="display: inline-block; color: #888; padding: 8px 16px; font-size: 13px; text-decoration: underline; margin-top: 8px;">
            Decline
          </a>
        </div>

        <p style="font-size: 13px; color: #999; line-height: 1.5; text-align: center;">
          This link will expire on ${tokenExpiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 16px; font-size: 12px; color: #999;">
      <p style="margin: 0;">
        This offer was sent by <strong>Remi</strong> on behalf of ${orgName}.
      </p>
      <p style="margin: 8px 0 0;">
        If you have any questions, please reply to this email.
      </p>
    </div>
  </div>
</body>
</html>`;

      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>';

      try {
        await resend.emails.send({
          from: emailFrom,
          to: input.judgeEmail,
          replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
          subject: `Judging Offer — ${show.name}`,
          html,
        });
      } catch (error) {
        console.error('[email] Failed to send judge offer:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to send offer email. The contract was created but the email could not be delivered.',
        });
      }

      return contract;
    }),

  resendJudgeOffer: secretaryProcedure
    .input(z.object({ contractId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.judgeContracts.findFirst({
        where: eq(judgeContracts.id, input.contractId),
        with: {
          show: { with: { venue: true, organisation: true, breed: true, showClasses: { with: { breed: true } } } },
          judge: true,
        },
      });

      if (!contract) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contract not found' });
      }

      await verifyShowAccess(ctx.db, ctx.session.user.id, contract.showId, { callerIsAdmin: ctx.callerIsAdmin });

      if (contract.stage !== 'offer_sent') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only resend offers that are in the "offer sent" stage',
        });
      }

      // Refresh token expiry
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);

      await ctx.db
        .update(judgeContracts)
        .set({ tokenExpiresAt, offerSentAt: new Date() })
        .where(eq(judgeContracts.id, input.contractId));

      // Get breed assignments
      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: and(
          eq(judgeAssignments.showId, contract.showId),
          eq(judgeAssignments.judgeId, contract.judgeId)
        ),
        with: { breed: true },
      });

      const showBreedNames = contract.show.breed
        ? [contract.show.breed.name]
        : [...new Set(contract.show.showClasses.filter((sc) => sc.breed).map((sc) => sc.breed!.name))];
      const breedsText = buildJudgeBreedText(assignments, showBreedNames, contract.show.name);

      const baseUrl = getBaseUrl();
      const acceptUrl = `${baseUrl}/api/judge-contract/${contract.offerToken}`;
      const show = contract.show;
      const orgName = show.organisation?.name ?? 'the Show Society';

      const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      const venue = show.venue
        ? `${show.venue.name}${show.venue.postcode ? `, ${show.venue.postcode}` : ''}`
        : 'Venue TBC';

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; color: #2D5F3F; letter-spacing: -0.5px;">Remi</h1>
    </div>
    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #2D5F3F; padding: 24px 24px 20px; text-align: center;">
        <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Judging Appointment Offer</h2>
        <p style="margin: 8px 0 0; color: #b8d4c4; font-size: 14px;">Reminder from ${orgName}</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #1a1a1a; line-height: 1.6;">Dear ${contract.judgeName},</p>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          This is a reminder regarding our invitation for you to judge at our show. We would be delighted if you could confirm your acceptance at your earliest convenience.
        </p>
        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
          <tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444; width: 120px;">Show</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${show.name}</td></tr>
          <tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Date</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${showDate}</td></tr>
          <tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Venue</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${venue}</td></tr>
          <tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Breeds</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${breedsText}</td></tr>
        </table>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${acceptUrl}?action=accept" style="display: inline-block; background: #2D5F3F; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none; margin-bottom: 12px;">Accept Appointment</a>
          <br>
          <a href="${acceptUrl}?action=decline" style="display: inline-block; color: #888; padding: 8px 16px; font-size: 13px; text-decoration: underline; margin-top: 8px;">Decline</a>
        </div>
        <p style="font-size: 13px; color: #999; line-height: 1.5; text-align: center;">
          This link will expire on ${tokenExpiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
        </p>
      </div>
    </div>
    <div style="text-align: center; padding: 24px 16px; font-size: 12px; color: #999;">
      <p style="margin: 0;">This offer was sent by <strong>Remi</strong> on behalf of ${orgName}.</p>
    </div>
  </div>
</body>
</html>`;

      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>';

      try {
        const result = await resend.emails.send({
          from: emailFrom,
          to: contract.judgeEmail,
          replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
          subject: `Reminder: Judging Offer — ${show.name}`,
          html,
        });
        // Resend SDK v6 returns { data, error } instead of throwing on HTTP errors,
        // so a 4xx/5xx response leaves us with a non-null `error` and we must check it.
        if (result.error) {
          console.error('[email] Resend API rejected judge offer resend:', result.error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Email provider error: ${result.error.message ?? 'unknown error'}. Please try again in a few minutes.`,
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[email] Failed to resend judge offer:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to resend offer email.',
        });
      }

      return { resent: true };
    }),

  sendJudgeConfirmation: secretaryProcedure
    .input(z.object({ contractId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.judgeContracts.findFirst({
        where: eq(judgeContracts.id, input.contractId),
        with: {
          show: { with: { venue: true, organisation: true } },
          judge: true,
        },
      });

      if (!contract) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contract not found' });
      }

      await verifyShowAccess(ctx.db, ctx.session.user.id, contract.showId, { callerIsAdmin: ctx.callerIsAdmin });

      if (contract.stage !== 'offer_accepted') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only confirm offers that have been accepted',
        });
      }

      // Get breed assignments
      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: and(
          eq(judgeAssignments.showId, contract.showId),
          eq(judgeAssignments.judgeId, contract.judgeId)
        ),
        with: { breed: true, ring: true },
      });

      const breedNames = assignments.filter((a) => a.breed).map((a) => a.breed!.name);
      const breedsText = breedNames.length > 0 ? breedNames.join(', ') : 'All breeds';

      const ringNums = assignments.filter((a) => a.ring).map((a) => `Ring ${a.ring!.number}`);
      const ringsText = ringNums.length > 0 ? ringNums.join(', ') : 'TBC';

      const show = contract.show;
      const orgName = show.organisation?.name ?? 'the Show Society';

      const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      const venue = show.venue
        ? `${show.venue.name}${show.venue.address ? `, ${show.venue.address}` : ''}${show.venue.postcode ? `, ${show.venue.postcode}` : ''}`
        : 'Venue TBC';

      // Update contract stage
      await ctx.db
        .update(judgeContracts)
        .set({ stage: 'confirmed', confirmedAt: new Date() })
        .where(eq(judgeContracts.id, input.contractId));

      // Backfill for contracts confirmed before the archive feature landed.
      if (!contract.contractPdfKey) {
        try {
          await generateJudgeContractPdf(input.contractId);
        } catch (err) {
          console.error(
            `[judge-contract] Failed to backfill PDF snapshot for contract ${input.contractId} (show ${contract.showId}):`,
            err,
          );
        }
      }

      // Auto-update checklist items for this judge
      await ctx.db
        .update(showChecklistItems)
        .set({
          status: 'complete',
          completedAt: new Date(),
          autoDetected: true,
        })
        .where(
          and(
            eq(showChecklistItems.showId, contract.showId),
            eq(showChecklistItems.entityType, 'judge'),
            eq(showChecklistItems.entityId, contract.judgeId),
            eq(showChecklistItems.actionKey, 'judge_confirmation')
          )
        );

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; color: #2D5F3F; letter-spacing: -0.5px;">Remi</h1>
    </div>
    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #2D5F3F; padding: 24px 24px 20px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 8px;">&#10003;</div>
        <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Appointment Confirmed</h2>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; color: #1a1a1a; line-height: 1.6;">Dear ${contract.judgeName},</p>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          Thank you for accepting our invitation. This letter confirms your appointment to judge at our show. Please retain this as your formal confirmation.
        </p>
        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
          <tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444; width: 120px;">Show</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${show.name}</td></tr>
          <tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Date</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${showDate}</td></tr>
          <tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Venue</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${venue}</td></tr>
          <tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Breeds</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${breedsText}</td></tr>
          <tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #444;">Ring(s)</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a;">${ringsText}</td></tr>
        </table>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          Further details regarding entry numbers and the running order will be sent to you closer to the show date. We look forward to welcoming you.
        </p>
        <p style="font-size: 15px; color: #333; line-height: 1.6; margin-top: 24px;">
          Yours sincerely,<br>
          <strong>${orgName}</strong>
        </p>
      </div>
    </div>
    <div style="text-align: center; padding: 24px 16px; font-size: 12px; color: #999;">
      <p style="margin: 0;">This confirmation was sent by <strong>Remi</strong> on behalf of ${orgName}.</p>
    </div>
  </div>
</body>
</html>`;

      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>';

      try {
        await resend.emails.send({
          from: emailFrom,
          to: contract.judgeEmail,
          replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
          subject: `Appointment Confirmed — ${show.name}`,
          html,
        });
      } catch (error) {
        console.error('[email] Failed to send judge confirmation:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Contract was confirmed but the email could not be delivered.',
        });
      }

      return { confirmed: true };
    }),

  // ── Checklist Command Center Procedures ───────────────────

  /** Aggregated judge pipeline view for the checklist command center */
  getChecklistJudgeSummary: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Get all judge assignments with breeds
      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: eq(judgeAssignments.showId, input.showId),
        with: { judge: true, breed: true, ring: true },
      });

      // Get all contracts for this show
      const contracts = await ctx.db.query.judgeContracts.findMany({
        where: eq(judgeContracts.showId, input.showId),
        orderBy: desc(judgeContracts.createdAt),
      });

      // Build latest contract per judge
      const latestContracts = new Map<string, typeof contracts[number]>();
      for (const c of contracts) {
        if (!latestContracts.has(c.judgeId)) {
          latestContracts.set(c.judgeId, c);
        }
      }

      // Deduplicate judges
      const judgeMap = new Map<string, {
        judgeId: string;
        name: string;
        kcNumber: string | null;
        contactEmail: string | null;
        breeds: string[];
        rings: string[];
      }>();

      for (const a of assignments) {
        const existing = judgeMap.get(a.judgeId);
        if (existing) {
          if (a.breed && !existing.breeds.includes(a.breed.name)) {
            existing.breeds.push(a.breed.name);
          }
          if (a.ring && !existing.rings.includes(`Ring ${a.ring.number}`)) {
            existing.rings.push(`Ring ${a.ring.number}`);
          }
        } else {
          judgeMap.set(a.judgeId, {
            judgeId: a.judgeId,
            name: a.judge.name,
            kcNumber: a.judge.kcNumber,
            contactEmail: a.judge.contactEmail,
            breeds: a.breed ? [a.breed.name] : [],
            rings: a.ring ? [`Ring ${a.ring.number}`] : [],
          });
        }
      }

      // Combine into pipeline view
      const judges = Array.from(judgeMap.values()).map((j) => {
        const contract = latestContracts.get(j.judgeId);
        return {
          ...j,
          contractId: contract?.id ?? null,
          stage: contract?.stage ?? null,
          offerSentAt: contract?.offerSentAt ?? null,
          acceptedAt: contract?.acceptedAt ?? null,
          confirmedAt: contract?.confirmedAt ?? null,
          declinedAt: contract?.declinedAt ?? null,
          hotelCost: contract?.hotelCost ?? null,
          travelCost: contract?.travelCost ?? null,
          otherExpenses: contract?.otherExpenses ?? null,
          expenseNotes: contract?.expenseNotes ?? null,
          judgeEmail: contract?.judgeEmail ?? j.contactEmail,
        };
      });

      // Summary counts
      const summary = {
        total: judges.length,
        noOffer: judges.filter((j) => !j.stage).length,
        offerSent: judges.filter((j) => j.stage === 'offer_sent').length,
        accepted: judges.filter((j) => j.stage === 'offer_accepted').length,
        confirmed: judges.filter((j) => j.stage === 'confirmed').length,
        declined: judges.filter((j) => j.stage === 'declined').length,
      };

      return { judges, summary };
    }),

  /** Re-sync per-judge checklist items after judges are added/removed */
  reseedChecklistJudges: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
      });
      if (!show) throw new TRPCError({ code: 'NOT_FOUND' });

      // Get current assigned judges
      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: eq(judgeAssignments.showId, input.showId),
        with: { judge: true },
      });
      const currentJudges = new Map<string, string>();
      for (const a of assignments) {
        if (a.judge && !currentJudges.has(a.judge.id)) {
          currentJudges.set(a.judge.id, a.judge.name);
        }
      }

      // Get existing per-judge checklist items
      const existingItems = await ctx.db.query.showChecklistItems.findMany({
        where: and(
          eq(showChecklistItems.showId, input.showId),
          eq(showChecklistItems.entityType, 'judge')
        ),
      });

      // Find judge IDs already in checklist
      const existingJudgeIds = new Set(
        existingItems.map((i) => i.entityId).filter(Boolean)
      );

      // Per-judge default items
      const perJudgeDefaults = DEFAULT_CHECKLIST_ITEMS.filter((d) => d.perJudge);

      // Insert items for new judges
      const newItems: typeof existingItems = [];
      let inserted = 0;
      for (const [judgeId, judgeName] of currentJudges) {
        if (existingJudgeIds.has(judgeId)) continue;

        for (const def of perJudgeDefaults) {
          if (def.championshipOnly && show.showType !== 'championship') continue;
          const dueDate = def.relativeDueDays !== undefined
            ? calculateDueDate(show.startDate, def.relativeDueDays)
            : null;

          await ctx.db.insert(showChecklistItems).values({
            showId: input.showId,
            title: `${def.title} — ${judgeName}`,
            description: def.description ?? null,
            phase: def.phase,
            sortOrder: def.sortOrder * 100,
            dueDate,
            autoDetectKey: def.autoDetectKey ?? null,
            actionKey: def.actionKey ?? null,
            championshipOnly: def.championshipOnly ?? false,
            relativeDueDays: def.relativeDueDays ?? null,
            requiresDocument: def.requiresDocument ?? false,
            hasExpiry: def.hasExpiry ?? false,
            entityType: 'judge',
            entityId: judgeId,
            entityName: judgeName,
          });
          inserted++;
        }
      }

      // Mark removed judges as not_applicable
      let marked = 0;
      const removedJudgeIds = [...existingJudgeIds].filter(
        (id) => id && !currentJudges.has(id)
      );
      if (removedJudgeIds.length > 0) {
        await ctx.db
          .update(showChecklistItems)
          .set({
            status: 'not_applicable',
            notes: 'Judge removed from show',
            autoDetected: true,
          })
          .where(
            and(
              eq(showChecklistItems.showId, input.showId),
              eq(showChecklistItems.entityType, 'judge'),
              inArray(showChecklistItems.entityId, removedJudgeIds as string[])
            )
          );
        marked = removedJudgeIds.length;
      }

      // Auto-sync contract status for existing items
      const contracts = await ctx.db.query.judgeContracts.findMany({
        where: eq(judgeContracts.showId, input.showId),
        orderBy: desc(judgeContracts.createdAt),
      });
      const latestContracts = new Map<string, typeof contracts[number]>();
      for (const c of contracts) {
        if (!latestContracts.has(c.judgeId)) latestContracts.set(c.judgeId, c);
      }

      // Batch: collect item IDs per update type to avoid N+1 updates
      const completeIds: string[] = [];
      const declinedIds: string[] = [];
      let declineNote = '';

      for (const item of existingItems) {
        if (!item.entityId || item.status === 'complete' || item.status === 'not_applicable') continue;
        const contract = latestContracts.get(item.entityId);
        if (!contract) continue;

        if (item.actionKey === 'judge_acceptance' && (contract.stage === 'offer_accepted' || contract.stage === 'confirmed')) {
          completeIds.push(item.id);
        }
        if (item.actionKey === 'judge_confirmation' && contract.stage === 'confirmed') {
          completeIds.push(item.id);
        }
        if (contract.stage === 'declined') {
          declinedIds.push(item.id);
          declineNote = `Declined on ${new Date(contract.declinedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
      }

      if (completeIds.length > 0) {
        await ctx.db.update(showChecklistItems).set({
          status: 'complete', completedAt: new Date(), autoDetected: true,
        }).where(inArray(showChecklistItems.id, completeIds));
      }
      if (declinedIds.length > 0) {
        await ctx.db.update(showChecklistItems).set({
          status: 'not_applicable', autoDetected: true, notes: declineNote,
        }).where(inArray(showChecklistItems.id, declinedIds));
      }

      return { inserted, marked, total: currentJudges.size };
    }),

  /** Send offers to all judges without active contracts */
  sendBulkJudgeOffers: secretaryProcedure
    .input(z.object({
      showId: z.string().uuid(),
      judgeIds: z.array(z.string().uuid()),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        with: { venue: true, organisation: true },
      });
      if (!show) throw new TRPCError({ code: 'NOT_FOUND' });

      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>';
      const baseUrl = getBaseUrl();
      const orgName = show.organisation?.name ?? 'the Show Society';

      const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      const venue = show.venue
        ? `${show.venue.name}${show.venue.postcode ? `, ${show.venue.postcode}` : ''}`
        : 'Venue TBC';

      // Pre-fetch all data to avoid N+1 queries in the loop
      const allJudges = await ctx.db.query.judges.findMany({
        where: inArray(judges.id, input.judgeIds),
      });
      const judgeMap = new Map(allJudges.map((j) => [j.id, j]));

      const allContracts = await ctx.db.query.judgeContracts.findMany({
        where: and(
          eq(judgeContracts.showId, input.showId),
          inArray(judgeContracts.judgeId, input.judgeIds)
        ),
        orderBy: desc(judgeContracts.createdAt),
      });
      const latestContractByJudge = new Map<string, typeof allContracts[number]>();
      for (const c of allContracts) {
        if (!latestContractByJudge.has(c.judgeId)) latestContractByJudge.set(c.judgeId, c);
      }

      const allAssignments = await ctx.db.query.judgeAssignments.findMany({
        where: and(
          eq(judgeAssignments.showId, input.showId),
          inArray(judgeAssignments.judgeId, input.judgeIds)
        ),
        with: { breed: true },
      });
      const assignmentsByJudge = new Map<string, typeof allAssignments>();
      for (const a of allAssignments) {
        const list = assignmentsByJudge.get(a.judgeId) ?? [];
        list.push(a);
        assignmentsByJudge.set(a.judgeId, list);
      }

      let sent = 0;
      let skipped = 0;
      const errors: string[] = [];

      // Process in batches of 5 to respect Resend rate limits
      for (let i = 0; i < input.judgeIds.length; i++) {
        const judgeId = input.judgeIds[i]!;

        const judge = judgeMap.get(judgeId);
        if (!judge || !judge.contactEmail) {
          skipped++;
          continue;
        }

        // Skip if already has an active contract
        const existingContract = latestContractByJudge.get(judgeId);
        if (existingContract && existingContract.stage !== 'declined') {
          skipped++;
          continue;
        }

        const assignments = assignmentsByJudge.get(judgeId) ?? [];
        const breedsText = assignments.filter((a) => a.breed).map((a) => a.breed!.name).join(', ') || 'All breeds';

        const tokenExpiresAt = new Date();
        tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);

        try {
          const [contract] = await ctx.db.insert(judgeContracts).values({
            showId: input.showId,
            judgeId,
            judgeName: judge.name,
            judgeEmail: judge.contactEmail,
            stage: 'offer_sent',
            offerSentAt: new Date(),
            tokenExpiresAt,
          }).returning();

          const acceptUrl = `${baseUrl}/api/judge-contract/${contract!.offerToken}`;

          await resend.emails.send({
            from: emailFrom,
            to: judge.contactEmail,
            replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
            subject: `Judging Offer — ${show.name}`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="text-align:center;padding:24px 0;"><h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#2D5F3F;">Remi</h1></div>
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#2D5F3F;padding:24px;text-align:center;">
      <h2 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Judging Appointment Offer</h2>
      <p style="margin:8px 0 0;color:#b8d4c4;font-size:14px;">from ${orgName}</p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:15px;color:#1a1a1a;line-height:1.6;">Dear ${judge.name},</p>
      <p style="font-size:15px;color:#333;line-height:1.6;">On behalf of ${orgName}, I have much pleasure in inviting you to judge at our forthcoming show.</p>
      <table style="width:100%;margin:20px 0;border-collapse:collapse;">
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#444;width:120px;">Show</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">${show.name}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#444;">Date</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">${showDate}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#444;">Venue</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">${venue}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#444;">Breeds</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">${breedsText}</td></tr>
      </table>
      <p style="font-size:15px;color:#333;line-height:1.6;">Please confirm by clicking below.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${acceptUrl}?action=accept" style="display:inline-block;background:#2D5F3F;color:#fff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;">Accept Appointment</a>
        <br><a href="${acceptUrl}?action=decline" style="display:inline-block;color:#888;padding:8px 16px;font-size:13px;text-decoration:underline;margin-top:8px;">Decline</a>
      </div>
      <p style="font-size:13px;color:#999;text-align:center;">This link expires on ${tokenExpiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
    </div>
  </div>
</div></body></html>`,
          });
          sent++;
        } catch (error) {
          console.error(`[bulk-offer] Failed for ${judge.name}:`, error);
          errors.push(judge.name);
        }

        // Rate limit: pause every 5 emails
        if ((i + 1) % 5 === 0 && i < input.judgeIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      return { sent, skipped, errors };
    }),

  /** Send confirmation letters to all accepted judges in bulk */
  bulkSendJudgeConfirmations: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Find all accepted (not yet confirmed) contracts
      const acceptedContracts = await ctx.db.query.judgeContracts.findMany({
        where: and(
          eq(judgeContracts.showId, input.showId),
          eq(judgeContracts.stage, 'offer_accepted')
        ),
        with: {
          show: { with: { venue: true, organisation: true } },
          judge: true,
        },
      });

      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>';

      // Pre-fetch all assignments to avoid N+1 queries
      const judgeIds = acceptedContracts.map((c) => c.judgeId);
      const allAssignments = judgeIds.length > 0
        ? await ctx.db.query.judgeAssignments.findMany({
            where: and(
              eq(judgeAssignments.showId, input.showId),
              inArray(judgeAssignments.judgeId, judgeIds)
            ),
            with: { breed: true, ring: true },
          })
        : [];
      const assignmentsByJudge = new Map<string, typeof allAssignments>();
      for (const a of allAssignments) {
        const list = assignmentsByJudge.get(a.judgeId) ?? [];
        list.push(a);
        assignmentsByJudge.set(a.judgeId, list);
      }

      let sent = 0;
      const errors: string[] = [];

      for (let i = 0; i < acceptedContracts.length; i++) {
        const contract = acceptedContracts[i]!;
        try {
          const assignments = assignmentsByJudge.get(contract.judgeId) ?? [];

          const breedsText = assignments.filter((a) => a.breed).map((a) => a.breed!.name).join(', ') || 'All breeds';
          const ringsText = assignments.filter((a) => a.ring).map((a) => `Ring ${a.ring!.number}`).join(', ') || 'TBC';
          const show = contract.show;
          const orgName = show.organisation?.name ?? 'the Show Society';
          const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          });
          const venue = show.venue
            ? `${show.venue.name}${show.venue.address ? `, ${show.venue.address}` : ''}${show.venue.postcode ? `, ${show.venue.postcode}` : ''}`
            : 'Venue TBC';

          // Update contract
          await ctx.db.update(judgeContracts).set({
            stage: 'confirmed', confirmedAt: new Date(),
          }).where(eq(judgeContracts.id, contract.id));

          // Auto-complete checklist items
          await ctx.db.update(showChecklistItems).set({
            status: 'complete', completedAt: new Date(), autoDetected: true,
          }).where(
            and(
              eq(showChecklistItems.showId, contract.showId),
              eq(showChecklistItems.entityType, 'judge'),
              eq(showChecklistItems.entityId, contract.judgeId),
              eq(showChecklistItems.actionKey, 'judge_confirmation')
            )
          );

          await resend.emails.send({
            from: emailFrom,
            to: contract.judgeEmail,
            replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
            subject: `Appointment Confirmed — ${show.name}`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="text-align:center;padding:24px 0;"><h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#2D5F3F;">Remi</h1></div>
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#2D5F3F;padding:24px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">&#10003;</div>
      <h2 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Appointment Confirmed</h2>
    </div>
    <div style="padding:24px;">
      <p style="font-size:15px;color:#1a1a1a;line-height:1.6;">Dear ${contract.judgeName},</p>
      <p style="font-size:15px;color:#333;line-height:1.6;">Thank you for accepting our invitation. This confirms your appointment to judge at our show.</p>
      <table style="width:100%;margin:20px 0;border-collapse:collapse;">
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#444;width:120px;">Show</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">${show.name}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#444;">Date</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">${showDate}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#444;">Venue</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">${venue}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#444;">Breeds</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">${breedsText}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#444;">Ring(s)</td><td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;">${ringsText}</td></tr>
      </table>
      <p style="font-size:15px;color:#333;line-height:1.6;">Further details regarding entry numbers will be sent closer to the show date. We look forward to welcoming you.</p>
      <p style="font-size:15px;color:#333;line-height:1.6;margin-top:24px;">Yours sincerely,<br><strong>${orgName}</strong></p>
    </div>
  </div>
</div></body></html>`,
          });
          sent++;
        } catch (error) {
          console.error(`[bulk-confirm] Failed for ${contract.judgeName}:`, error);
          errors.push(contract.judgeName);
        }

        // Rate limit
        if ((i + 1) % 5 === 0 && i < acceptedContracts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      return { sent, errors, total: acceptedContracts.length };
    }),

  /** Email entry counts to a judge and auto-complete the checklist item */
  sendJudgeEntryNumbers: secretaryProcedure
    .input(z.object({
      showId: z.string().uuid(),
      judgeId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        with: { venue: true, organisation: true },
      });
      if (!show) throw new TRPCError({ code: 'NOT_FOUND' });

      const judge = await ctx.db.query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
      });
      if (!judge || !judge.contactEmail) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Judge has no contact email' });
      }

      // Get judge's breed assignments
      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: and(
          eq(judgeAssignments.showId, input.showId),
          eq(judgeAssignments.judgeId, input.judgeId)
        ),
        with: { breed: true, ring: true },
      });

      // Get entry counts per class for the judge's assigned breeds
      const breedIds = assignments.filter((a) => a.breedId).map((a) => a.breedId!);
      let classEntries: { className: string; breedName: string | null; entryCount: number }[] = [];

      if (breedIds.length > 0) {
        const classes = await ctx.db.query.showClasses.findMany({
          where: and(
            eq(showClasses.showId, input.showId),
            inArray(showClasses.breedId, breedIds)
          ),
          with: { breed: true, classDefinition: true },
        });

        // Single GROUP BY query for all class entry counts (instead of N+1)
        const classIds = classes.map((c) => c.id);
        const entryCounts = classIds.length > 0
          ? await ctx.db
              .select({
                showClassId: entryClasses.showClassId,
                count: sql<number>`count(*)`,
              })
              .from(entryClasses)
              .innerJoin(entries, eq(entryClasses.entryId, entries.id))
              .where(
                and(
                  inArray(entryClasses.showClassId, classIds),
                  eq(entries.status, 'confirmed')
                )
              )
              .groupBy(entryClasses.showClassId)
          : [];
        const countMap = new Map(entryCounts.map((r) => [r.showClassId, Number(r.count)]));

        for (const cls of classes) {
          classEntries.push({
            className: cls.classDefinition?.name ?? `Class ${cls.id.slice(0, 8)}`,
            breedName: cls.breed?.name ?? null,
            entryCount: countMap.get(cls.id) ?? 0,
          });
        }
      }

      const orgName = show.organisation?.name ?? 'the Show Society';
      const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });

      const breedsText = assignments.filter((a) => a.breed).map((a) => a.breed!.name).join(', ') || 'All breeds';
      const totalEntries = classEntries.reduce((sum, c) => sum + c.entryCount, 0);

      const classRows = classEntries.length > 0
        ? classEntries.map((c) =>
            `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font-size:14px;">${c.breedName ? `${c.breedName} — ` : ''}${c.className}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;font-weight:600;">${c.entryCount}</td></tr>`
          ).join('')
        : '<tr><td colspan="2" style="padding:12px;text-align:center;color:#999;">No class data available yet</td></tr>';

      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>';

      await resend.emails.send({
        from: emailFrom,
        to: judge.contactEmail,
        replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
        subject: `Entry Numbers — ${show.name}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="text-align:center;padding:24px 0;"><h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#2D5F3F;">Remi</h1></div>
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#2D5F3F;padding:24px;text-align:center;">
      <h2 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Entry Numbers</h2>
      <p style="margin:8px 0 0;color:#b8d4c4;font-size:14px;">${show.name} — ${showDate}</p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:15px;color:#1a1a1a;line-height:1.6;">Dear ${judge.name},</p>
      <p style="font-size:15px;color:#333;line-height:1.6;">Please find below the entry numbers for your judging appointment. You will be judging <strong>${breedsText}</strong> with a total of <strong>${totalEntries}</strong> entries.</p>
      <table style="width:100%;margin:20px 0;border-collapse:collapse;">
        <tr><th style="padding:10px 12px;border-bottom:2px solid #2D5F3F;text-align:left;font-size:14px;color:#444;">Class</th><th style="padding:10px 12px;border-bottom:2px solid #2D5F3F;text-align:center;font-size:14px;color:#444;">Entries</th></tr>
        ${classRows}
        <tr><td style="padding:10px 12px;font-weight:700;">Total</td><td style="padding:10px 12px;text-align:center;font-weight:700;">${totalEntries}</td></tr>
      </table>
      <p style="font-size:15px;color:#333;line-height:1.6;">We look forward to welcoming you on the day.</p>
      <p style="font-size:15px;color:#333;line-height:1.6;margin-top:24px;">Yours sincerely,<br><strong>${orgName}</strong></p>
    </div>
  </div>
</div></body></html>`,
      });

      // Auto-complete checklist item
      await ctx.db.update(showChecklistItems).set({
        status: 'complete', completedAt: new Date(), autoDetected: true,
      }).where(
        and(
          eq(showChecklistItems.showId, input.showId),
          eq(showChecklistItems.entityType, 'judge'),
          eq(showChecklistItems.entityId, input.judgeId),
          eq(showChecklistItems.actionKey, 'judge_entry_numbers')
        )
      );

      return { sent: true, totalEntries };
    }),

  /** Send a thank-you letter to a judge */
  sendJudgeThankYou: secretaryProcedure
    .input(z.object({
      showId: z.string().uuid(),
      judgeId: z.string().uuid(),
      message: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        with: { organisation: true },
      });
      if (!show) throw new TRPCError({ code: 'NOT_FOUND' });

      const judge = await ctx.db.query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
      });
      if (!judge || !judge.contactEmail) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Judge has no contact email' });
      }

      // Get contract for expense info
      const contract = await ctx.db.query.judgeContracts.findFirst({
        where: and(
          eq(judgeContracts.showId, input.showId),
          eq(judgeContracts.judgeId, input.judgeId)
        ),
        orderBy: desc(judgeContracts.createdAt),
      });

      const orgName = show.organisation?.name ?? 'the Show Society';
      const customMessage = input.message || 'Thank you for your time and expertise. Your contribution to the show was greatly appreciated by exhibitors and the committee alike.';

      const totalExpenses = (contract?.hotelCost ?? 0) + (contract?.travelCost ?? 0) + (contract?.otherExpenses ?? 0);
      const expenseSection = totalExpenses > 0 ? `
        <p style="font-size:14px;color:#555;line-height:1.6;padding:12px;background:#f9f8f6;border-radius:8px;margin-top:16px;">
          <strong>Expenses Summary:</strong><br>
          ${contract?.hotelCost ? `Hotel: £${penceToPoundsString(contract.hotelCost)}<br>` : ''}
          ${contract?.travelCost ? `Travel: £${penceToPoundsString(contract.travelCost)}<br>` : ''}
          ${contract?.otherExpenses ? `Other: £${penceToPoundsString(contract.otherExpenses)}<br>` : ''}
          <strong>Total: £${penceToPoundsString(totalExpenses)}</strong>
        </p>` : '';

      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailFrom = process.env.EMAIL_FROM ?? 'Remi <noreply@remishowmanager.co.uk>';

      await resend.emails.send({
        from: emailFrom,
        to: judge.contactEmail,
        replyTo: process.env.FEEDBACK_EMAIL ?? 'feedback@remishowmanager.co.uk',
        subject: `Thank You — ${show.name}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="text-align:center;padding:24px 0;"><h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#2D5F3F;">Remi</h1></div>
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#2D5F3F;padding:24px;text-align:center;">
      <h2 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Thank You</h2>
      <p style="margin:8px 0 0;color:#b8d4c4;font-size:14px;">${show.name}</p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:15px;color:#1a1a1a;line-height:1.6;">Dear ${judge.name},</p>
      <p style="font-size:15px;color:#333;line-height:1.6;">${customMessage}</p>
      ${expenseSection}
      <p style="font-size:15px;color:#333;line-height:1.6;margin-top:24px;">With kind regards,<br><strong>${orgName}</strong></p>
    </div>
  </div>
</div></body></html>`,
      });

      // Auto-complete checklist item
      await ctx.db.update(showChecklistItems).set({
        status: 'complete', completedAt: new Date(), autoDetected: true,
      }).where(
        and(
          eq(showChecklistItems.showId, input.showId),
          eq(showChecklistItems.entityType, 'judge'),
          eq(showChecklistItems.entityId, input.judgeId),
          eq(showChecklistItems.actionKey, 'judge_thankyou')
        )
      );

      return { sent: true };
    }),

  // ── Sundry Items CRUD ────────────────────────────────────

  getSundryItems: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      return ctx.db.query.sundryItems.findMany({
        where: eq(sundryItems.showId, input.showId),
        orderBy: [asc(sundryItems.sortOrder), asc(sundryItems.createdAt)],
      });
    }),

  createSundryItem: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        priceInPence: z.number().int().min(0),
        maxPerOrder: z.number().int().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Get next sort order
      const existing = await ctx.db.query.sundryItems.findMany({
        where: eq(sundryItems.showId, input.showId),
      });
      const nextSort = existing.length > 0
        ? Math.max(...existing.map((i) => i.sortOrder)) + 1
        : 0;

      const [item] = await ctx.db
        .insert(sundryItems)
        .values({
          showId: input.showId,
          name: input.name,
          description: input.description ?? null,
          priceInPence: input.priceInPence,
          maxPerOrder: input.maxPerOrder ?? null,
          sortOrder: nextSort,
        })
        .returning();

      return item!;
    }),

  updateSundryItem: secretaryProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        showId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
        priceInPence: z.number().int().min(0).optional(),
        maxPerOrder: z.number().int().min(1).nullable().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const { id, showId, ...updates } = input;
      const [updated] = await ctx.db
        .update(sundryItems)
        .set(updates)
        .where(and(eq(sundryItems.id, id), eq(sundryItems.showId, showId)))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sundry item not found' });
      }

      return updated;
    }),

  deleteSundryItem: secretaryProcedure
    .input(z.object({ id: z.string().uuid(), showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Check if any orders reference this item
      const references = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(orderSundryItems)
        .where(eq(orderSundryItems.sundryItemId, input.id));

      const refCount = Number(references[0]?.count ?? 0);

      if (refCount > 0) {
        // Soft delete: disable instead
        await ctx.db
          .update(sundryItems)
          .set({ enabled: false })
          .where(and(eq(sundryItems.id, input.id), eq(sundryItems.showId, input.showId)));
        return { softDeleted: true };
      }

      // Hard delete
      await ctx.db
        .delete(sundryItems)
        .where(and(eq(sundryItems.id, input.id), eq(sundryItems.showId, input.showId)));
      return { softDeleted: false };
    }),

  reorderSundryItems: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        itemIds: z.array(z.string().uuid()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      await Promise.all(
        input.itemIds.map((id, index) =>
          ctx.db
            .update(sundryItems)
            .set({ sortOrder: index })
            .where(and(eq(sundryItems.id, id), eq(sundryItems.showId, input.showId)))
        )
      );

      return { reordered: true };
    }),

  bulkCreateSundryItems: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        items: z.array(
          z.object({
            name: z.string().min(1),
            description: z.string().optional(),
            priceInPence: z.number().int().min(0),
            maxPerOrder: z.number().int().min(1).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Get next sort order
      const existing = await ctx.db.query.sundryItems.findMany({
        where: eq(sundryItems.showId, input.showId),
      });
      const startSort = existing.length > 0
        ? Math.max(...existing.map((i) => i.sortOrder)) + 1
        : 0;

      const values = input.items.map((item, idx) => ({
        showId: input.showId,
        name: item.name,
        description: item.description ?? null,
        priceInPence: item.priceInPence,
        maxPerOrder: item.maxPerOrder ?? null,
        sortOrder: startSort + idx,
      }));

      const created = await ctx.db
        .insert(sundryItems)
        .values(values)
        .returning();

      return { created: created.length };
    }),

  getSundryItemReport: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const report = await ctx.db
        .select({
          sundryItemId: orderSundryItems.sundryItemId,
          name: sundryItems.name,
          quantitySold: sql<number>`coalesce(sum(${orderSundryItems.quantity}), 0)`,
          totalRevenue: sql<number>`coalesce(sum(${orderSundryItems.quantity} * ${orderSundryItems.unitPrice}), 0)`,
        })
        .from(orderSundryItems)
        .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
        .innerJoin(orders, eq(orderSundryItems.orderId, orders.id))
        .where(
          and(
            eq(sundryItems.showId, input.showId),
            eq(orders.status, 'paid')
          )
        )
        .groupBy(orderSundryItems.sundryItemId, sundryItems.name);

      return report.map((r) => ({
        ...r,
        quantitySold: Number(r.quantitySold),
        totalRevenue: Number(r.totalRevenue),
      }));
    }),

  getShowEntryStats: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [metrics, exhibitorResult, latestEntry] = await Promise.all([
        computeShowMetrics(ctx.db, input.showId),
        // Unique exhibitors across alive, not-cancelled entries
        ctx.db
          .select({
            count: sql<number>`count(distinct ${entries.exhibitorId})`,
          })
          .from(entries)
          .where(
            and(
              eq(entries.showId, input.showId),
              isNull(entries.deletedAt),
              inArray(entries.status, ['pending', 'confirmed'])
            )
          ),
        ctx.db
          .select({ createdAt: entries.createdAt })
          .from(entries)
          .where(and(eq(entries.showId, input.showId), isNull(entries.deletedAt)))
          .orderBy(desc(entries.createdAt))
          .limit(1),
      ]);

      return {
        // Entry counts — live (not soft-deleted) entries, bucketed by order state
        totalEntries:
          metrics.confirmedEntryCount +
          metrics.pendingEntryCount +
          metrics.withdrawnEntryCount,
        confirmed: metrics.confirmedEntryCount,
        pending: metrics.pendingEntryCount,
        withdrawn: metrics.withdrawnEntryCount,
        // Legacy shape — we don't separately track transferred/cancelled here
        cancelled: 0,
        transferred: 0,
        // Revenue is club receivable (entries + sundries, net of refunds)
        totalRevenue: metrics.clubReceivablePence,
        paidOrders: metrics.paidOrderCount,
        uniqueExhibitors: Number(exhibitorResult[0]?.count ?? 0),
        lastEntryAt: latestEntry[0]?.createdAt ?? null,
      };
    }),

  // ── Schedule Data ──────────────────────────────────

  getScheduleData: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Fetch show data and verify access in one flow — verifyShowAccess
      // already fetches the show row, so we use it for auth then fetch
      // scheduleData in a single additional query (2 queries total, not 3)
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { id: true, organisationId: true, scheduleData: true },
      });
      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }
      const membership = await ctx.db.query.memberships.findFirst({
        where: and(
          eq(memberships.userId, ctx.session.user.id),
          eq(memberships.organisationId, show.organisationId),
          eq(memberships.status, 'active')
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this show' });
      }
      return show.scheduleData ?? null;
    }),

  /** Get schedule data from the most recent other show in the same org (for smart defaults) */
  getPreviousScheduleData: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const currentShow = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { id: true, organisationId: true },
      });
      if (!currentShow) return null;

      // Find the most recent OTHER show from the same org that has schedule data
      const previous = await ctx.db.query.shows.findFirst({
        where: and(
          eq(shows.organisationId, currentShow.organisationId),
          sql`${shows.id} != ${input.showId}`,
          sql`${shows.scheduleData} is not null`,
        ),
        columns: {
          scheduleData: true,
          showOpenTime: true,
          startTime: true,
          onCallVet: true,
        },
        orderBy: [desc(shows.createdAt)],
      });

      if (!previous?.scheduleData) return null;

      return {
        scheduleData: previous.scheduleData,
        showOpenTime: previous.showOpenTime,
        startTime: previous.startTime,
        onCallVet: previous.onCallVet,
      };
    }),

  updateScheduleData: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        // Show-level timing fields (saved directly to shows table, not JSONB)
        showOpenTime: z.string().optional(),
        judgingStartTime: z.string().optional(),
        onCallVet: z.string().optional(),
        scheduleData: z.object({
          country: z.enum(['england', 'wales', 'scotland', 'northern_ireland']).optional(),
          publicAdmission: z.boolean().optional(),
          wetWeatherAccommodation: z.boolean().optional(),
          isBenched: z.boolean().optional(),
          benchingRemovalTime: z.string().optional(),
          acceptsNfc: z.boolean().optional(),
          judgedOnGroupSystem: z.boolean().optional(),
          latestArrivalTime: z.string().optional(),
          showManager: z.string().optional(),
          guarantors: z.array(z.object({
            name: z.string(),
            address: z.string().optional(),
          })).optional(),
          officers: z.array(z.object({
            name: z.string(),
            position: z.string(),
          })).optional(),
          awardsDescription: z.string().optional(),
          prizeMoney: z.string().optional(),
          sponsorships: z.array(z.object({
            sponsorName: z.string(),
            description: z.string(),
          })).optional(),
          awardSponsors: z.array(z.object({
            award: z.string(),
            sponsorName: z.string(),
            sponsorAffix: z.string().optional(),
            trophyName: z.string().optional(),
          })).optional(),
          bestAwards: z.array(z.string()).optional(),
          customStatements: z.array(z.string()).optional(),
          what3words: z.string().optional(),
          directions: z.string().optional(),
          catering: z.string().optional(),
          futureShowDates: z.string().optional(),
          additionalNotes: z.string().optional(),
          welcomeNote: z.string().optional(),
          outsideAttraction: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Time ordering must be sane so the schedule doesn't print nonsense
      // like "Judging starts 08:30, Show opens 09:00". Strings are "HH:MM"
      // so lexical comparison works.
      const showOpen = input.showOpenTime?.trim() || null;
      const judgingStart = input.judgingStartTime?.trim() || null;
      const latestArrival = input.scheduleData.latestArrivalTime?.trim() || null;

      if (showOpen && judgingStart && judgingStart <= showOpen) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Judging start (${judgingStart}) must be after the show opens (${showOpen}).`,
        });
      }
      if (latestArrival && showOpen && latestArrival < showOpen) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Latest arrival (${latestArrival}) can't be before the show opens (${showOpen}).`,
        });
      }
      if (latestArrival && judgingStart && latestArrival > judgingStart) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Latest arrival (${latestArrival}) must be before judging starts (${judgingStart}).`,
        });
      }

      // Merge (rather than replace) scheduleData against the current
      // DB value. The mutation is called from several places (schedule
      // form autosave, sponsors page, catalogue-settings page), all
      // of which build their payload by spreading the client-side
      // React Query cache — a cache that can go stale. Merging
      // against the authoritative DB state makes partial payloads
      // safe: a stale client missing a field no longer drags that
      // field out when it saves. Clearing a field via this mutation
      // still works — send the field explicitly as empty string or
      // null — but omission means "leave alone", not "erase".
      const currentShow = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { scheduleData: true, organisationId: true },
      });
      const existingScheduleData = (currentShow?.scheduleData ?? {}) as Record<string, unknown>;
      const mergedScheduleData = { ...existingScheduleData, ...input.scheduleData };

      const showUpdates: Record<string, unknown> = { scheduleData: mergedScheduleData };
      if (input.showOpenTime !== undefined) showUpdates.showOpenTime = input.showOpenTime || null;
      if (input.judgingStartTime !== undefined) showUpdates.startTime = input.judgingStartTime || null;
      if (input.onCallVet !== undefined) showUpdates.onCallVet = input.onCallVet || null;

      await ctx.db
        .update(shows)
        .set(showUpdates)
        .where(eq(shows.id, input.showId));

      // Sync new officers into organisation_people so they're available for future shows
      const scheduleOfficers = input.scheduleData.officers;
      if (scheduleOfficers && scheduleOfficers.length > 0 && currentShow) {
        {
          const existingPeople = await ctx.db.query.organisationPeople.findMany({
            where: eq(organisationPeople.organisationId, currentShow.organisationId),
            columns: { name: true },
          });
          const existingNames = new Set(
            existingPeople.map((p) => p.name.toLowerCase().trim())
          );

          // Build guarantor lookup from schedule data
          const guarantorNames = new Set(
            (input.scheduleData.guarantors ?? []).map((g) => g.name.toLowerCase().trim())
          );
          const guarantorAddresses = new Map(
            (input.scheduleData.guarantors ?? []).map((g) => [g.name.toLowerCase().trim(), g.address])
          );

          const newPeople = scheduleOfficers
            .filter((o) => o.name.trim() && !existingNames.has(o.name.toLowerCase().trim()))
            .map((o) => ({
              organisationId: currentShow.organisationId,
              name: o.name.trim(),
              position: o.position || null,
              isGuarantor: guarantorNames.has(o.name.toLowerCase().trim()),
              address: guarantorAddresses.get(o.name.toLowerCase().trim()) ?? null,
            }));

          if (newPeople.length > 0) {
            await ctx.db.insert(organisationPeople).values(newPeople);
          }
        }
      }

      return { success: true };
    }),

  // ── Sponsor management ──────────────────────────────────

  listSponsors: secretaryProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.sponsors.findMany({
        where: and(
          eq(sponsors.organisationId, input.organisationId),
          isNull(sponsors.deletedAt)
        ),
        orderBy: [asc(sponsors.name)],
      });
    }),

  createSponsor: secretaryProcedure
    .input(
      z.object({
        organisationId: z.string().uuid(),
        name: z.string().min(1).max(255),
        contactName: z.string().max(255).optional(),
        contactEmail: z.string().email().optional(),
        website: z.string().url().optional(),
        logoStorageKey: z.string().optional(),
        logoUrl: z.string().url().optional(),
        category: z.enum([
          'pet_food', 'insurance', 'automotive', 'grooming', 'health_testing',
          'pet_products', 'local_business', 'breed_club', 'individual', 'other',
        ]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(sponsors)
        .values(input)
        .returning();
      return created!;
    }),

  updateSponsor: secretaryProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        contactName: z.string().max(255).nullable().optional(),
        contactEmail: z.string().email().nullable().optional(),
        website: z.string().url().nullable().optional(),
        logoStorageKey: z.string().nullable().optional(),
        logoUrl: z.string().url().nullable().optional(),
        category: z.enum([
          'pet_food', 'insurance', 'automotive', 'grooming', 'health_testing',
          'pet_products', 'local_business', 'breed_club', 'individual', 'other',
        ]).nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(sponsors)
        .set(data)
        .where(eq(sponsors.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sponsor not found' });
      return updated;
    }),

  deleteSponsor: secretaryProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .update(sponsors)
        .set({ deletedAt: new Date() })
        .where(eq(sponsors.id, input.id))
        .returning();
      if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sponsor not found' });
      return deleted;
    }),

  listShowSponsors: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });
      return ctx.db.query.showSponsors.findMany({
        where: eq(showSponsors.showId, input.showId),
        with: {
          sponsor: true,
          classSponsorships: {
            with: { showClass: { with: { classDefinition: true, breed: true } } },
          },
        },
        orderBy: [asc(showSponsors.displayOrder)],
      });
    }),

  assignShowSponsor: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        sponsorId: z.string().uuid(),
        tier: z.enum(['title', 'show', 'class', 'prize', 'advertiser']),
        displayOrder: z.number().int().min(0).default(0),
        customTitle: z.string().max(255).optional(),
        adImageStorageKey: z.string().optional(),
        adImageUrl: z.string().url().optional(),
        adSize: z.enum(['full_page', 'half_page', 'quarter_page']).optional(),
        specialPrizes: z.string().optional(),
        prizeMoney: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });
      const [created] = await ctx.db
        .insert(showSponsors)
        .values(input)
        .returning();
      return created!;
    }),

  updateShowSponsor: secretaryProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        tier: z.enum(['title', 'show', 'class', 'prize', 'advertiser']).optional(),
        displayOrder: z.number().int().min(0).optional(),
        customTitle: z.string().max(255).nullable().optional(),
        adImageStorageKey: z.string().nullable().optional(),
        adImageUrl: z.string().url().nullable().optional(),
        adSize: z.enum(['full_page', 'half_page', 'quarter_page']).nullable().optional(),
        specialPrizes: z.string().nullable().optional(),
        prizeMoney: z.number().int().min(0).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(showSponsors)
        .set(data)
        .where(eq(showSponsors.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show sponsor not found' });
      return updated;
    }),

  removeShowSponsor: secretaryProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [removed] = await ctx.db
        .delete(showSponsors)
        .where(eq(showSponsors.id, input.id))
        .returning();
      if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show sponsor not found' });
      return removed;
    }),

  assignClassSponsorship: secretaryProcedure
    .input(
      z.object({
        showClassId: z.string().uuid(),
        showSponsorId: z.string().uuid(),
        trophyName: z.string().max(255).optional(),
        trophyDonor: z.string().max(255).optional(),
        prizeMoney: z.number().int().min(0).optional(),
        prizeDescription: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(classSponsorships)
        .values(input)
        .returning();
      return created!;
    }),

  removeClassSponsorship: secretaryProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [removed] = await ctx.db
        .delete(classSponsorships)
        .where(eq(classSponsorships.id, input.id))
        .returning();
      if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Class sponsorship not found' });
      return removed;
    }),

  // Free-text class sponsorship — type name + affix directly (no directory link)
  upsertClassSponsor: secretaryProcedure
    .input(z.object({
      showClassId: z.string().uuid(),
      sponsorName: z.string().max(255),
      sponsorAffix: z.string().max(255).optional(),
      trophyName: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(classSponsorships)
        .values({
          showClassId: input.showClassId,
          sponsorName: input.sponsorName.trim(),
          sponsorAffix: input.sponsorAffix?.trim() || null,
          trophyName: input.trophyName?.trim() || null,
        })
        .returning();
      return created!;
    }),

  // Update an existing class sponsorship in place
  updateClassSponsor: secretaryProcedure
    .input(z.object({
      id: z.string().uuid(),
      sponsorName: z.string().max(255).optional(),
      sponsorAffix: z.string().max(255).nullable().optional(),
      trophyName: z.string().max(255).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updateData: Record<string, unknown> = {};
      if (data.sponsorName !== undefined) updateData.sponsorName = data.sponsorName.trim();
      if (data.sponsorAffix !== undefined) updateData.sponsorAffix = data.sponsorAffix?.trim() || null;
      if (data.trophyName !== undefined) updateData.trophyName = data.trophyName?.trim() || null;
      if (Object.keys(updateData).length === 0) return null;
      const [updated] = await ctx.db
        .update(classSponsorships)
        .set(updateData)
        .where(eq(classSponsorships.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Class sponsorship not found' });
      return updated;
    }),

  // Get all classes for a show with their sponsorships (for the spreadsheet view)
  getClassesWithSponsorships: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });
      return ctx.db.query.showClasses.findMany({
        where: eq(showClasses.showId, input.showId),
        with: {
          classDefinition: true,
          breed: true,
          // Insertion order keeps Trophy above Rosettes on the page.
          // Secretaries add Trophy first; without an explicit order
          // the rows shuffle between edits.
          classSponsorships: { orderBy: [asc(classSponsorships.createdAt)] },
        },
        orderBy: [asc(showClasses.sortOrder)],
      });
    }),

  // Autocomplete: get previously used sponsor names across the org's shows
  getSponsorNameSuggestions: secretaryProcedure
    .input(z.object({ organisationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyOrgAccess(ctx.db, ctx.session.user.id, input.organisationId);
      // Names are drawn from two sources: class-level sponsorships
      // (class_sponsorships.sponsor_name) and show-level awards
      // (shows.schedule_data->'awardSponsors'[*]). UNION + GROUP BY
      // collapses duplicates that appear in both.
      const rows = await ctx.db.execute(sql`
        SELECT sponsor_name, MAX(sponsor_affix) AS sponsor_affix
        FROM (
          SELECT cs.sponsor_name, cs.sponsor_affix
          FROM class_sponsorships cs
          JOIN show_classes sc ON cs.show_class_id = sc.id
          JOIN shows s ON sc.show_id = s.id
          WHERE s.organisation_id = ${input.organisationId}
            AND cs.sponsor_name IS NOT NULL
            AND cs.sponsor_name != ''
          UNION ALL
          SELECT
            entry->>'sponsorName' AS sponsor_name,
            entry->>'sponsorAffix' AS sponsor_affix
          FROM shows s,
               jsonb_array_elements(COALESCE(s.schedule_data->'awardSponsors', '[]'::jsonb)) AS entry
          WHERE s.organisation_id = ${input.organisationId}
            AND entry->>'sponsorName' IS NOT NULL
            AND entry->>'sponsorName' != ''
        ) combined
        GROUP BY sponsor_name
        ORDER BY sponsor_name
      `);
      return rows as { sponsor_name: string; sponsor_affix: string | null }[];
    }),

  // ── Results Publication Pipeline ───────────────────────

  publishResults: secretaryProcedure
    .input(z.object({
      showId: z.string().uuid(),
      sendNotifications: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { status: true, resultsPublishedAt: true },
      });

      if (!show) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });

      if (!['in_progress', 'completed'].includes(show.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Results can only be published for shows that are in progress or completed.',
        });
      }

      if (show.resultsPublishedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Results are already published.',
        });
      }

      const now = new Date();
      await ctx.db
        .update(shows)
        .set({ resultsPublishedAt: now, resultsLockedAt: now })
        .where(eq(shows.id, input.showId));

      // Also publish all individual results
      try {
        await ctx.db.execute(sql`
          UPDATE results r
          SET published_at = ${now.toISOString()}::timestamptz
          FROM entry_classes ec
          JOIN entries e ON ec.entry_id = e.id
          WHERE r.entry_class_id = ec.id
            AND e.show_id = ${input.showId}
            AND r.published_at IS NULL
        `);
      } catch (error) {
        console.error('[publishResults] SQL error:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to publish results. Please try again.' });
      }

      // Fire downstream notifications async (Phase 4)
      if (input.sendNotifications) {
        const { sendExhibitorResultsEmails, sendFollowerResultsNotifications, createResultsMilestonePosts } = await import('@/server/services/results-notifications');
        // Fire and forget — don't block the mutation
        void Promise.all([
          sendExhibitorResultsEmails(input.showId).catch((e) => console.error('[results-publish] exhibitor emails failed:', e)),
          sendFollowerResultsNotifications(input.showId).catch((e) => console.error('[results-publish] follower notifications failed:', e)),
          createResultsMilestonePosts(input.showId).catch((e) => console.error('[results-publish] milestone posts failed:', e)),
        ]);
      }

      return { published: true, publishedAt: now };
    }),

  unpublishResults: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { resultsPublishedAt: true },
      });

      if (!show?.resultsPublishedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Results are not currently published.',
        });
      }

      await ctx.db
        .update(shows)
        .set({ resultsPublishedAt: null, resultsLockedAt: null })
        .where(eq(shows.id, input.showId));

      // Also unpublish all individual results
      await ctx.db.execute(sql`
        UPDATE results r
        SET published_at = NULL
        FROM entry_classes ec
        JOIN entries e ON ec.entry_id = e.id
        WHERE r.entry_class_id = ec.id
          AND e.show_id = ${input.showId}
      `);

      return { unpublished: true };
    }),

  // Per-class publish: make a single class's results visible to the public
  publishClassResults: secretaryProcedure
    .input(z.object({
      showId: z.string().uuid(),
      showClassId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      const now = new Date();
      try {
        await ctx.db.execute(sql`
          UPDATE results r
          SET published_at = ${now.toISOString()}::timestamptz
          FROM entry_classes ec
          JOIN entries e ON ec.entry_id = e.id
          WHERE r.entry_class_id = ec.id
            AND e.show_id = ${input.showId}
            AND ec.show_class_id = ${input.showClassId}
            AND r.published_at IS NULL
        `);
      } catch (error) {
        console.error('[publishClassResults] SQL error:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to publish class results. Please try again.' });
      }

      return { published: true, classId: input.showClassId };
    }),

  // Per-class unpublish: hide a single class's results from the public
  unpublishClassResults: secretaryProcedure
    .input(z.object({
      showId: z.string().uuid(),
      showClassId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      try {
        await ctx.db.execute(sql`
          UPDATE results r
          SET published_at = NULL
          FROM entry_classes ec
          JOIN entries e ON ec.entry_id = e.id
          WHERE r.entry_class_id = ec.id
            AND e.show_id = ${input.showId}
            AND ec.show_class_id = ${input.showClassId}
        `);
      } catch (error) {
        console.error('[unpublishClassResults] SQL error:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to unpublish results. Please try again.' });
      }

      return { unpublished: true, classId: input.showClassId };
    }),

  getResultsPublicationStatus: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { resultsPublishedAt: true, resultsLockedAt: true, status: true },
      });

      if (!show) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });

      // Get judge approval summary
      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: eq(judgeAssignments.showId, input.showId),
        with: { judge: true, breed: true },
      });

      // Deduplicate by judge
      const judgeStatusMap = new Map<string, {
        judgeId: string;
        judgeName: string;
        contactEmail: string | null;
        breeds: string[];
        status: string | null;
        sentAt: Date | null;
        approvedAt: Date | null;
        note: string | null;
      }>();

      for (const a of assignments) {
        if (!judgeStatusMap.has(a.judgeId)) {
          judgeStatusMap.set(a.judgeId, {
            judgeId: a.judgeId,
            judgeName: a.judge.name,
            contactEmail: a.judge.contactEmail,
            breeds: [],
            status: a.approvalStatus,
            sentAt: a.approvalSentAt,
            approvedAt: a.approvedAt,
            note: a.approvalNote,
          });
        }
        if (a.breed) {
          judgeStatusMap.get(a.judgeId)!.breeds.push(a.breed.name);
        }
      }

      const judgeStatuses = Array.from(judgeStatusMap.values());
      const total = judgeStatuses.length;
      const approved = judgeStatuses.filter((j) => j.status === 'approved').length;
      const pending = judgeStatuses.filter((j) => j.status === 'pending').length;
      const declined = judgeStatuses.filter((j) => j.status === 'declined').length;
      const notSent = judgeStatuses.filter((j) => !j.status).length;

      return {
        published: !!show.resultsPublishedAt,
        publishedAt: show.resultsPublishedAt,
        locked: !!show.resultsLockedAt,
        showStatus: show.status,
        approvals: { total, approved, pending, declined, notSent },
        judges: judgeStatuses,
      };
    }),

  resendJudgeApprovalRequest: secretaryProcedure
    .input(z.object({ showId: z.string().uuid(), judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      const judge = await ctx.db.query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
      });

      if (!judge?.contactEmail) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This judge does not have an email address on file.',
        });
      }

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        with: { organisation: true },
      });

      if (!show) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });

      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: and(
          eq(judgeAssignments.showId, input.showId),
          eq(judgeAssignments.judgeId, input.judgeId)
        ),
      });

      if (assignments.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No assignments found for this judge.',
        });
      }

      const crypto = await import('crypto');
      const sharedToken = crypto.randomUUID();

      // Send the email FIRST — if it fails, DB state doesn't change and the
      // previous approval token (if any) remains valid for the judge to use.
      const { sendJudgeApprovalRequestEmail } = await import('@/server/services/email');
      try {
        await sendJudgeApprovalRequestEmail({
          judge: { name: judge.name, email: judge.contactEmail },
          show: {
            name: show.name,
            startDate: show.startDate,
            slug: show.slug,
            id: show.id,
            organisation: show.organisation,
          },
          approvalToken: sharedToken,
          breeds: assignments.filter((a) => a.breedId).map((a) => a.breedId!),
        });
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Could not send approval email to ${judge.contactEmail}. Please check the address and try again.`,
          cause: error,
        });
      }

      await ctx.db
        .update(judgeAssignments)
        .set({
          approvalToken: sharedToken,
          approvalStatus: 'pending',
          approvalSentAt: new Date(),
          approvedAt: null,
          approvalNote: null,
        })
        .where(
          and(
            eq(judgeAssignments.showId, input.showId),
            eq(judgeAssignments.judgeId, input.judgeId)
          )
        );

      return { sent: true };
    }),

  // ── RKC Submission Tracking ──────────────────────────────────

  markRkcSubmitted: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { scheduleData: true, status: true },
      });

      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      if (show.status !== 'completed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only mark RKC submission for completed shows',
        });
      }

      const updatedData = {
        ...(show.scheduleData ?? {}),
        rkcSubmittedAt: new Date().toISOString(),
      };

      await ctx.db
        .update(shows)
        .set({ scheduleData: updatedData })
        .where(eq(shows.id, input.showId));

      return { submitted: true, submittedAt: updatedData.rkcSubmittedAt };
    }),

  unmarkRkcSubmitted: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { scheduleData: true },
      });

      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      const updatedData = { ...(show.scheduleData ?? {}) };
      delete updatedData.rkcSubmittedAt;

      await ctx.db
        .update(shows)
        .set({ scheduleData: updatedData })
        .where(eq(shows.id, input.showId));

      return { unsubmitted: true };
    }),

  // ── Best Awards (Secretary-scoped achievement management) ─────

  /** Get confirmed dogs for a show (for award selection dropdowns) */
  getConfirmedDogs: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      const showEntries = await ctx.db.query.entries.findMany({
        where: and(
          eq(entries.showId, input.showId),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        ),
        with: {
          dog: {
            columns: { id: true, registeredName: true, sex: true },
            with: { breed: true },
          },
          juniorHandlerDetails: true,
        },
        columns: { id: true, catalogueNumber: true, dogId: true, entryType: true },
      });

      // Deduplicate by dogId (or entryId for JH entries which may not have a dog)
      const dogMap = new Map<string, {
        dogId: string;
        registeredName: string;
        sex: string | null;
        breedName: string | null;
        catalogueNumber: string | null;
      }>();

      for (const entry of showEntries) {
        if (entry.entryType === 'junior_handler') {
          // JH entries: use entry ID as key, handler name as "registeredName"
          const handlerName = entry.juniorHandlerDetails?.handlerName ?? 'Unknown Handler';
          dogMap.set(entry.id, {
            dogId: entry.id, // use entry ID since there may be no dog
            registeredName: handlerName,
            sex: null,
            breedName: null,
            catalogueNumber: entry.catalogueNumber,
          });
        } else if (entry.dog && !dogMap.has(entry.dog.id)) {
          dogMap.set(entry.dog.id, {
            dogId: entry.dog.id,
            registeredName: entry.dog.registeredName,
            sex: entry.dog.sex,
            breedName: entry.dog.breed?.name ?? null,
            catalogueNumber: entry.catalogueNumber,
          });
        }
      }

      return Array.from(dogMap.values()).sort((a, b) =>
        a.registeredName.localeCompare(b.registeredName)
      );
    }),

  /** Get achievements for a show (secretary-scoped, no steward assignment needed) */
  getShowAchievements: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      return ctx.db.query.achievements.findMany({
        where: eq(achievements.showId, input.showId),
        with: {
          dog: {
            columns: { id: true, registeredName: true, sex: true },
            with: { breed: true },
          },
        },
      });
    }),

  /** Record a best award / achievement (secretary-scoped) */
  recordAchievement: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        dogId: z.string().uuid(),
        type: z.enum(ACHIEVEMENT_TYPES),
        date: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      // Verify the dog is entered in this show
      const dogEntry = await ctx.db.query.entries.findFirst({
        where: and(
          eq(entries.showId, input.showId),
          eq(entries.dogId, input.dogId),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        ),
        columns: { id: true },
      });
      if (!dogEntry) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This dog is not entered in this show',
        });
      }

      // Validate sex matches award type
      const DOG_ONLY_AWARDS = ['dog_cc', 'reserve_dog_cc', 'best_puppy_dog', 'best_long_coat_dog'];
      const BITCH_ONLY_AWARDS = ['bitch_cc', 'reserve_bitch_cc', 'best_puppy_bitch', 'best_long_coat_bitch'];

      if (DOG_ONLY_AWARDS.includes(input.type) || BITCH_ONLY_AWARDS.includes(input.type)) {
        const dog = await ctx.db.query.dogs.findFirst({
          where: eq(dogs.id, input.dogId),
          columns: { sex: true },
        });
        const requiredSex = DOG_ONLY_AWARDS.includes(input.type) ? 'dog' : 'bitch';
        if (dog?.sex !== requiredSex) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `This award is for ${requiredSex === 'dog' ? 'dogs' : 'bitches'} only`,
          });
        }
      }

      // Remove any existing same-type award for this show (not dog-specific — e.g. only one BIS)
      // For show-level awards: only one dog can hold it
      const UNIQUE_SHOW_AWARDS = [
        'best_in_show', 'reserve_best_in_show', 'best_puppy_in_show', 'best_long_coat_in_show',
        'best_of_breed', 'best_puppy_in_breed', 'best_veteran_in_breed',
        'dog_cc', 'reserve_dog_cc', 'bitch_cc', 'reserve_bitch_cc',
        'best_puppy_dog', 'best_puppy_bitch', 'best_long_coat_dog', 'best_long_coat_bitch',
        'cc', 'reserve_cc',
      ];

      if (UNIQUE_SHOW_AWARDS.includes(input.type)) {
        await ctx.db
          .delete(achievements)
          .where(
            and(
              eq(achievements.showId, input.showId),
              eq(achievements.type, input.type)
            )
          );
      }

      const [achievement] = await ctx.db
        .insert(achievements)
        .values({
          showId: input.showId,
          dogId: input.dogId,
          type: input.type,
          date: input.date,
        })
        .returning();

      return achievement!;
    }),

  /** Remove a best award / achievement (secretary-scoped) */
  removeAchievement: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        achievementId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId, { callerIsAdmin: ctx.callerIsAdmin });

      await ctx.db
        .delete(achievements)
        .where(
          and(
            eq(achievements.id, input.achievementId),
            eq(achievements.showId, input.showId)
          )
        );

      return { removed: true };
    }),
});
