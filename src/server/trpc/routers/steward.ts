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
            catalogueNumber: ec.entry.catalogueNumber,
            dogName: ec.entry.dog?.registeredName ?? 'Unknown',
            breedName: ec.entry.dog?.breed?.name ?? '',
            exhibitorName: ec.entry.exhibitor.name,
            result: ec.result
              ? {
                  id: ec.result.id,
                  placement: ec.result.placement,
                  specialAward: ec.result.specialAward,
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
          recordedBy: ctx.session.user.id,
          recordedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: results.entryClassId,
          set: {
            placement: input.placement,
            specialAward: input.specialAward ?? null,
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
                },
                with: {
                  dog: {
                    columns: { registeredName: true },
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
              catalogueNumber: string | null;
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
            catalogueNumber: ec.entry.catalogueNumber,
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
});
