import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, sql, isNull, inArray, asc, desc, ilike } from 'drizzle-orm';
import { secretaryProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { verifyShowAccess } from '../verify-show-access';
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
  users,
  judges,
  judgeAssignments,
  rings,
  breeds,
} from '@/server/db/schema';
import { getStripe } from '@/server/services/stripe';

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

    // Get entries/revenue for active shows only
    const activeShowIds = activeShows.map((s) => s.id);
    const allShowIds = orgShows.map((s) => s.id);
    let totalEntries = 0;
    let activeRevenue = 0;
    let totalRevenue = 0;

    if (allShowIds.length > 0) {
      const allStats = await ctx.db
        .select({
          count: sql<number>`count(*)`,
          revenue: sql<number>`coalesce(sum(${entries.totalFee}), 0)`,
        })
        .from(entries)
        .where(
          and(inArray(entries.showId, allShowIds), isNull(entries.deletedAt))
        );

      totalEntries = Number(allStats[0]?.count ?? 0);
      totalRevenue = Number(allStats[0]?.revenue ?? 0);
    }

    if (activeShowIds.length > 0) {
      const activeStats = await ctx.db
        .select({
          revenue: sql<number>`coalesce(sum(${entries.totalFee}), 0)`,
        })
        .from(entries)
        .where(
          and(
            inArray(entries.showId, activeShowIds),
            isNull(entries.deletedAt)
          )
        );

      activeRevenue = Number(activeStats[0]?.revenue ?? 0);
    }

    return {
      organisations: userMemberships.map((m) => m.organisation),
      activeShows,
      pastShows,
      totalShows: orgShows.length,
      activeShowsCount: activeShows.length,
      totalEntries,
      activeRevenue,
      totalRevenue,
    };
  }),

  getShowStats: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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

      // Assign sequential numbers in a single query using CASE
      if (sorted.length > 0) {
        const ids = sorted.map((e) => e.id);
        const cases = sorted
          .map((e, i) => `WHEN '${e.id}' THEN '${i + 1}'`)
          .join(' ');

        await ctx.db.execute(
          sql`UPDATE entries SET catalogue_number = CASE id ${sql.raw(cases)} END, updated_at = NOW() WHERE id = ANY(${ids})`
        );
      }

      return { assigned: sorted.length };
    }),

  // ── Catalogue data ─────────────────────────────────────────

  getCatalogueData: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
        entryFee: z.number().int().positive(),
        splitBySex: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      let sortOrder = 0;
      const values: Array<{
        showId: string;
        breedId: string;
        classDefinitionId: string;
        sex: 'dog' | 'bitch' | null;
        entryFee: number;
        sortOrder: number;
        isBreedSpecific: boolean;
      }> = [];

      for (const breedId of input.breedIds) {
        for (const classDefId of input.classDefinitionIds) {
          if (input.splitBySex) {
            for (const sex of ['dog', 'bitch'] as const) {
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

      if (values.length > 0) {
        await ctx.db.insert(showClasses).values(values);
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Record<string, unknown> = {};
      if (input.entryFee !== undefined) updates.entryFee = input.entryFee;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

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
      const [deleted] = await ctx.db
        .delete(showClasses)
        .where(eq(showClasses.id, input.showClassId))
        .returning({ id: showClasses.id });

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Class not found' });
      }

      return deleted;
    }),

  // ── Steward management ───────────────────────────────

  getShowStewards: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      return ctx.db.query.stewardAssignments.findMany({
        where: eq(stewardAssignments.showId, input.showId),
        with: {
          user: {
            columns: { id: true, name: true, email: true, image: true },
          },
          ring: true,
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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      const [deleted] = await ctx.db
        .delete(stewardAssignments)
        .where(eq(stewardAssignments.id, input.assignmentId))
        .returning({ id: stewardAssignments.id });

      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Steward assignment not found',
        });
      }

      return { removed: true };
    }),

  deleteShow: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      const [deleted] = await ctx.db
        .delete(rings)
        .where(eq(rings.id, input.ringId))
        .returning({ id: rings.id });

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ring not found' });
      }
      return { removed: true };
    }),

  // ─── Judge Management ─────────────────────────────────
  getJudges: secretaryProcedure
    .query(async ({ ctx }) => {
      return ctx.db.query.judges.findMany({
        orderBy: asc(judges.name),
      });
    }),

  addJudge: secretaryProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        kcNumber: z.string().optional(),
        contactEmail: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [judge] = await ctx.db
        .insert(judges)
        .values({
          name: input.name,
          kcNumber: input.kcNumber ?? null,
          contactEmail: input.contactEmail ?? null,
        })
        .returning();

      return judge!;
    }),

  getShowJudges: secretaryProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

      const [assignment] = await ctx.db
        .insert(judgeAssignments)
        .values({
          showId: input.showId,
          judgeId: input.judgeId,
          breedId: input.breedId ?? null,
          ringId: input.ringId ?? null,
        })
        .returning();

      return assignment!;
    }),

  removeJudgeAssignment: secretaryProcedure
    .input(z.object({ assignmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(judgeAssignments)
        .where(eq(judgeAssignments.id, input.assignmentId))
        .returning({ id: judgeAssignments.id });

      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Judge assignment not found',
        });
      }
      return { removed: true };
    }),

  // ─── Refund Management ────────────────────────────────
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

      await verifyShowAccess(ctx.db, ctx.session.user.id, entry.showId);

      // Find the original succeeded payment with a Stripe payment ID
      const originalPayment = await ctx.db.query.payments.findFirst({
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

      // Issue refund via Stripe
      const stripe = getStripe();
      await stripe.refunds.create({
        payment_intent: originalPayment.stripePaymentId,
        amount: refundAmount,
        ...(input.reason ? { reason: 'requested_by_customer' as const } : {}),
      });

      // Record the refund payment
      await ctx.db.insert(payments).values({
        entryId: input.entryId,
        orderId: originalPayment.orderId,
        stripePaymentId: originalPayment.stripePaymentId,
        amount: refundAmount,
        status: 'refunded',
        type: 'refund',
      });

      // Update original payment's refund tracking
      const newRefundTotal = alreadyRefunded + refundAmount;
      const isFullyRefunded = newRefundTotal >= originalPayment.amount;
      await ctx.db
        .update(payments)
        .set({
          refundAmount: newRefundTotal,
          status: isFullyRefunded ? 'refunded' : 'partially_refunded',
        })
        .where(eq(payments.id, originalPayment.id));

      // If fully refunded, cancel the entry
      if (isFullyRefunded) {
        await ctx.db
          .update(entries)
          .set({ status: 'cancelled' })
          .where(eq(entries.id, input.entryId));
      }

      return {
        refunded: true,
        amount: refundAmount,
        fullyRefunded: isFullyRefunded,
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyShowAccess(ctx.db, ctx.session.user.id, input.showId);

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

      // Calculate total fee
      const totalFee = selectedClasses.reduce(
        (sum, sc) => sum + sc.entryFee,
        0
      );

      // Create entry — auto-confirmed for secretary entries
      const [entry] = await ctx.db
        .insert(entries)
        .values({
          showId: input.showId,
          dogId: input.dogId,
          exhibitorId,
          isNfc: input.isNfc,
          totalFee,
          status: 'confirmed',
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

      // Create a payment record (manual — no Stripe)
      await ctx.db.insert(payments).values({
        entryId: entry!.id,
        amount: totalFee,
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
        },
        reason: `Entry created by secretary (${input.paymentMethod} payment)`,
      });

      return entry!;
    }),
});
