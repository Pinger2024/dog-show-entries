import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, isNotNull, asc } from 'drizzle-orm';
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
  stewardBreedAssignments,
  classDefinitions,
  achievements,
  dogs,
  judges,
  judgeAssignments,
} from '@/server/db/schema';
import { isUuid } from '@/lib/slugify';
import { sendJudgeApprovalRequestEmail } from '@/server/services/email';

/** Resolve a show slug or UUID to a UUID */
async function resolveShowId(db: Database, idOrSlug: string): Promise<string> {
  if (isUuid(idOrSlug)) return idOrSlug;
  const show = await db.query.shows.findFirst({
    where: eq(shows.slug, idOrSlug),
    columns: { id: true },
  });
  if (!show) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
  return show.id;
}

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

/** Throws if results are locked (published). Stewards cannot edit results while published. */
async function assertResultsNotLocked(db: Database, showId: string) {
  const show = await db.query.shows.findFirst({
    where: eq(shows.id, showId),
    columns: { resultsLockedAt: true },
  });
  if (show?.resultsLockedAt) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Results are published and locked. The secretary must unpublish before changes can be made.',
    });
  }
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
        breedAssignments: {
          with: { breed: true },
        },
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
        breedAssignments: a.breedAssignments,
      }));
  }),

  // ── Classes for a show (with entry counts + results status) ──
  getShowClasses: stewardProcedure
    .input(z.object({ showId: z.string().uuid(), date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const assignment = await verifyStewardAssignment(ctx.db, ctx.session.user.id, input.showId);

      // Check if this steward has breed-specific assignments
      const breedAssignments = await ctx.db.query.stewardBreedAssignments.findMany({
        where: eq(stewardBreedAssignments.stewardAssignmentId, assignment.id),
      });

      // If a date filter is provided, narrow to breeds assigned for that day
      const assignedBreedIds = breedAssignments.length > 0
        ? [...new Set(
            breedAssignments
              .filter((ba) => !input.date || ba.showDate === input.date)
              .map((ba) => ba.breedId)
          )]
        : null; // null = show all (no breed filtering)

      const classes = await ctx.db.query.showClasses.findMany({
        where: eq(showClasses.showId, input.showId),
        with: {
          classDefinition: true,
          breed: true,
          entryClasses: {
            with: {
              entry: {
                columns: { id: true, status: true, deletedAt: true, absent: true },
              },
              result: true,
            },
          },
        },
        orderBy: [asc(showClasses.sortOrder)],
      });

      // Filter to assigned breeds if applicable
      const filtered = assignedBreedIds
        ? classes.filter((sc) => sc.breedId && assignedBreedIds.includes(sc.breedId))
        : classes;

      return filtered.map((sc) => {
        const confirmedEntries = sc.entryClasses.filter(
          (ec) => ec.entry.status === 'confirmed' && !ec.entry.deletedAt
        );
        const resultsCount = confirmedEntries.filter(
          (ec) => ec.result !== null
        ).length;
        const absentCount = confirmedEntries.filter(
          (ec) => ec.entry.absent
        ).length;

        return {
          id: sc.id,
          classNumber: sc.classNumber,
          classDefinition: sc.classDefinition,
          breed: sc.breed,
          sex: sc.sex,
          sortOrder: sc.sortOrder,
          entryCount: confirmedEntries.length,
          absentCount,
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

      // Fetch show scope for placement rules
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, showClass.showId),
        columns: { showScope: true },
      });

      // Fetch judge for this class's breed to check breeder conflicts
      let judgeName: string | null = null;
      if (showClass.breedId) {
        const assignment = await ctx.db.query.judgeAssignments.findFirst({
          where: and(
            eq(judgeAssignments.showId, showClass.showId),
            eq(judgeAssignments.breedId, showClass.breedId)
          ),
          with: { judge: { columns: { name: true } } },
        });
        judgeName = assignment?.judge?.name ?? null;
      }

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
          showScope: show?.showScope ?? 'general',
        },
        judgeName,
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
            breederName: ec.entry.dog?.breederName ?? null,
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
        winnerPhotoUrl: z.string().nullable().optional(),
        winnerPhotoStorageKey: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify this entry class exists, is confirmed, and get its show
      const ec = await ctx.db.query.entryClasses.findFirst({
        where: eq(entryClasses.id, input.entryClassId),
        with: {
          showClass: true,
          entry: { columns: { status: true, deletedAt: true, absent: true } },
        },
      });

      if (!ec) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Entry class not found',
        });
      }

      if (ec.entry.status !== 'confirmed' || ec.entry.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot record result for a non-confirmed entry',
        });
      }

      await verifyStewardAssignment(
        ctx.db,
        ctx.session.user.id,
        ec.showClass.showId
      );

      await assertResultsNotLocked(ctx.db, ec.showClass.showId);

      // Upsert the result
      const [result] = await ctx.db
        .insert(results)
        .values({
          entryClassId: input.entryClassId,
          placement: input.placement,
          specialAward: input.specialAward ?? null,
          critiqueText: input.critiqueText ?? null,
          winnerPhotoUrl: input.winnerPhotoUrl ?? null,
          winnerPhotoStorageKey: input.winnerPhotoStorageKey ?? null,
          recordedBy: ctx.session.user.id,
          recordedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: results.entryClassId,
          set: {
            placement: input.placement,
            specialAward: input.specialAward ?? null,
            critiqueText: input.critiqueText ?? null,
            winnerPhotoUrl: input.winnerPhotoUrl ?? null,
            winnerPhotoStorageKey: input.winnerPhotoStorageKey ?? null,
            recordedBy: ctx.session.user.id,
            recordedAt: new Date(),
          },
        })
        .returning();

      return result!;
    }),

  // ── Update winner photo only (no data loss) ──────────────
  updateWinnerPhoto: stewardProcedure
    .input(
      z.object({
        entryClassId: z.string().uuid(),
        winnerPhotoUrl: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.results.findFirst({
        where: eq(results.entryClassId, input.entryClassId),
        with: { entryClass: { with: { showClass: true } } },
      });
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Result not found — record a placement first',
        });
      }
      const showId = (existing as typeof existing & { entryClass: { showClass: { showId: string } } }).entryClass.showClass.showId;
      await verifyStewardAssignment(ctx.db, ctx.session.user.id, showId);
      await assertResultsNotLocked(ctx.db, showId);
      const [updated] = await ctx.db
        .update(results)
        .set({ winnerPhotoUrl: input.winnerPhotoUrl })
        .where(eq(results.entryClassId, input.entryClassId))
        .returning();
      return updated!;
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

      await assertResultsNotLocked(ctx.db, ec.showClass.showId);

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
        with: { show: { columns: { status: true } } },
      });

      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      }

      if (['completed', 'cancelled'].includes(entry.show.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify attendance for a completed or cancelled show',
        });
      }

      await verifyStewardAssignment(ctx.db, ctx.session.user.id, entry.showId);

      const [updated] = await ctx.db
        .update(entries)
        .set({ absent: input.absent })
        .where(eq(entries.id, input.entryId))
        .returning();

      return updated!;
    }),

  // ── BOB / BIS / Group achievements ──────────────────────
  recordAchievement: stewardProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        dogId: z.string().uuid(),
        type: z.enum([
          'cc',
          'reserve_cc',
          'best_of_breed',
          'best_puppy_in_breed',
          'best_veteran_in_breed',
          'group_placement',
          'best_in_show',
          'reserve_best_in_show',
          'best_puppy_in_show',
          'dog_cc',
          'reserve_dog_cc',
          'bitch_cc',
          'reserve_bitch_cc',
          'best_puppy_dog',
          'best_puppy_bitch',
          'best_long_coat_dog',
          'best_long_coat_bitch',
          'best_long_coat_in_show',
        ]),
        date: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyStewardAssignment(ctx.db, ctx.session.user.id, input.showId);
      await assertResultsNotLocked(ctx.db, input.showId);

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

      // Validate sex matches award type (Dog CC → dogs only, Bitch CC → bitches only)
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

      // Upsert: remove existing same type for this show + dog, then insert
      await ctx.db
        .delete(achievements)
        .where(
          and(
            eq(achievements.showId, input.showId),
            eq(achievements.dogId, input.dogId),
            eq(achievements.type, input.type)
          )
        );

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

  removeAchievement: stewardProcedure
    .input(
      z.object({
        showId: z.string().uuid(),
        dogId: z.string().uuid(),
        type: z.enum([
          'cc',
          'reserve_cc',
          'best_of_breed',
          'best_puppy_in_breed',
          'best_veteran_in_breed',
          'group_placement',
          'best_in_show',
          'reserve_best_in_show',
          'best_puppy_in_show',
          'dog_cc',
          'reserve_dog_cc',
          'bitch_cc',
          'reserve_bitch_cc',
          'best_puppy_dog',
          'best_puppy_bitch',
          'best_long_coat_dog',
          'best_long_coat_bitch',
          'best_long_coat_in_show',
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyStewardAssignment(ctx.db, ctx.session.user.id, input.showId);
      await assertResultsNotLocked(ctx.db, input.showId);

      await ctx.db
        .delete(achievements)
        .where(
          and(
            eq(achievements.showId, input.showId),
            eq(achievements.dogId, input.dogId),
            eq(achievements.type, input.type)
          )
        );

      return { removed: true };
    }),

  getPublicShowAchievements: publicProcedure
    .input(z.object({ showId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const showId = await resolveShowId(ctx.db, input.showId);

      // Check publication status for non-privileged users
      const userRole = ctx.session?.user?.role;
      const isPrivileged = userRole && ['secretary', 'steward', 'admin'].includes(userRole);
      if (!isPrivileged) {
        const show = await ctx.db.query.shows.findFirst({
          where: eq(shows.id, showId),
          columns: { resultsPublishedAt: true },
        });
        if (!show?.resultsPublishedAt) return [];
      }

      return ctx.db.query.achievements.findMany({
        where: eq(achievements.showId, showId),
        with: {
          dog: {
            with: { breed: true },
          },
        },
      });
    }),

  // ── Public: live results for a show ─────────────────────
  getLiveResults: publicProcedure
    .input(z.object({ showId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const showId = await resolveShowId(ctx.db, input.showId);
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, showId),
        with: { organisation: true, venue: true },
      });

      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      // Check if caller is privileged (secretary/steward/admin)
      const userRole = ctx.session?.user?.role;
      const isPrivileged = userRole && ['secretary', 'steward', 'admin'].includes(userRole);

      // Per-result publication: public users only see results with publishedAt set.
      // Privileged users (secretary/steward/admin) see all results.

      const classes = await ctx.db.query.showClasses.findMany({
        where: eq(showClasses.showId, showId),
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
                  absent: true,
                },
                with: {
                  dog: {
                    columns: { id: true, registeredName: true, sex: true },
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
            entriesCount: number;
            dogsForward: number;
            results: {
              entryClassId: string;
              placement: number | null;
              specialAward: string | null;
              critiqueText: string | null;
              winnerPhotoUrl: string | null;
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

        // Count confirmed entries and dogs forward (present, not absent)
        const confirmedEntries = sc.entryClasses.filter(
          (ec) => ec.entry.status === 'confirmed' && !ec.entry.deletedAt
        );
        const dogsForward = confirmedEntries.filter(
          (ec) => !ec.entry.absent
        ).length;

        const classResults = sc.entryClasses
          .filter(
            (ec) =>
              ec.result !== null &&
              ec.entry.status === 'confirmed' &&
              !ec.entry.deletedAt &&
              // Public users only see published results
              (isPrivileged || ec.result!.publishedAt !== null)
          )
          .map((ec) => ({
            entryClassId: ec.id,
            placement: ec.result!.placement,
            specialAward: ec.result!.specialAward,
            critiqueText: ec.result!.critiqueText,
            winnerPhotoUrl: ec.result!.winnerPhotoUrl,
            catalogueNumber: ec.entry.catalogueNumber,
            dogId: ec.entry.dog?.id ?? null,
            dogName: ec.entry.dog?.registeredName ?? 'Unknown',
            dogSex: ec.entry.dog?.sex ?? null,
            exhibitorName: ec.entry.exhibitor?.name ?? '',
          }))
          .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));

        if (classResults.length > 0) {
          breedGroups.get(breedName)!.classes.push({
            classId: sc.id,
            className: sc.classDefinition.name,
            classNumber: sc.classNumber,
            sex: sc.sex,
            entriesCount: confirmedEntries.length,
            dogsForward,
            results: classResults,
          });
        }
      }

      // Fetch breed-level and show-level achievements
      const showAchievements = await ctx.db.query.achievements.findMany({
        where: eq(achievements.showId, showId),
        with: {
          dog: {
            columns: { id: true, registeredName: true },
          },
        },
      });

      const sortedGroups = Array.from(breedGroups.values()).sort((a, b) =>
        a.breedName.localeCompare(b.breedName)
      );

      // For public users: if no results are visible, show unpublished message
      const hasVisibleResults = sortedGroups.some((g) => g.classes.length > 0);
      if (!isPrivileged && !hasVisibleResults) {
        return {
          show: {
            id: show.id,
            name: show.name,
            startDate: show.startDate,
            endDate: show.endDate,
            status: show.status,
            organisation: show.organisation,
            venue: show.venue,
            resultsPublishedAt: show.resultsPublishedAt,
          },
          breedGroups: [],
          achievements: [],
          unpublished: true as const,
        };
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
          resultsPublishedAt: show.resultsPublishedAt,
        },
        breedGroups: sortedGroups,
        achievements: showAchievements.map((a) => ({
          id: a.id,
          type: a.type,
          dogId: a.dogId,
          dogName: a.dog?.registeredName ?? 'Unknown',
          details: a.details as Record<string, unknown> | null,
        })),
        unpublished: false as const,
      };
    }),

  // ── Public: results summary (progress indicator) ────────
  getResultsSummary: publicProcedure
    .input(z.object({ showId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const showId = await resolveShowId(ctx.db, input.showId);
      const classes = await ctx.db.query.showClasses.findMany({
        where: eq(showClasses.showId, showId),
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

  // ── Get achievements for a show (steward-scoped) ────────
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

  // ── Submit results for judge approval ──────────────────
  submitForJudgeApproval: stewardProcedure
    .input(z.object({ showId: z.string().uuid(), judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyStewardAssignment(ctx.db, ctx.session.user.id, input.showId);

      // Find all assignments for this judge/show
      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: and(
          eq(judgeAssignments.showId, input.showId),
          eq(judgeAssignments.judgeId, input.judgeId)
        ),
      });

      if (assignments.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No assignments found for this judge at this show',
        });
      }

      // Get judge details
      const judge = await ctx.db.query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
      });

      if (!judge?.contactEmail) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This judge does not have an email address on file. Please ask the secretary to add one.',
        });
      }

      // Get show details for the email
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        with: { organisation: true, venue: true },
      });

      if (!show) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });
      }

      // Generate a shared approval token for all assignments
      const crypto = await import('crypto');
      const sharedToken = crypto.randomUUID();

      // Update all assignment rows with the shared token
      await ctx.db
        .update(judgeAssignments)
        .set({
          approvalToken: sharedToken,
          approvalStatus: 'pending',
          approvalSentAt: new Date(),
        })
        .where(
          and(
            eq(judgeAssignments.showId, input.showId),
            eq(judgeAssignments.judgeId, input.judgeId)
          )
        );

      // Send approval email
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
        breeds: assignments
          .filter((a) => a.breedId)
          .map((a) => a.breedId!),
      });

      return { sent: true, judgeEmail: judge.contactEmail };
    }),

  // ── Get judge approval status for a show ───────────────
  getJudgeApprovalStatus: stewardProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyStewardAssignment(ctx.db, ctx.session.user.id, input.showId);

      const assignments = await ctx.db.query.judgeAssignments.findMany({
        where: eq(judgeAssignments.showId, input.showId),
        with: {
          judge: true,
          breed: true,
        },
      });

      // Group by judge
      const judgeMap = new Map<string, {
        judgeId: string;
        judgeName: string;
        contactEmail: string | null;
        breeds: string[];
        approvalStatus: string | null;
        approvalSentAt: Date | null;
        approvedAt: Date | null;
        approvalNote: string | null;
      }>();

      for (const a of assignments) {
        if (!judgeMap.has(a.judgeId)) {
          judgeMap.set(a.judgeId, {
            judgeId: a.judgeId,
            judgeName: a.judge.name,
            contactEmail: a.judge.contactEmail,
            breeds: [],
            approvalStatus: a.approvalStatus,
            approvalSentAt: a.approvalSentAt,
            approvedAt: a.approvedAt,
            approvalNote: a.approvalNote,
          });
        }
        if (a.breed) {
          judgeMap.get(a.judgeId)!.breeds.push(a.breed.name);
        }
      }

      return Array.from(judgeMap.values());
    }),

  // ── Get results lock status for a show ─────────────────
  getResultsLockStatus: stewardProcedure
    .input(z.object({ showId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyStewardAssignment(ctx.db, ctx.session.user.id, input.showId);
      const show = await ctx.db.query.shows.findFirst({
        where: eq(shows.id, input.showId),
        columns: { resultsLockedAt: true, resultsPublishedAt: true },
      });
      return {
        locked: !!show?.resultsLockedAt,
        lockedAt: show?.resultsLockedAt ?? null,
        publishedAt: show?.resultsPublishedAt ?? null,
      };
    }),
});
