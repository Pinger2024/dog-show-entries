import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, sql, isNull, inArray, asc } from 'drizzle-orm';
import { stewardProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import type { Database } from '@/server/db';
import {
  shows,
  entries,
  entryClasses,
  showClasses,
  results,
  stewardAssignments,
  classDefinitions,
  achievements,
} from '@/server/db/schema';

async function verifyStewardAssignment(
  db: Database,
  userId: string,
  showId: string
) {
  const assignment = await db.query.stewardAssignments.findFirst({
    where: and(
      eq(stewardAssignments.userId, userId),
      eq(stewardAssignments.showId, showId)
    ),
  });
  if (!assignment) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You are not assigned as a steward for this show',
    });
  }
  return assignment;
}

export const stewardRouter = createTRPCRouter({
  // ── Steward's assigned shows ──────────────────────────────
  getMyShows: stewardProcedure.query(async ({ ctx }) => {
    const assignments = await ctx.db.query.stewardAssignments.findMany({
      where: eq(stewardAssignments.userId, ctx.session.user.id),
      with: {
        show: {
          with: {
            organisation: true,
            venue: true,
          },
        },
        ring: true,
      },
    });

    // Show all assigned shows except drafts and cancelled
    return assignments
      .filter((a) =>
        !['draft', 'cancelled'].includes(a.show.status)
      )
      .map((a) => ({
        ...a.show,
        ring: a.ring,
        assignmentId: a.id,
      }));
  }),

  // ── Classes for a show (with entry counts + results status) ──
  getShowClasses: stewardProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyStewardAssignment(ctx.db, ctx.session.user.id, input.showId);

      const classes = await ctx.db.query.showClasses.findMany({
        where: eq(showClasses.showId, input.showId),
        with: {
          classDefinition: true,
          breed: true,
          entryClasses: {
            with: {
              entry: {
                columns: { id: true, status: true, deletedAt: true },
              },
              result: true,
            },
          },
        },
        orderBy: [asc(showClasses.sortOrder)],
      });

      return classes.map((sc) => {
        const confirmedEntries = sc.entryClasses.filter(
          (ec) => ec.entry.status === 'confirmed' && !ec.entry.deletedAt
        );
        const resultsCount = confirmedEntries.filter(
          (ec) => ec.result !== null
        ).length;

        return {
          id: sc.id,
          classNumber: sc.classNumber,
          classDefinition: sc.classDefinition,
          breed: sc.breed,
          sex: sc.sex,
          sortOrder: sc.sortOrder,
          entryCount: confirmedEntries.length,
          resultsCount,
          hasResults: resultsCount > 0,
        };
      });
    }),

  // ── Entries in a class (for recording results) ──────────
  getClassEntries: stewardProcedure
    .input(z.object({ showClassId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Find the show for this class to verify assignment
      const showClass = await ctx.db.query.showClasses.findFirst({
        where: eq(showClasses.id, input.showClassId),
        with: {
          classDefinition: true,
          breed: true,
        },
      });

      if (!showClass) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Class not found' });
      }

      await verifyStewardAssignment(
        ctx.db,
        ctx.session.user.id,
        showClass.showId
      );

      const classEntries = await ctx.db.query.entryClasses.findMany({
        where: eq(entryClasses.showClassId, input.showClassId),
        with: {
          entry: {
            with: {
              dog: {
                with: { breed: true },
              },
              exhibitor: { columns: { id: true, name: true } },
            },
          },
          result: true,
        },
      });

      // Filter to confirmed, non-deleted entries
      const confirmed = classEntries.filter(
        (ec) => ec.entry.status === 'confirmed' && !ec.entry.deletedAt
      );

      return {
        showClass: {
          id: showClass.id,
          showId: showClass.showId,
          classDefinition: showClass.classDefinition,
          breed: showClass.breed,
          sex: showClass.sex,
        },
        entries: confirmed
          .sort((a, b) => {
            const aCat = Number(a.entry.catalogueNumber) || 9999;
            const bCat = Number(b.entry.catalogueNumber) || 9999;
            return aCat - bCat;
          })
          .map((ec) => ({
            entryClassId: ec.id,
            entryId: ec.entry.id,
            dogId: ec.entry.dog?.id ?? null,
            catalogueNumber: ec.entry.catalogueNumber,
            dogName: ec.entry.dog?.registeredName ?? 'Unknown',
            breedName: ec.entry.dog?.breed?.name ?? '',
            exhibitorName: ec.entry.exhibitor.name,
            absent: ec.entry.absent,
            result: ec.result
              ? {
                  id: ec.result.id,
                  placement: ec.result.placement,
                  specialAward: ec.result.specialAward,
                  critiqueText: ec.result.critiqueText,
                }
              : null,
          })),
      };
    }),

  // ── Record / update a result ───────────────────────────
  recordResult: stewardProcedure
    .input(
      z.object({
        entryClassId: z.string().uuid(),
        placement: z.number().int().min(1).max(7).nullable(),
        specialAward: z.string().nullable().optional(),
        critiqueText: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify this entry class exists and get its show
      const ec = await ctx.db.query.entryClasses.findFirst({
        where: eq(entryClasses.id, input.entryClassId),
        with: {
          showClass: true,
        },
      });

      if (!ec) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Entry class not found',
        });
      }

      await verifyStewardAssignment(
        ctx.db,
        ctx.session.user.id,
        ec.showClass.showId
      );

      // Upsert the result
      const [result] = await ctx.db
        .insert(results)
        .values({
          entryClassId: input.entryClassId,
          placement: input.placement,
          specialAward: input.specialAward ?? null,
          critiqueText: input.critiqueText ?? null,
          recordedBy: ctx.session.user.id,
          recordedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: results.entryClassId,
          set: {
            placement: input.placement,
            specialAward: input.specialAward ?? null,
            critiqueText: input.critiqueText ?? null,
            recordedBy: ctx.session.user.id,
            recordedAt: new Date(),
          },
        })
        .returning();

      return result!;
    }),

  // ── Remove a result ────────────────────────────────────
  removeResult: stewardProcedure
    .input(z.object({ entryClassId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ec = await ctx.db.query.entryClasses.findFirst({
        where: eq(entryClasses.id, input.entryClassId),
        with: { showClass: true },
      });

      if (!ec) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Entry class not found',
        });
      }

      await verifyStewardAssignment(
        ctx.db,
        ctx.session.user.id,
        ec.showClass.showId
      );

      await ctx.db
        .delete(results)
        .where(eq(results.entryClassId, input.entryClassId));

      return { removed: true };
    }),

  // ── Mark entry absent/present ──────────────────────────
  markAbsent: stewardProcedure
    .input(
      z.object({
        entryId: z.string().uuid(),
        absent: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.query.entries.findFirst({
        where: eq(entries.id, input.entryId),
      });

      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      }

      await verifyStewardAssignment(ctx.db, ctx.session.user.id, entry.showId);

      const [updated] = await ctx.db
        .update(entries)
        .set({ absent: input.absent })
        .where(eq(entries.id, input.entryId))
        .returning();

      return updated!;
    }),

  // ── Public: live results for a show ─────────────────────
  getLiveResults: publicProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        with: { organisation: true, venue: true },
      });

      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      const classes = await ctx.db.query.showClasses.findMany({
        where: eq(showClasses.showId, input.showId),
        with: {
          classDefinition: true,
          breed: true,
          entryClasses: {
            with: {
              entry: {
                columns: {
                  id: true,
                  catalogueNumber: true,
                  status: true,
                  deletedAt: true,
                  dogId: true,
                },
                with: {
                  dog: {
                    columns: { id: true, registeredName: true },
                    with: { breed: true },
                  },
                  exhibitor: { columns: { name: true } },
                },
              },
              result: true,
            },
          },
        },
        orderBy: [asc(showClasses.sortOrder)],
      });

      // Build results grouped by breed → class
      const breedGroups = new Map<
        string,
        {
          breedName: string;
          classes: {
            classId: string;
            className: string;
            classNumber: number | null;
            sex: string | null;
            results: {
              placement: number | null;
              specialAward: string | null;
              critiqueText: string | null;
              catalogueNumber: string | null;
              dogId: string | null;
              dogName: string;
              exhibitorName: string;
            }[];
          }[];
        }
      >();

      for (const sc of classes) {
        const breedName = sc.breed?.name ?? 'Any Breed';

        if (!breedGroups.has(breedName)) {
          breedGroups.set(breedName, { breedName, classes: [] });
        }

        const classResults = sc.entryClasses
          .filter(
            (ec) =>
              ec.result !== null &&
              ec.entry.status === 'confirmed' &&
              !ec.entry.deletedAt
          )
          .map((ec) => ({
            placement: ec.result!.placement,
            specialAward: ec.result!.specialAward,
            critiqueText: ec.result!.critiqueText,
            catalogueNumber: ec.entry.catalogueNumber,
            dogId: ec.entry.dog?.id ?? null,
            dogName: ec.entry.dog?.registeredName ?? 'Unknown',
            exhibitorName: ec.entry.exhibitor?.name ?? '',
          }))
          .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));

        if (classResults.length > 0) {
          breedGroups.get(breedName)!.classes.push({
            classId: sc.id,
            className: sc.classDefinition.name,
            classNumber: sc.classNumber,
            sex: sc.sex,
            results: classResults,
          });
        }
      }

      // Fetch breed-level and show-level achievements
      const showAchievements = await ctx.db.query.achievements.findMany({
        where: eq(achievements.showId, input.showId),
        with: {
          dog: {
            columns: { id: true, registeredName: true },
          },
        },
      });

      return {
        show: {
          id: show.id,
          name: show.name,
          startDate: show.startDate,
          endDate: show.endDate,
          status: show.status,
          organisation: show.organisation,
          venue: show.venue,
        },
        breedGroups: Array.from(breedGroups.values()).sort((a, b) =>
          a.breedName.localeCompare(b.breedName)
        ),
        achievements: showAchievements.map((a) => ({
          id: a.id,
          type: a.type,
          dogId: a.dogId,
          dogName: a.dog?.registeredName ?? 'Unknown',
          details: a.details as Record<string, unknown> | null,
        })),
      };
    }),

  // ── Public: results summary (progress indicator) ────────
  getResultsSummary: publicProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const classes = await ctx.db.query.showClasses.findMany({
        where: eq(showClasses.showId, input.showId),
        with: {
          entryClasses: {
            with: {
              entry: {
                columns: { status: true, deletedAt: true },
              },
              result: true,
            },
          },
        },
      });

      // A class counts as "judged" if it has at least one result
      const totalClasses = classes.length;
      const judgedClasses = classes.filter((sc) =>
        sc.entryClasses.some(
          (ec) =>
            ec.result !== null &&
            ec.entry.status === 'confirmed' &&
            !ec.entry.deletedAt
        )
      ).length;

      return {
        totalClasses,
        judgedClasses,
      };
    }),

  // ── Mark an entry as absent ─────────────────────────────
  markAbsent: stewardProcedure
    .input(
      z.object({
        entryId: z.string().uuid(),
        absent: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.query.entries.findFirst({
        where: eq(entries.id, input.entryId),
      });

      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      }

      await verifyStewardAssignment(
        ctx.db,
        ctx.session.user.id,
        entry.showId
      );

      const [updated] = await ctx.db
        .update(entries)
        .set({ absent: input.absent })
        .where(eq(entries.id, input.entryId))
        .returning();

      return updated!;
    }),

  // ── Record a breed-level or show-level achievement ──────
  recordAchievement: stewardProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        dogId: z.string().uuid(),
        type: z.enum([
          'cc',
          'reserve_cc',
          'best_of_breed',
          'best_in_show',
          'reserve_best_in_show',
          'best_puppy_in_breed',
          'best_puppy_in_show',
          'best_veteran_in_breed',
          'group_placement',
        ]),
        judgeId: z.string().uuid().optional(),
        details: z
          .object({
            breedName: z.string().optional(),
            groupName: z.string().optional(),
            placement: z.number().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyStewardAssignment(
        ctx.db,
        ctx.session.user.id,
        input.showId
      );

      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
      });

      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      const [achievement] = await ctx.db
        .insert(achievements)
        .values({
          dogId: input.dogId,
          type: input.type,
          showId: input.showId,
          judgeId: input.judgeId ?? null,
          date: show.startDate,
          details: input.details ?? null,
        })
        .returning();

      return achievement!;
    }),

  // ── Remove an achievement ───────────────────────────────
  removeAchievement: stewardProcedure
    .input(z.object({ achievementId: z.string().uuid(), showId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyStewardAssignment(
        ctx.db,
        ctx.session.user.id,
        input.showId
      );

      await ctx.db
        .delete(achievements)
        .where(eq(achievements.id, input.achievementId));

      return { removed: true };
    }),

  // ── Get achievements for a show ─────────────────────────
  getShowAchievements: stewardProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyStewardAssignment(
        ctx.db,
        ctx.session.user.id,
        input.showId
      );

      const showAchievements = await ctx.db.query.achievements.findMany({
        where: eq(achievements.showId, input.showId),
        with: {
          dog: {
            columns: { id: true, registeredName: true },
          },
        },
      });

      return showAchievements;
    }),
});
