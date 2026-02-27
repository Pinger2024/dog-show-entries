import { z } from 'zod';
import { and, eq, sql, isNull, inArray, asc, desc } from 'drizzle-orm';
import { secretaryProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
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
} from '@/server/db/schema';

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
        shows: [],
        totalShows: 0,
        totalEntries: 0,
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

    // Get total entries across all shows
    const showIds = orgShows.map((s) => s.id);
    let totalEntries = 0;
    let totalRevenue = 0;

    if (showIds.length > 0) {
      const entryCounts = await ctx.db
        .select({
          count: sql<number>`count(*)`,
          revenue: sql<number>`coalesce(sum(${entries.totalFee}), 0)`,
        })
        .from(entries)
        .where(
          and(inArray(entries.showId, showIds), isNull(entries.deletedAt))
        );

      totalEntries = Number(entryCounts[0]?.count ?? 0);
      totalRevenue = Number(entryCounts[0]?.revenue ?? 0);
    }

    return {
      organisations: userMemberships.map((m) => m.organisation),
      shows: orgShows,
      totalShows: orgShows.length,
      totalEntries,
      totalRevenue,
    };
  }),

  getShowStats: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const entryCounts = await ctx.db
        .select({
          count: sql<number>`count(*)`,
          revenue: sql<number>`coalesce(sum(${entries.totalFee}), 0)`,
          confirmed: sql<number>`count(*) filter (where ${entries.status} = 'confirmed')`,
          pending: sql<number>`count(*) filter (where ${entries.status} = 'pending')`,
        })
        .from(entries)
        .where(
          and(
            eq(entries.showId, input.showId),
            isNull(entries.deletedAt)
          )
        );

      return {
        totalEntries: Number(entryCounts[0]?.count ?? 0),
        totalRevenue: Number(entryCounts[0]?.revenue ?? 0),
        confirmedEntries: Number(entryCounts[0]?.confirmed ?? 0),
        pendingEntries: Number(entryCounts[0]?.pending ?? 0),
      };
    }),

  listVenues: secretaryProcedure.query(async ({ ctx }) => {
    return ctx.db.query.venues.findMany({
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [venue] = await ctx.db
        .insert(venues)
        .values(input)
        .returning();
      return venue!;
    }),

  listClassDefinitions: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.classDefinitions.findMany({
      orderBy: (cd, { asc }) => [asc(cd.name)],
    });
  }),

  updateScheduleUrl: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        scheduleUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(shows)
        .set({ scheduleUrl: input.scheduleUrl })
        .where(eq(shows.id, input.showId))
        .returning();
      return updated!;
    }),

  updateOrganisationLogo: secretaryProcedure
    .input(
      z.object({
        organisationId: z.string().uuid(),
        logoUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(organisations)
        .set({ logoUrl: input.logoUrl })
        .where(eq(organisations.id, input.organisationId))
        .returning();
      return updated!;
    }),

  // ── Catalogue number assignment ────────────────────────────

  assignCatalogueNumbers: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Fetch all confirmed entries with breed info, ordered for catalogue
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
        },
        orderBy: [asc(entries.entryDate)],
      });

      // Sort: group → breed → sex (dogs first) → entry date
      const sorted = [...confirmedEntries].sort((a, b) => {
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

      // Assign sequential numbers
      let catNum = 1;
      for (const entry of sorted) {
        await ctx.db
          .update(entries)
          .set({ catalogueNumber: String(catNum) })
          .where(eq(entries.id, entry.id));
        catNum++;
      }

      return { assigned: sorted.length };
    }),

  // ── Catalogue data ─────────────────────────────────────────

  getCatalogueData: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
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
      return ctx.db.query.entries.findMany({
        where: and(
          eq(entries.showId, input.showId),
          eq(entries.status, 'withdrawn'),
          isNull(entries.deletedAt)
        ),
        with: {
          dog: { with: { breed: true } },
          exhibitor: true,
        },
        orderBy: [asc(entries.catalogueNumber)],
      });
    }),

  // ── Reports ────────────────────────────────────────────────

  getEntryReport: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.entries.findMany({
        where: and(
          eq(entries.showId, input.showId),
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
      const showEntries = await ctx.db.query.entries.findMany({
        where: and(
          eq(entries.showId, input.showId),
          isNull(entries.deletedAt)
        ),
        with: {
          payments: true,
          exhibitor: true,
          dog: true,
        },
      });

      const totalRevenue = showEntries.reduce((sum, e) => sum + e.totalFee, 0);
      const paidEntries = showEntries.filter((e) => e.status === 'confirmed');
      const pendingEntries = showEntries.filter((e) => e.status === 'pending');

      return {
        entries: showEntries,
        summary: {
          totalRevenue,
          paidCount: paidEntries.length,
          pendingCount: pendingEntries.length,
          totalEntries: showEntries.length,
        },
      };
    }),

  getCatalogueOrders: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.entries.findMany({
        where: and(
          eq(entries.showId, input.showId),
          eq(entries.catalogueRequested, true),
          isNull(entries.deletedAt)
        ),
        with: {
          exhibitor: true,
          dog: true,
        },
      });
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

  // ── Bulk class creation from templates ────────────────────

  bulkCreateClasses: secretaryProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        breedIds: z.array(z.string().uuid()),
        classDefinitionIds: z.array(z.string().uuid()),
        entryFee: z.number().int().positive(),
        splitBySex: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let sortOrder = 0;
      let count = 0;

      for (const breedId of input.breedIds) {
        for (const classDefId of input.classDefinitionIds) {
          if (input.splitBySex) {
            for (const sex of ['dog', 'bitch'] as const) {
              await ctx.db.insert(showClasses).values({
                showId: input.showId,
                breedId,
                classDefinitionId: classDefId,
                sex,
                entryFee: input.entryFee,
                sortOrder: sortOrder++,
                isBreedSpecific: true,
              });
              count++;
            }
          } else {
            await ctx.db.insert(showClasses).values({
              showId: input.showId,
              breedId,
              classDefinitionId: classDefId,
              entryFee: input.entryFee,
              sortOrder: sortOrder++,
              isBreedSpecific: true,
            });
            count++;
          }
        }
      }

      return { created: count };
    }),
});
