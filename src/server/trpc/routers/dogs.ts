import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, asc, desc, sql } from 'drizzle-orm';
import { protectedProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { dogs, dogOwners, dogTitles, users, entries, entryClasses, showClasses, shows, results, classDefinitions, achievements } from '@/server/db/schema';
import { scrapeKcDog, searchKcDogs } from '@/server/services/firecrawl';

/**
 * Recommend the highest achievement class a dog is still eligible for,
 * based on their first-place wins at qualifying shows.
 */
function getClassRecommendation(firsts: number, hasCC: boolean): {
  eligible: string[];
  suggested: string | null;
  reason: string;
} {
  if (hasCC) {
    return {
      eligible: ['Open'],
      suggested: 'Open',
      reason: 'Has won a CC — eligible for Open only',
    };
  }

  const eligible: string[] = [];
  let suggested: string | null = null;

  // Work from most restrictive to least
  if (firsts === 0) {
    eligible.push('Maiden', 'Novice', 'Graduate', 'Post Graduate', 'Limit', 'Open');
    suggested = 'Maiden';
  } else if (firsts <= 2) {
    eligible.push('Novice', 'Graduate', 'Post Graduate', 'Limit', 'Open');
    suggested = 'Novice';
  } else if (firsts <= 3) {
    eligible.push('Graduate', 'Post Graduate', 'Limit', 'Open');
    suggested = 'Graduate';
  } else if (firsts <= 4) {
    eligible.push('Post Graduate', 'Limit', 'Open');
    suggested = 'Post Graduate';
  } else if (firsts <= 6) {
    eligible.push('Limit', 'Open');
    suggested = 'Limit';
  } else {
    eligible.push('Open');
    suggested = 'Open';
  }

  const reason = firsts === 0
    ? 'No qualifying wins recorded — eligible for all classes'
    : `${firsts} first-place win${firsts !== 1 ? 's' : ''} recorded on Remi`;

  return { eligible, suggested, reason };
}

export const dogsRouter = createTRPCRouter({
  // ── Public dog profile ──────────────────────────────────
  getPublicProfile: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Fetch dog info with breed, titles, achievements
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.id), isNull(dogs.deletedAt)),
        with: {
          breed: {
            with: {
              group: true,
            },
          },
          titles: true,
          achievements: true,
        },
      });

      if (!dog) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dog not found',
        });
      }

      // Fetch show history: entries → entryClasses → showClass → classDefinition + result
      const dogEntries = await ctx.db.query.entries.findMany({
        where: and(
          eq(entries.dogId, input.id),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        ),
        with: {
          show: true,
          entryClasses: {
            with: {
              showClass: {
                with: {
                  classDefinition: true,
                },
              },
              result: true,
            },
          },
        },
      });

      // Build show history grouped by show
      const showHistory = dogEntries
        .map((entry) => ({
          showId: entry.show.id,
          showName: entry.show.name,
          showDate: entry.show.startDate,
          showType: entry.show.showType,
          classes: entry.entryClasses.map((ec) => ({
            className: ec.showClass.classDefinition.name,
            classNumber: ec.showClass.classNumber,
            placement: ec.result?.placement ?? null,
            specialAward: ec.result?.specialAward ?? null,
            critiqueText: ec.result?.critiqueText ?? null,
          })),
        }))
        .sort((a, b) => b.showDate.localeCompare(a.showDate));

      // Compute stats
      const totalShows = showHistory.length;
      let totalClasses = 0;
      let firsts = 0;
      let seconds = 0;
      let thirds = 0;
      let specialAwards = 0;

      for (const show of showHistory) {
        totalClasses += show.classes.length;
        for (const cls of show.classes) {
          if (cls.placement === 1) firsts++;
          if (cls.placement === 2) seconds++;
          if (cls.placement === 3) thirds++;
          if (cls.specialAward) specialAwards++;
        }
      }

      return {
        dog: {
          id: dog.id,
          registeredName: dog.registeredName,
          breed: dog.breed,
          sex: dog.sex,
          dateOfBirth: dog.dateOfBirth,
          sireName: dog.sireName,
          damName: dog.damName,
          breederName: dog.breederName,
          colour: dog.colour,
          kcRegNumber: dog.kcRegNumber,
        },
        titles: dog.titles,
        achievements: dog.achievements,
        showHistory,
        stats: {
          totalShows,
          totalClasses,
          firsts,
          seconds,
          thirds,
          specialAwards,
        },
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.dogs.findMany({
      where: and(
        eq(dogs.ownerId, ctx.session.user.id),
        isNull(dogs.deletedAt)
      ),
      with: {
        breed: {
          with: {
            group: true,
          },
        },
        titles: true,
      },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.id), isNull(dogs.deletedAt)),
        with: {
          breed: {
            with: {
              group: true,
            },
          },
          achievements: true,
          owners: {
            orderBy: [asc(dogOwners.sortOrder)],
          },
          titles: true,
        },
      });

      if (!dog) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dog not found',
        });
      }

      if (dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not own this dog',
        });
      }

      return dog;
    }),

  create: protectedProcedure
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
        owners: z.array(z.object({
          ownerName: z.string().min(1),
          ownerAddress: z.string().min(1),
          ownerEmail: z.string().email(),
          ownerPhone: z.string().optional(),
          isPrimary: z.boolean().default(false),
        })).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { owners, ...dogData } = input;

      const [dog] = await ctx.db
        .insert(dogs)
        .values({
          ...dogData,
          kcRegNumber: dogData.kcRegNumber ?? null,
          sireName: dogData.sireName ?? null,
          damName: dogData.damName ?? null,
          breederName: dogData.breederName ?? null,
          colour: dogData.colour ?? null,
          ownerId: ctx.session.user.id,
        })
        .returning();

      // Create owner records — auto-create primary from user if not provided
      if (owners && owners.length > 0) {
        await ctx.db.insert(dogOwners).values(
          owners.map((o, i) => ({
            dogId: dog!.id,
            userId: i === 0 ? ctx.session.user.id : null,
            ownerName: o.ownerName,
            ownerAddress: o.ownerAddress,
            ownerEmail: o.ownerEmail,
            ownerPhone: o.ownerPhone ?? null,
            isPrimary: o.isPrimary || i === 0,
            sortOrder: i,
          }))
        );
      } else {
        // Default: create primary owner from session user
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, ctx.session.user.id),
        });
        await ctx.db.insert(dogOwners).values({
          dogId: dog!.id,
          userId: ctx.session.user.id,
          ownerName: ctx.session.user.name,
          ownerAddress: user?.address ?? '',
          ownerEmail: ctx.session.user.email,
          ownerPhone: user?.phone ?? null,
          isPrimary: true,
          sortOrder: 0,
        });
      }

      return dog!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        registeredName: z.string().min(1).max(255).optional(),
        kcRegNumber: z.string().nullable().optional(),
        breedId: z.string().uuid().optional(),
        sex: z.enum(['dog', 'bitch']).optional(),
        dateOfBirth: z.string().optional(),
        sireName: z.string().nullable().optional(),
        damName: z.string().nullable().optional(),
        breederName: z.string().nullable().optional(),
        colour: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, id), isNull(dogs.deletedAt)),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dog not found',
        });
      }

      if (existing.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not own this dog',
        });
      }

      const [updated] = await ctx.db
        .update(dogs)
        .set(data)
        .where(eq(dogs.id, id))
        .returning();

      return updated!;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.id), isNull(dogs.deletedAt)),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dog not found',
        });
      }

      if (existing.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not own this dog',
        });
      }

      const [deleted] = await ctx.db
        .update(dogs)
        .set({ deletedAt: new Date() })
        .where(eq(dogs.id, input.id))
        .returning();

      return deleted!;
    }),

  // ── Owner management ─────────────────────────────────────

  addOwner: protectedProcedure
    .input(
      z.object({
        dogId: z.string().uuid(),
        ownerName: z.string().min(1),
        ownerAddress: z.string().min(1),
        ownerEmail: z.string().email(),
        ownerPhone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.dogId), isNull(dogs.deletedAt)),
        with: { owners: true },
      });

      if (!dog || dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      if (dog.owners.length >= 4) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Maximum 4 owners per dog',
        });
      }

      const [owner] = await ctx.db
        .insert(dogOwners)
        .values({
          dogId: input.dogId,
          ownerName: input.ownerName,
          ownerAddress: input.ownerAddress,
          ownerEmail: input.ownerEmail,
          ownerPhone: input.ownerPhone ?? null,
          sortOrder: dog.owners.length,
          isPrimary: false,
        })
        .returning();

      return owner!;
    }),

  updateOwner: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        ownerName: z.string().min(1).optional(),
        ownerAddress: z.string().min(1).optional(),
        ownerEmail: z.string().email().optional(),
        ownerPhone: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const owner = await ctx.db.query.dogOwners.findFirst({
        where: eq(dogOwners.id, input.id),
        with: { dog: true },
      });

      if (!owner || owner.dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(dogOwners)
        .set(data)
        .where(eq(dogOwners.id, id))
        .returning();

      return updated!;
    }),

  removeOwner: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const owner = await ctx.db.query.dogOwners.findFirst({
        where: eq(dogOwners.id, input.id),
        with: { dog: { with: { owners: true } } },
      });

      if (!owner || owner.dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      if (owner.isPrimary) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the primary owner',
        });
      }

      await ctx.db.delete(dogOwners).where(eq(dogOwners.id, input.id));
      return { success: true };
    }),

  // ── Title management ─────────────────────────────────────

  addTitle: protectedProcedure
    .input(
      z.object({
        dogId: z.string().uuid(),
        title: z.enum(['ch', 'sh_ch', 'ir_ch', 'ir_sh_ch', 'int_ch', 'ob_ch', 'ft_ch', 'wt_ch']),
        dateAwarded: z.string().optional(),
        awardingBody: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.dogId), isNull(dogs.deletedAt)),
      });

      if (!dog || dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      const [title] = await ctx.db
        .insert(dogTitles)
        .values({
          dogId: input.dogId,
          title: input.title,
          dateAwarded: input.dateAwarded ?? null,
          awardingBody: input.awardingBody ?? null,
        })
        .returning();

      return title!;
    }),

  removeTitle: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const title = await ctx.db.query.dogTitles.findFirst({
        where: eq(dogTitles.id, input.id),
        with: { dog: true },
      });

      if (!title || title.dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      await ctx.db.delete(dogTitles).where(eq(dogTitles.id, input.id));
      return { success: true };
    }),

  // ── KC Lookup ──────────────────────────────────────────────

  kcLookup: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(255) }))
    .mutation(async ({ input }) => {
      const results = await searchKcDogs(input.query);
      if (results.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Could not find a dog matching that name or registration number on the KC website.',
        });
      }
      return results;
    }),

  // ── Owner profiles (reuse previous owners) ────────────────

  getMyOwnerProfiles: protectedProcedure.query(async ({ ctx }) => {
    // Get distinct owner profiles from all dogs owned by this user.
    // Uses a subquery to deduplicate by email and return the most recent version.
    const ownerRows = await ctx.db
      .selectDistinctOn([dogOwners.ownerEmail], {
        ownerName: dogOwners.ownerName,
        ownerAddress: dogOwners.ownerAddress,
        ownerEmail: dogOwners.ownerEmail,
        ownerPhone: dogOwners.ownerPhone,
      })
      .from(dogOwners)
      .innerJoin(dogs, eq(dogOwners.dogId, dogs.id))
      .where(
        and(
          eq(dogs.ownerId, ctx.session.user.id),
          isNull(dogs.deletedAt),
        )
      )
      .orderBy(dogOwners.ownerEmail, desc(dogOwners.createdAt));

    return ownerRows;
  }),

  // ── Win summary for class eligibility ────────────────────
  getWinSummary: protectedProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Count first-place wins at Open and Championship shows
      // This is used to determine eligibility for achievement-based classes
      // e.g., Novice allows max 2 firsts, Graduate allows max 3, etc.
      const winRows = await ctx.db
        .select({
          className: classDefinitions.name,
          classType: classDefinitions.type,
          showType: shows.showType,
          placement: results.placement,
        })
        .from(results)
        .innerJoin(entryClasses, eq(results.entryClassId, entryClasses.id))
        .innerJoin(entries, eq(entryClasses.entryId, entries.id))
        .innerJoin(showClasses, eq(entryClasses.showClassId, showClasses.id))
        .innerJoin(classDefinitions, eq(showClasses.classDefinitionId, classDefinitions.id))
        .innerJoin(shows, eq(entries.showId, shows.id))
        .where(
          and(
            eq(entries.dogId, input.dogId),
            eq(entries.status, 'confirmed'),
            isNull(entries.deletedAt),
            eq(results.placement, 1),
          )
        );

      // Count firsts by show type (KC rules count Open + Championship shows)
      const firstsAtQualifyingShows = winRows.filter(
        (r) => r.showType === 'open' || r.showType === 'championship' || r.showType === 'premier_open'
      ).length;

      // Count CCs from achievements
      const ccCount = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(achievements)
        .where(
          and(
            eq(achievements.dogId, input.dogId),
            eq(achievements.type, 'cc'),
          )
        );

      const hasCC = (ccCount[0]?.count ?? 0) > 0;

      // Build recommendation per class definition
      // KC eligibility rules for achievement classes:
      // Maiden: no first at Open/Champ
      // Novice: max 2 firsts at Open/Champ, no CC
      // Graduate: max 3 firsts at Champ shows, no CC
      // Post Graduate: max 4 firsts at Champ shows, no CC
      // Limit: max 6 firsts at Champ in Limit/Open, no Show Champion, no 3+ CCs
      // Open: no restrictions
      return {
        totalFirsts: firstsAtQualifyingShows,
        hasCC,
        recommendation: getClassRecommendation(firstsAtQualifyingShows, hasCC),
      };
    }),

  // ── KC Title Progress ─────────────────────────────────────
  getTitleProgress: protectedProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.dogId), isNull(dogs.deletedAt)),
        with: {
          breed: { with: { group: true } },
          titles: true,
          achievements: true,
        },
      });

      if (!dog) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dog not found' });
      }

      const now = new Date();
      const dob = new Date(dog.dateOfBirth);
      const ageMonths = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());

      // Count achievements by type
      const ccAchievements = dog.achievements.filter((a) => a.type === 'cc');
      const reserveCCs = dog.achievements.filter((a) => a.type === 'reserve_cc');
      const bobs = dog.achievements.filter((a) => a.type === 'best_of_breed');

      // Count unique judges who awarded CCs
      const ccJudgeIds = new Set(ccAchievements.map((a) => a.judgeId).filter(Boolean));

      // Count first-place wins from results for JW calculation
      const firstPlaceWins = await ctx.db
        .select({
          showType: shows.showType,
          showDate: shows.startDate,
        })
        .from(results)
        .innerJoin(entryClasses, eq(results.entryClassId, entryClasses.id))
        .innerJoin(entries, eq(entryClasses.entryId, entries.id))
        .innerJoin(shows, eq(entries.showId, shows.id))
        .where(
          and(
            eq(entries.dogId, input.dogId),
            eq(entries.status, 'confirmed'),
            isNull(entries.deletedAt),
            eq(results.placement, 1),
          )
        );

      // Junior Warrant: 25 points from firsts before 18 months
      // Championship show first = 3 points, Open show first = 1 point
      const eighteenMonths = new Date(dob);
      eighteenMonths.setMonth(eighteenMonths.getMonth() + 18);

      const jwWins = firstPlaceWins.filter(
        (w) => new Date(w.showDate) <= eighteenMonths
      );
      const jwPoints = jwWins.reduce((sum, w) => {
        if (w.showType === 'championship') return sum + 3;
        if (w.showType === 'open' || w.showType === 'premier_open') return sum + 1;
        return sum;
      }, 0);

      const existingTitles = new Set(dog.titles.map((t) => t.title));

      const titleProgress = [];

      // Champion: 3 CCs under 3 different judges
      if (!existingTitles.has('ch')) {
        titleProgress.push({
          title: 'Champion (Ch)',
          code: 'ch' as const,
          current: ccAchievements.length,
          required: 3,
          progress: Math.min(ccAchievements.length / 3, 1),
          detail: `${ccAchievements.length}/3 CCs${ccJudgeIds.size > 0 ? ` (${ccJudgeIds.size} judge${ccJudgeIds.size !== 1 ? 's' : ''})` : ''}`,
          milestoneReached: ccAchievements.length >= 3 && ccJudgeIds.size >= 3,
        });
      }

      // Show Champion: 3 CCs + qualifying field (gundogs only)
      const isGundog = dog.breed.group?.name === 'Gundog';
      if (!existingTitles.has('sh_ch') && isGundog) {
        titleProgress.push({
          title: 'Show Champion (Sh Ch)',
          code: 'sh_ch' as const,
          current: ccAchievements.length,
          required: 3,
          progress: Math.min(ccAchievements.length / 3, 1),
          detail: `${ccAchievements.length}/3 CCs (+ qualifying field trial win required)`,
          milestoneReached: false, // Can't auto-detect field trial wins
        });
      }

      // Junior Warrant: 25 points before 18 months
      if (ageMonths < 18 || jwPoints > 0) {
        const isStillEligible = ageMonths < 18;
        titleProgress.push({
          title: 'Junior Warrant (JW)',
          code: 'jw' as const,
          current: jwPoints,
          required: 25,
          progress: Math.min(jwPoints / 25, 1),
          detail: isStillEligible
            ? `${jwPoints}/25 points (${Math.ceil((eighteenMonths.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))} days remaining)`
            : `${jwPoints}/25 points (age limit reached)`,
          milestoneReached: jwPoints >= 25,
        });
      }

      return {
        dogName: dog.registeredName,
        existingTitles: dog.titles,
        titleProgress,
        stats: {
          ccs: ccAchievements.length,
          reserveCCs: reserveCCs.length,
          bobs: bobs.length,
          totalFirsts: firstPlaceWins.length,
          jwPoints,
        },
        disclaimer: 'Progress shown is based on results recorded in Remi only. Wins at shows not using Remi are not included.',
      };
    }),
});
