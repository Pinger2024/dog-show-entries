import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNull, asc, desc, sql } from 'drizzle-orm';
import { protectedProcedure, publicProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import { dogs, dogOwners, dogTitles, dogPhotos, users, entries, entryClasses, showClasses, shows, results, classDefinitions, achievements, judgeAssignments, judges } from '@/server/db/schema';
import { deleteFromR2 } from '@/server/services/storage';
import { scrapeKcDog, searchKcDogs, fetchKcDogProfile } from '@/server/services/firecrawl';

/**
 * Recommend the best class for a dog based on age eligibility first,
 * then achievement wins. Age classes (Puppy, Junior, etc.) take priority
 * when the dog is still within an age bracket.
 * If availableClassNames is provided, only suggest from classes in the show schedule.
 */
function getClassRecommendation(
  firsts: number,
  hasCC: boolean,
  availableClassNames?: string[],
  ageInfo?: {
    ageMonths: number;
    availableAgeClasses: { name: string; minMonths: number | null; maxMonths: number | null }[];
  },
): {
  eligible: string[];
  suggested: string | null;
  reason: string;
} {
  // Check age classes first — if the dog qualifies for an age class, suggest it
  if (ageInfo) {
    const eligibleAgeClasses = ageInfo.availableAgeClasses.filter((cls) => {
      const aboveMin = cls.minMonths === null || ageInfo.ageMonths >= cls.minMonths;
      const belowMax = cls.maxMonths === null || ageInfo.ageMonths < cls.maxMonths;
      return aboveMin && belowMax;
    });

    if (eligibleAgeClasses.length > 0) {
      // Suggest the most specific age class (smallest age range)
      const bestAgeClass = eligibleAgeClasses[0];

      // Still compute achievement eligibility for the full eligible list
      const achievementEligible = getAchievementEligible(firsts, hasCC, availableClassNames);

      return {
        eligible: achievementEligible,
        suggested: bestAgeClass.name,
        reason: `${ageInfo.ageMonths} months old — eligible for ${bestAgeClass.name}`,
      };
    }
  }

  // No age class eligible — fall back to achievement classes
  const eligible = getAchievementEligible(firsts, hasCC, availableClassNames);
  const suggested = eligible[0] ?? null;

  const reason = hasCC
    ? 'Has won a CC — eligible for Open only'
    : firsts === 0
      ? 'No qualifying wins recorded — eligible for all achievement classes'
      : `${firsts} first-place win${firsts !== 1 ? 's' : ''} recorded on Remi`;

  return { eligible, suggested, reason };
}

/** Compute achievement class eligibility based on RKC win rules */
function getAchievementEligible(
  firsts: number,
  hasCC: boolean,
  availableClassNames?: string[],
): string[] {
  let allEligible: string[];

  if (hasCC) {
    allEligible = ['Open'];
  } else if (firsts === 0) {
    allEligible = ['Maiden', 'Novice', 'Graduate', 'Post Graduate', 'Limit', 'Open'];
  } else if (firsts <= 2) {
    allEligible = ['Novice', 'Graduate', 'Post Graduate', 'Limit', 'Open'];
  } else if (firsts <= 3) {
    allEligible = ['Graduate', 'Post Graduate', 'Limit', 'Open'];
  } else if (firsts <= 4) {
    allEligible = ['Post Graduate', 'Limit', 'Open'];
  } else if (firsts <= 6) {
    allEligible = ['Limit', 'Open'];
  } else {
    allEligible = ['Open'];
  }

  // Filter to only classes available in this show's schedule.
  // Use flatMap to match breed-specific variants (e.g. "Special Long Coat Open" → "Open")
  return availableClassNames
    ? allEligible.flatMap((name) =>
        availableClassNames.filter(
          (avail) =>
            avail.toLowerCase() === name.toLowerCase() ||
            avail.toLowerCase().endsWith(` ${name.toLowerCase()}`)
        )
      )
    : allEligible;
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
          owners: {
            columns: { userId: true },
          },
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
          showSlug: entry.show.slug,
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
          bio: dog.bio,
          kcRegNumber: dog.kcRegNumber,
          ownerId: dog.ownerId,
          ownerUserIds: [
            dog.ownerId,
            ...dog.owners
              .map((o) => o.userId)
              .filter((id): id is string => id !== null),
          ],
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
    const dogList = await ctx.db.query.dogs.findMany({
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

    // Fetch primary photos for all dogs in one query
    const dogIds = dogList.map((d) => d.id);
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

    return dogList.map((dog) => ({
      ...dog,
      primaryPhotoUrl: photoMap.get(dog.id) ?? null,
    }));
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

      // Backfill: dogs created before the multi-owner feature have no owner records
      if (dog.owners.length === 0) {
        const owner = await ctx.db.query.users.findFirst({
          where: eq(users.id, dog.ownerId),
        });
        if (owner) {
          const [created] = await ctx.db.insert(dogOwners).values({
            dogId: dog.id,
            userId: dog.ownerId,
            ownerName: owner.name ?? '',
            ownerAddress: owner.address ?? '',
            ownerEmail: owner.email ?? '',
            ownerPhone: owner.phone ?? null,
            isPrimary: true,
            sortOrder: 0,
          }).returning();
          if (created) {
            dog.owners = [created];
          }
        }
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
          kcRegNumber: dogData.kcRegNumber || null,
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
        bio: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, kcRegNumber, ...rest } = input;

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

      const data = {
        ...rest,
        ...(kcRegNumber !== undefined ? { kcRegNumber: kcRegNumber || null } : {}),
      };

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

  toggleFeedPrivacy: protectedProcedure
    .input(z.object({ id: z.string().uuid(), feedPrivate: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.id), isNull(dogs.deletedAt)),
      });
      if (!existing || existing.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }
      const [updated] = await ctx.db
        .update(dogs)
        .set({ feedPrivate: input.feedPrivate })
        .where(eq(dogs.id, input.id))
        .returning();
      return updated!;
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

  // ── RKC Lookup ──────────────────────────────────────────────

  kcLookup: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(255) }))
    .mutation(async ({ input }) => {
      // Require at least a space in the query to prevent overly broad searches
      // (e.g. just "Hundark" returns hundreds — need "Hundark D" or "Hundark Phantom")
      if (!input.query.trim().includes(' ')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Please enter at least the kennel name and the first letter of the dog\'s name (e.g. "Hundark D") for a more accurate search.',
        });
      }
      const results = await searchKcDogs(input.query);
      if (results.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No dogs found. The name must be typed exactly as it appears on the RKC registration certificate — including apostrophes and special characters.',
        });
      }
      return results;
    }),

  /** Fetch enriched pedigree data from the RKC dog profile page. */
  kcLookupProfile: protectedProcedure
    .input(z.object({ dogId: z.string().min(1).max(100) }))
    .mutation(async ({ input }) => {
      const profile = await fetchKcDogProfile(input.dogId);
      if (!profile) {
        // Not an error — we just couldn't get the data (timeout, slow page, etc.)
        return null;
      }
      return profile;
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
    .input(z.object({
      dogId: z.string().uuid(),
      showId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Count first-place wins at Open and Championship shows
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

      const firstsAtQualifyingShows = winRows.filter(
        (r) => r.showType === 'open' || r.showType === 'championship' || r.showType === 'premier_open'
      ).length;

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

      // Get achievement class names actually in this show's schedule
      let availableClassNames: string[] | undefined;
      let ageInfo: { ageMonths: number; availableAgeClasses: { name: string; minMonths: number | null; maxMonths: number | null }[] } | undefined;

      if (input.showId) {
        const showAchievementClasses = await ctx.db
          .select({ name: classDefinitions.name })
          .from(showClasses)
          .innerJoin(classDefinitions, eq(showClasses.classDefinitionId, classDefinitions.id))
          .where(
            and(
              eq(showClasses.showId, input.showId),
              eq(classDefinitions.type, 'achievement'),
            )
          );
        availableClassNames = showAchievementClasses.map((c) => c.name);

        // Fetch dog DOB and show date to calculate age for age class suggestions
        const [dog, show] = await Promise.all([
          ctx.db.query.dogs.findFirst({
            where: eq(dogs.id, input.dogId),
            columns: { dateOfBirth: true },
          }),
          ctx.db.query.shows.findFirst({
            where: eq(shows.id, input.showId),
            columns: { startDate: true },
          }),
        ]);

        if (dog?.dateOfBirth && show?.startDate) {
          const showDate = new Date(show.startDate);
          const dob = new Date(dog.dateOfBirth);
          const ageMonths = (showDate.getFullYear() - dob.getFullYear()) * 12
            + showDate.getMonth() - dob.getMonth()
            - (showDate.getDate() < dob.getDate() ? 1 : 0);

          // Get age classes available in this show's schedule
          const showAgeClasses = await ctx.db
            .select({
              name: classDefinitions.name,
              minMonths: classDefinitions.minAgeMonths,
              maxMonths: classDefinitions.maxAgeMonths,
            })
            .from(showClasses)
            .innerJoin(classDefinitions, eq(showClasses.classDefinitionId, classDefinitions.id))
            .where(
              and(
                eq(showClasses.showId, input.showId),
                eq(classDefinitions.type, 'age'),
              )
            );

          if (showAgeClasses.length > 0) {
            ageInfo = {
              ageMonths,
              availableAgeClasses: showAgeClasses.map((c) => ({
                name: c.name,
                minMonths: c.minMonths,
                maxMonths: c.maxMonths,
              })),
            };
          }
        }
      }

      return {
        totalFirsts: firstsAtQualifyingShows,
        hasCC,
        recommendation: getClassRecommendation(firstsAtQualifyingShows, hasCC, availableClassNames, ageInfo),
      };
    }),

  // ── RKC Title Progress ─────────────────────────────────────
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

      // Check if the user has Pro subscription
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
        columns: { proSubscriptionStatus: true },
      });
      const isPro = user?.proSubscriptionStatus === 'active' || user?.proSubscriptionStatus === 'trial';

      const now = new Date();
      const dob = new Date(dog.dateOfBirth);
      const ageMonths = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());

      // Count achievements by type
      const ccAchievements = dog.achievements.filter((a) => a.type === 'cc');
      const reserveCCs = dog.achievements.filter((a) => a.type === 'reserve_cc');
      const bobs = dog.achievements.filter((a) => a.type === 'best_of_breed');

      // Count unique judges who awarded CCs and RCCs
      const ccJudgeIds = new Set(ccAchievements.map((a) => a.judgeId).filter(Boolean));
      const rccJudgeIds = new Set(reserveCCs.map((a) => a.judgeId).filter(Boolean));
      // Combined unique judges across CCs and RCCs (for 2CC+5RCC route)
      const allCcRccJudgeIds = new Set([...ccJudgeIds, ...rccJudgeIds]);

      // RCCs awarded from July 2023 onwards (when the alternative champion route started)
      const rccCutoffDate = '2023-07-01';
      const qualifyingRCCs = reserveCCs.filter((a) => a.date >= rccCutoffDate);

      // Count first-place wins from results for JW and ShCEx calculation
      const firstPlaceWins = await ctx.db
        .select({
          showType: shows.showType,
          showDate: shows.startDate,
          className: classDefinitions.name,
        })
        .from(results)
        .innerJoin(entryClasses, eq(results.entryClassId, entryClasses.id))
        .innerJoin(entries, eq(entryClasses.entryId, entries.id))
        .innerJoin(shows, eq(entries.showId, shows.id))
        .innerJoin(showClasses, eq(entryClasses.showClassId, showClasses.id))
        .innerJoin(classDefinitions, eq(showClasses.classDefinitionId, classDefinitions.id))
        .where(
          and(
            eq(entries.dogId, input.dogId),
            eq(entries.status, 'confirmed'),
            isNull(entries.deletedAt),
            eq(results.placement, 1),
          )
        );

      // Junior Warrant: 25 points from firsts between 6-18 months
      // Championship show first = 3 points, Open/Premier Open show first = 1 point
      const sixMonths = new Date(dob);
      sixMonths.setMonth(sixMonths.getMonth() + 6);
      const eighteenMonths = new Date(dob);
      eighteenMonths.setMonth(eighteenMonths.getMonth() + 18);

      const jwWins = firstPlaceWins.filter((w) => {
        const showDate = new Date(w.showDate);
        return showDate >= sixMonths && showDate <= eighteenMonths;
      });
      const jwChampionshipWins = jwWins.filter((w) => w.showType === 'championship').length;
      const jwOpenWins = jwWins.filter((w) => w.showType === 'open' || w.showType === 'premier_open').length;
      const jwPoints = jwChampionshipWins * 3 + jwOpenWins * 1;

      // ShCEx: 50 points from firsts at open shows
      // Points scale: 1st in class = depends on entries (simplified: 1 point per first at open show)
      const shcexWins = firstPlaceWins.filter(
        (w) => w.showType === 'open' || w.showType === 'premier_open'
      );
      const shcexPoints = shcexWins.length; // Simplified — 1 point per first at open shows

      // Veteran Warrant: 25 points from veteran classes at open shows
      const veteranWins = firstPlaceWins.filter(
        (w) =>
          (w.showType === 'open' || w.showType === 'premier_open') &&
          w.className.toLowerCase().includes('veteran')
      );
      const veteranPoints = veteranWins.length; // 1 point per veteran class first

      const existingTitles = new Set(dog.titles.map((t) => t.title));

      const titleProgress: Array<{
        title: string;
        code: string;
        current: number;
        required: number;
        progress: number;
        detail: string;
        milestoneReached: boolean;
        proOnly?: boolean;
        routes?: Array<{
          name: string;
          current: number;
          required: number;
          progress: number;
          detail: string;
          met: boolean;
        }>;
      }> = [];

      // Champion: 3 CCs under 3 different judges
      // OR (from July 2023): 2 CCs + 5 RCCs under at least 7 different judges
      if (!existingTitles.has('ch')) {
        const classicProgress = Math.min(ccAchievements.length / 3, 1);
        const altCCProgress = Math.min(ccAchievements.length / 2, 1);
        const altRCCProgress = Math.min(qualifyingRCCs.length / 5, 1);
        const altJudgeProgress = Math.min(allCcRccJudgeIds.size / 7, 1);
        const altOverallProgress = Math.min((altCCProgress + altRCCProgress + altJudgeProgress) / 3, 1);

        const classicMet = ccAchievements.length >= 3 && ccJudgeIds.size >= 3;
        const altMet = ccAchievements.length >= 2 && qualifyingRCCs.length >= 5 && allCcRccJudgeIds.size >= 7;

        titleProgress.push({
          title: 'Champion (Ch)',
          code: 'ch',
          current: ccAchievements.length,
          required: 3,
          progress: Math.max(classicProgress, altOverallProgress),
          detail: `${ccAchievements.length}/3 CCs${ccJudgeIds.size > 0 ? ` (${ccJudgeIds.size} judge${ccJudgeIds.size !== 1 ? 's' : ''})` : ''}`,
          milestoneReached: classicMet || altMet,
          routes: isPro
            ? [
                {
                  name: 'Classic Route',
                  current: ccAchievements.length,
                  required: 3,
                  progress: classicProgress,
                  detail: `${ccAchievements.length}/3 CCs under ${ccJudgeIds.size}/3 judges`,
                  met: classicMet,
                },
                {
                  name: 'Alternative Route (from July 2023)',
                  current: ccAchievements.length + qualifyingRCCs.length,
                  required: 7,
                  progress: altOverallProgress,
                  detail: `${ccAchievements.length}/2 CCs + ${qualifyingRCCs.length}/5 RCCs under ${allCcRccJudgeIds.size}/7 judges`,
                  met: altMet,
                },
              ]
            : undefined,
        });
      }

      // Show Champion: 3 CCs + qualifying field (gundogs only)
      const isGundog = dog.breed.group?.name === 'Gundog';
      if (!existingTitles.has('sh_ch') && isGundog) {
        titleProgress.push({
          title: 'Show Champion (Sh Ch)',
          code: 'sh_ch',
          current: ccAchievements.length,
          required: 3,
          progress: Math.min(ccAchievements.length / 3, 1),
          detail: `${ccAchievements.length}/3 CCs (+ qualifying field trial win required)`,
          milestoneReached: false,
        });
      }

      // Junior Warrant: 25 points between 6-18 months
      if (ageMonths < 18 || jwPoints > 0) {
        const isStillEligible = ageMonths < 18;
        const daysRemaining = isStillEligible
          ? Math.ceil((eighteenMonths.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        let detail = isStillEligible
          ? `${jwPoints}/25 points (${daysRemaining} days remaining)`
          : `${jwPoints}/25 points (age limit reached)`;

        if (isPro && isStillEligible) {
          detail = `${jwPoints}/25 points · ${jwChampionshipWins} champ (×3) + ${jwOpenWins} open (×1) · ${daysRemaining} days left`;
        }

        titleProgress.push({
          title: 'Junior Warrant (JW)',
          code: 'jw',
          current: jwPoints,
          required: 25,
          progress: Math.min(jwPoints / 25, 1),
          detail,
          milestoneReached: jwPoints >= 25,
        });
      }

      // Pro-only: Show Certificate of Excellence (ShCEx)
      if (isPro && !existingTitles.has('sh_ch')) {
        titleProgress.push({
          title: 'Show Certificate of Excellence (ShCEx)',
          code: 'shcex',
          current: shcexPoints,
          required: 50,
          progress: Math.min(shcexPoints / 50, 1),
          detail: `${shcexPoints}/50 points from ${shcexWins.length} first${shcexWins.length !== 1 ? 's' : ''} at open shows`,
          milestoneReached: shcexPoints >= 50,
          proOnly: true,
        });
      }

      // Pro-only: Veteran Warrant
      if (isPro && ageMonths >= 84) {
        // Dogs 7+ years old
        titleProgress.push({
          title: 'Veteran Warrant (VW)',
          code: 'vw',
          current: veteranPoints,
          required: 25,
          progress: Math.min(veteranPoints / 25, 1),
          detail: `${veteranPoints}/25 points from ${veteranWins.length} veteran class first${veteranWins.length !== 1 ? 's' : ''} at open shows`,
          milestoneReached: veteranPoints >= 25,
          proOnly: true,
        });
      }

      return {
        dogName: dog.registeredName,
        existingTitles: dog.titles,
        titleProgress,
        isPro,
        stats: {
          ccs: ccAchievements.length,
          reserveCCs: reserveCCs.length,
          bobs: bobs.length,
          totalFirsts: firstPlaceWins.length,
          jwPoints,
          shcexPoints: isPro ? shcexPoints : undefined,
          veteranPoints: isPro && ageMonths >= 84 ? veteranPoints : undefined,
          uniqueJudges: isPro ? ccJudgeIds.size : undefined,
        },
        disclaimer: 'Progress shown is based on results recorded in Remi only. Wins at shows not using Remi are not included.',
      };
    }),

  // ── Show Results (placings & critiques) ─────────────────
  getShowResults: protectedProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Run entries fetch and dog breedId lookup in parallel
      const [dogEntries, dog] = await Promise.all([
        ctx.db.query.entries.findMany({
          where: and(
            eq(entries.dogId, input.dogId),
            eq(entries.status, 'confirmed'),
            isNull(entries.deletedAt),
          ),
          with: {
            show: { columns: { id: true, name: true, startDate: true } },
            entryClasses: {
              with: {
                showClass: {
                  with: {
                    classDefinition: { columns: { name: true, sex: true } },
                  },
                },
                result: true,
              },
            },
          },
        }),
        ctx.db.query.dogs.findFirst({
          where: eq(dogs.id, input.dogId),
          columns: { breedId: true },
        }),
      ]);

      // Build judge lookup map upfront (before flattening)
      const showIds = [...new Set(dogEntries.map((e) => e.show.id))];
      let judgeByShow = new Map<string, string>();

      if (dog?.breedId && showIds.length > 0) {
        const assignments = await ctx.db
          .select({
            showId: judgeAssignments.showId,
            judgeName: judges.name,
          })
          .from(judgeAssignments)
          .innerJoin(judges, eq(judgeAssignments.judgeId, judges.id))
          .where(
            and(
              inArray(judgeAssignments.showId, showIds),
              eq(judgeAssignments.breedId, dog.breedId),
            )
          );

        judgeByShow = new Map(
          assignments.map((a) => [a.showId, a.judgeName])
        );
      }

      // Flatten to results with placements in a single pass
      const flatResults = dogEntries.flatMap((entry) =>
        entry.entryClasses
          .filter((ec) => ec.result?.placement)
          .map((ec) => ({
            id: ec.id,
            showId: entry.show.id,
            showName: entry.show.name,
            showDate: entry.show.startDate,
            className: ec.showClass.classDefinition.name,
            classNumber: ec.showClass.classNumber,
            sex: ec.showClass.classDefinition.sex ?? '',
            placement: ec.result!.placement!,
            specialAward: ec.result!.specialAward,
            critiqueText: ec.result!.critiqueText,
            judgeName: judgeByShow.get(entry.show.id) ?? null,
          }))
      );

      // Sort by show date descending, then class number
      flatResults.sort((a, b) => {
        const dateCompare = b.showDate.localeCompare(a.showDate);
        if (dateCompare !== 0) return dateCompare;
        return a.classNumber - b.classNumber;
      });

      return flatResults;
    }),

  // ── Dog Photos ────────────────────────────────────────

  listPhotos: protectedProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.dogPhotos.findMany({
        where: eq(dogPhotos.dogId, input.dogId),
        orderBy: [desc(dogPhotos.isPrimary), asc(dogPhotos.sortOrder), asc(dogPhotos.createdAt)],
      });
    }),

  getPublicPhotos: publicProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.dogPhotos.findMany({
        where: eq(dogPhotos.dogId, input.dogId),
        orderBy: [desc(dogPhotos.isPrimary), asc(dogPhotos.sortOrder), asc(dogPhotos.createdAt)],
      });
    }),

  setPrimaryPhoto: protectedProcedure
    .input(z.object({ photoId: z.string().uuid(), dogId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.dogId), eq(dogs.ownerId, ctx.session.user.id), isNull(dogs.deletedAt)),
      });
      if (!dog) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dog not found' });

      // Clear existing primary
      await ctx.db
        .update(dogPhotos)
        .set({ isPrimary: false })
        .where(and(eq(dogPhotos.dogId, input.dogId), eq(dogPhotos.isPrimary, true)));

      // Set new primary
      await ctx.db
        .update(dogPhotos)
        .set({ isPrimary: true })
        .where(eq(dogPhotos.id, input.photoId));

      return { success: true };
    }),

  updatePhotoCaption: protectedProcedure
    .input(z.object({
      photoId: z.string().uuid(),
      dogId: z.string().uuid(),
      caption: z.string().max(200).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.dogId), eq(dogs.ownerId, ctx.session.user.id), isNull(dogs.deletedAt)),
      });
      if (!dog) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dog not found' });

      await ctx.db
        .update(dogPhotos)
        .set({ caption: input.caption })
        .where(eq(dogPhotos.id, input.photoId));

      return { success: true };
    }),

  // ── Self-Reported Results (external shows) ────────────────
  addExternalResult: protectedProcedure
    .input(
      z.object({
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
          'class_placement',
          'junior_warrant',
          'stud_book',
          'dog_cc',
          'reserve_dog_cc',
          'bitch_cc',
          'reserve_bitch_cc',
          'best_puppy_dog',
          'best_puppy_bitch',
        ]),
        date: z.string(), // YYYY-MM-DD
        showName: z.string().min(1).max(255),
        judgeName: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.dogId), isNull(dogs.deletedAt)),
      });

      if (!dog || dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      // Store showName and judgeName in the details jsonb field
      // No showId — marks this as an external/self-reported result
      const [achievement] = await ctx.db
        .insert(achievements)
        .values({
          dogId: input.dogId,
          type: input.type,
          date: input.date,
          showId: null,
          details: {
            showName: input.showName,
            judgeName: input.judgeName ?? null,
            selfReported: true,
          },
        })
        .returning();

      return achievement!;
    }),

  removeExternalResult: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const achievement = await ctx.db.query.achievements.findFirst({
        where: eq(achievements.id, input.id),
        with: { dog: true },
      });

      if (!achievement || achievement.dog.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your dog' });
      }

      // Only allow deleting self-reported results (no showId)
      if (achievement.showId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove results recorded by show officials',
        });
      }

      await ctx.db.delete(achievements).where(eq(achievements.id, input.id));
      return { success: true };
    }),

  deletePhoto: protectedProcedure
    .input(z.object({ photoId: z.string().uuid(), dogId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const dog = await ctx.db.query.dogs.findFirst({
        where: and(eq(dogs.id, input.dogId), eq(dogs.ownerId, ctx.session.user.id), isNull(dogs.deletedAt)),
      });
      if (!dog) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dog not found' });

      const photo = await ctx.db.query.dogPhotos.findFirst({
        where: and(eq(dogPhotos.id, input.photoId), eq(dogPhotos.dogId, input.dogId)),
      });
      if (!photo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Photo not found' });

      // Delete from R2
      try {
        await deleteFromR2(photo.storageKey);
      } catch (e) {
        console.error('Failed to delete from R2:', e);
      }

      // Delete from DB
      await ctx.db.delete(dogPhotos).where(eq(dogPhotos.id, input.photoId));

      return { success: true };
    }),

  // ── Limited show eligibility check (2026 RKC rule) ──────
  checkLimitedShowEligibility: protectedProcedure
    .input(z.object({ dogId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Count CCs (any type: cc, dog_cc, bitch_cc)
      const ccTypes = ['cc', 'dog_cc', 'bitch_cc'] as const;
      const ccRows = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(achievements)
        .where(
          and(
            eq(achievements.dogId, input.dogId),
            inArray(achievements.type, [...ccTypes])
          )
        );
      const ccCount = ccRows[0]?.count ?? 0;

      // Count RCCs with distinct judges (reserve_cc, reserve_dog_cc, reserve_bitch_cc)
      const rccTypes = ['reserve_cc', 'reserve_dog_cc', 'reserve_bitch_cc'] as const;
      const rccRows = await ctx.db
        .select({
          judgeId: achievements.judgeId,
        })
        .from(achievements)
        .where(
          and(
            eq(achievements.dogId, input.dogId),
            inArray(achievements.type, [...rccTypes])
          )
        );
      // Count distinct judges (null judgeId counts as one)
      const distinctJudges = new Set(rccRows.map((r) => r.judgeId ?? 'unknown'));
      const rccDistinctJudgeCount = distinctJudges.size;

      return {
        hasCC: ccCount > 0,
        ccCount,
        rccDistinctJudgeCount,
        rccTotal: rccRows.length,
        ineligible: ccCount > 0 || rccDistinctJudgeCount >= 5,
        reason: ccCount > 0
          ? 'This dog has won a CC and is ineligible for Limited shows'
          : rccDistinctJudgeCount >= 5
            ? 'This dog has 5+ RCCs under different judges and is ineligible for Limited shows (2026 rule)'
            : null,
      };
    }),
});
