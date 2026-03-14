import {
  sql,
  eq,
  and,
  gte,
  lte,
  desc,
  asc,
  isNull,
  inArray,
  isNotNull,
  notInArray,
} from 'drizzle-orm';
import { protectedProcedure } from '../procedures';
import { createTRPCRouter } from '../init';
import {
  dogs,
  breeds,
  entries,
  entryClasses,
  showClasses,
  classDefinitions,
  shows,
  venues,
  results,
  achievements,
  dogTitles,
  dogPhotos,
  judgeAssignments,
  judges,
  dogFollows,
  dogTimelinePosts,
} from '@/server/db/schema';

export const dashboardRouter = createTRPCRouter({
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]!;
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0]!;
    const ninetyDaysFromNow = new Date(
      now.getTime() + 90 * 24 * 60 * 60 * 1000
    );
    const ninetyDaysFromNowStr = ninetyDaysFromNow.toISOString().split('T')[0]!;
    const sevenDaysFromNow = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000
    );

    // ── Step 1: Get the user's dogs and breeds (needed by most queries) ──
    const userDogs = await ctx.db
      .select({
        id: dogs.id,
        registeredName: dogs.registeredName,
        breedId: dogs.breedId,
      })
      .from(dogs)
      .where(and(eq(dogs.ownerId, userId), isNull(dogs.deletedAt)));

    const userDogIds = userDogs.map((d) => d.id);
    const userBreedIds = [...new Set(userDogs.map((d) => d.breedId))];

    // If the user has no dogs, return early with empty data
    if (userDogIds.length === 0) {
      return {
        nextShow: null,
        deadlineAlerts: [],
        recentResults: [],
        ccProgress: [],
        judgeIntel: [],
        feedDigest: { count: 0 },
        recommendedShows: [],
      };
    }

    // ── Step 2: Run all independent queries in parallel ──────────────
    const [
      // For nextShow + deadlineAlerts (pending entries)
      userEntries,
      // For recentResults
      recentEntries,
      // For ccProgress: achievements
      allAchievements,
      // For ccProgress: titles
      allTitles,
      // For ccProgress: primary photos
      primaryPhotos,
      // For ccProgress: future entries (to know which dogs to include)
      futureEntryDogIds,
      // For deadlineAlerts: shows closing soon matching user's breeds
      closingSoonShows,
      // For judgeIntel: judge assignments for user's breeds in next 90 days
      upcomingJudgeAssignments,
      // For feedDigest: count unread feed items
      feedCount,
      // For recommendedShows
      recommendedShowRows,
    ] = await Promise.all([
      // ── userEntries: all confirmed/pending entries with show + classes ──
      ctx.db.query.entries.findMany({
        where: and(
          eq(entries.exhibitorId, userId),
          isNull(entries.deletedAt),
          inArray(entries.status, ['confirmed', 'pending'])
        ),
        with: {
          show: {
            with: { venue: true },
          },
          dog: {
            columns: { id: true, registeredName: true },
          },
          entryClasses: {
            with: {
              showClass: {
                with: { classDefinition: true },
              },
            },
          },
        },
      }),

      // ── recentEntries: confirmed entries from shows in last 60 days with results ──
      ctx.db.query.entries.findMany({
        where: and(
          eq(entries.exhibitorId, userId),
          eq(entries.status, 'confirmed'),
          isNull(entries.deletedAt)
        ),
        with: {
          show: true,
          dog: {
            columns: { id: true, registeredName: true },
          },
          entryClasses: {
            with: {
              showClass: {
                with: { classDefinition: true },
              },
              result: true,
            },
          },
        },
      }),

      // ── achievements for all user's dogs ──
      userDogIds.length > 0
        ? ctx.db
            .select({
              id: achievements.id,
              dogId: achievements.dogId,
              type: achievements.type,
              judgeId: achievements.judgeId,
              date: achievements.date,
            })
            .from(achievements)
            .where(inArray(achievements.dogId, userDogIds))
        : Promise.resolve([]),

      // ── titles for all user's dogs ──
      userDogIds.length > 0
        ? ctx.db
            .select({
              dogId: dogTitles.dogId,
              title: dogTitles.title,
            })
            .from(dogTitles)
            .where(inArray(dogTitles.dogId, userDogIds))
        : Promise.resolve([]),

      // ── primary photos for all user's dogs ──
      userDogIds.length > 0
        ? ctx.db
            .select({
              dogId: dogPhotos.dogId,
              url: dogPhotos.url,
            })
            .from(dogPhotos)
            .where(
              and(
                inArray(dogPhotos.dogId, userDogIds),
                eq(dogPhotos.isPrimary, true)
              )
            )
        : Promise.resolve([]),

      // ── dog IDs that have future entries ──
      userDogIds.length > 0
        ? ctx.db
            .select({ dogId: entries.dogId })
            .from(entries)
            .innerJoin(shows, eq(shows.id, entries.showId))
            .where(
              and(
                inArray(entries.dogId, userDogIds),
                eq(entries.status, 'confirmed'),
                isNull(entries.deletedAt),
                gte(shows.startDate, todayStr)
              )
            )
        : Promise.resolve([]),

      // ── shows closing soon that match user's breeds (and user hasn't entered) ──
      userBreedIds.length > 0
        ? ctx.db
            .select({
              showId: shows.id,
              showName: shows.name,
              showSlug: shows.slug,
              startDate: shows.startDate,
              entryCloseDate: shows.entryCloseDate,
              breedId: showClasses.breedId,
            })
            .from(showClasses)
            .innerJoin(shows, eq(shows.id, showClasses.showId))
            .where(
              and(
                eq(shows.status, 'entries_open'),
                inArray(showClasses.breedId, userBreedIds),
                isNotNull(shows.entryCloseDate),
                gte(shows.entryCloseDate, now),
                lte(shows.entryCloseDate, sevenDaysFromNow)
              )
            )
        : Promise.resolve([]),

      // ── judge assignments for user's breeds in next 90 days ──
      userBreedIds.length > 0
        ? ctx.db
            .select({
              showId: shows.id,
              showName: shows.name,
              showSlug: shows.slug,
              showDate: shows.startDate,
              judgeId: judgeAssignments.judgeId,
              judgeName: judges.name,
              breedId: judgeAssignments.breedId,
              breedName: breeds.name,
            })
            .from(judgeAssignments)
            .innerJoin(shows, eq(shows.id, judgeAssignments.showId))
            .innerJoin(judges, eq(judges.id, judgeAssignments.judgeId))
            .leftJoin(breeds, eq(breeds.id, judgeAssignments.breedId))
            .where(
              and(
                inArray(judgeAssignments.breedId, userBreedIds),
                gte(shows.startDate, todayStr),
                lte(shows.startDate, ninetyDaysFromNowStr),
                notInArray(shows.status, ['cancelled', 'completed', 'draft'])
              )
            )
            .orderBy(asc(shows.startDate))
            .limit(10)
        : Promise.resolve([]),

      // ── feed digest: count of recent timeline posts from followed dogs ──
      (async () => {
        const [followedDogs, ownDogs] = await Promise.all([
          ctx.db
            .select({ dogId: dogFollows.dogId })
            .from(dogFollows)
            .where(eq(dogFollows.userId, userId)),
          Promise.resolve(userDogIds),
        ]);

        const allDogIds = [
          ...new Set([
            ...followedDogs.map((f) => f.dogId),
            ...ownDogs,
          ]),
        ];

        if (allDogIds.length === 0) return 0;

        const sevenDaysAgo = new Date(
          now.getTime() - 7 * 24 * 60 * 60 * 1000
        );
        const [countRow] = await ctx.db
          .select({ v: sql<number>`count(*)::int` })
          .from(dogTimelinePosts)
          .where(
            and(
              inArray(dogTimelinePosts.dogId, allDogIds),
              gte(dogTimelinePosts.createdAt, sevenDaysAgo)
            )
          );
        return countRow?.v ?? 0;
      })(),

      // ── recommendedShows: entries_open shows with matching breeds, not yet entered ──
      userBreedIds.length > 0
        ? ctx.db
            .select({
              showId: shows.id,
              showName: shows.name,
              showSlug: shows.slug,
              startDate: shows.startDate,
              entryCloseDate: shows.entryCloseDate,
              venueName: venues.name,
              breedId: showClasses.breedId,
              breedName: breeds.name,
            })
            .from(showClasses)
            .innerJoin(shows, eq(shows.id, showClasses.showId))
            .leftJoin(venues, eq(venues.id, shows.venueId))
            .leftJoin(breeds, eq(breeds.id, showClasses.breedId))
            .where(
              and(
                eq(shows.status, 'entries_open'),
                inArray(showClasses.breedId, userBreedIds),
                gte(shows.startDate, todayStr)
              )
            )
            .orderBy(asc(shows.startDate))
        : Promise.resolve([]),
    ]);

    // ── Build: nextShow ──────────────────────────────────────────────
    const confirmedFutureEntries = userEntries
      .filter(
        (e) =>
          e.status === 'confirmed' && e.show.startDate >= todayStr
      )
      .sort((a, b) => a.show.startDate.localeCompare(b.show.startDate));

    const nextEntry = confirmedFutureEntries[0] ?? null;
    const nextShow = nextEntry
      ? {
          showId: nextEntry.show.id,
          showName: nextEntry.show.name,
          showSlug: nextEntry.show.slug,
          startDate: nextEntry.show.startDate,
          venueName: nextEntry.show.venue?.name ?? null,
          dogName: nextEntry.dog?.registeredName ?? null,
          classes: nextEntry.entryClasses.map((ec) => ({
            className: ec.showClass.classDefinition.name,
            classNumber: ec.showClass.classNumber,
          })),
        }
      : null;

    // ── Build: deadlineAlerts ────────────────────────────────────────
    const alerts: Array<{
      type: 'closing_soon' | 'pending_payment';
      message: string;
      showId: string;
      showName: string;
      showSlug: string | null;
      entryCloseDate?: Date | null;
    }> = [];

    // Shows where user's entered show IDs (to exclude from closing_soon)
    const enteredShowIds = new Set(userEntries.map((e) => e.show.id));

    // Closing soon shows (deduplicate by showId)
    const closingSoonByShow = new Map<
      string,
      (typeof closingSoonShows)[0]
    >();
    for (const row of closingSoonShows) {
      if (!enteredShowIds.has(row.showId)) {
        closingSoonByShow.set(row.showId, row);
      }
    }
    for (const show of closingSoonByShow.values()) {
      alerts.push({
        type: 'closing_soon',
        message: `Entries close soon for ${show.showName}`,
        showId: show.showId,
        showName: show.showName,
        showSlug: show.showSlug,
        entryCloseDate: show.entryCloseDate,
      });
    }

    // Pending (unpaid) entries
    const pendingEntries = userEntries.filter((e) => e.status === 'pending');
    for (const entry of pendingEntries) {
      alerts.push({
        type: 'pending_payment',
        message: `Unpaid entry for ${entry.show.name}${entry.dog ? ` (${entry.dog.registeredName})` : ''}`,
        showId: entry.show.id,
        showName: entry.show.name,
        showSlug: entry.show.slug,
      });
    }

    const deadlineAlerts = alerts.slice(0, 5);

    // ── Build: recentResults ─────────────────────────────────────────
    const photoMap = new Map<string, string>();
    for (const photo of primaryPhotos) {
      photoMap.set(photo.dogId, photo.url);
    }

    const recentResults = recentEntries
      .filter(
        (e) =>
          e.show.startDate >= sixtyDaysAgoStr &&
          e.show.startDate <= todayStr &&
          e.entryClasses.some((ec) => ec.result)
      )
      .map((entry) => {
        const placements = entry.entryClasses
          .filter((ec) => ec.result)
          .map((ec) => ({
            className: ec.showClass.classDefinition.name,
            placement: ec.result?.placement ?? null,
            specialAward: ec.result?.specialAward ?? null,
          }));

        // Check if a CC was awarded for this dog at this show
        const hasCc = allAchievements.some(
          (a) =>
            a.dogId === entry.dogId &&
            (a.type === 'cc' ||
              a.type === 'dog_cc' ||
              a.type === 'bitch_cc') &&
            a.date === entry.show.startDate
        );

        return {
          dogId: entry.dog?.id ?? null,
          dogName: entry.dog?.registeredName ?? null,
          dogPhotoUrl: entry.dog ? (photoMap.get(entry.dog.id) ?? null) : null,
          showName: entry.show.name,
          showDate: entry.show.startDate,
          placements,
          ccAwarded: hasCc,
        };
      })
      .sort((a, b) => b.showDate.localeCompare(a.showDate))
      .slice(0, 5);

    // ── Build: ccProgress ────────────────────────────────────────────
    const futureDogIdSet = new Set(
      futureEntryDogIds
        .map((r) => r.dogId)
        .filter((id): id is string => id !== null)
    );

    // Group achievements by dog
    const achievementsByDog = new Map<
      string,
      typeof allAchievements
    >();
    for (const a of allAchievements) {
      const list = achievementsByDog.get(a.dogId) ?? [];
      list.push(a);
      achievementsByDog.set(a.dogId, list);
    }

    // Group titles by dog
    const titlesByDog = new Map<string, typeof allTitles>();
    for (const t of allTitles) {
      const list = titlesByDog.get(t.dogId) ?? [];
      list.push(t);
      titlesByDog.set(t.dogId, list);
    }

    // Breed name lookup
    const breedNameMap = new Map<string, string>();
    // We need to fetch breed names for the user's breeds
    if (userBreedIds.length > 0) {
      const breedRows = await ctx.db
        .select({ id: breeds.id, name: breeds.name })
        .from(breeds)
        .where(inArray(breeds.id, userBreedIds));
      for (const b of breedRows) {
        breedNameMap.set(b.id, b.name);
      }
    }

    const ccProgress = userDogs
      .filter((dog) => {
        const hasAchievements = achievementsByDog.has(dog.id);
        const hasFutureEntry = futureDogIdSet.has(dog.id);
        return hasAchievements || hasFutureEntry;
      })
      .map((dog) => {
        const dogAchievements = achievementsByDog.get(dog.id) ?? [];
        const dogTitlesList = titlesByDog.get(dog.id) ?? [];

        const ccCount = dogAchievements.filter(
          (a) =>
            a.type === 'cc' ||
            a.type === 'dog_cc' ||
            a.type === 'bitch_cc'
        ).length;

        const rccCount = dogAchievements.filter(
          (a) =>
            a.type === 'reserve_cc' ||
            a.type === 'reserve_dog_cc' ||
            a.type === 'reserve_bitch_cc'
        ).length;

        // Distinct judges who awarded CCs (for the 3-different-judges rule)
        const ccJudgeIds = new Set(
          dogAchievements
            .filter(
              (a) =>
                (a.type === 'cc' ||
                  a.type === 'dog_cc' ||
                  a.type === 'bitch_cc') &&
                a.judgeId
            )
            .map((a) => a.judgeId!)
        );

        const isChampion = dogTitlesList.some((t) => t.title === 'ch');

        return {
          dogId: dog.id,
          dogName: dog.registeredName,
          breedName: breedNameMap.get(dog.breedId) ?? null,
          photoUrl: photoMap.get(dog.id) ?? null,
          ccCount,
          rccCount,
          distinctJudgeCount: ccJudgeIds.size,
          isChampion,
        };
      });

    // ── Build: judgeIntel ────────────────────────────────────────────
    const judgeIntel = upcomingJudgeAssignments.map((row) => ({
      showId: row.showId,
      showName: row.showName,
      showSlug: row.showSlug,
      showDate: row.showDate,
      judgeName: row.judgeName,
      breedName: row.breedName,
      alreadyEntered: enteredShowIds.has(row.showId),
    }));

    // ── Build: feedDigest ────────────────────────────────────────────
    const feedDigest = { count: feedCount as number };

    // ── Build: recommendedShows ──────────────────────────────────────
    // Deduplicate by show, collecting all matching breed names
    const recommendedShowMap = new Map<
      string,
      {
        showId: string;
        showName: string;
        showSlug: string | null;
        startDate: string;
        entryCloseDate: Date | null;
        venueName: string | null;
        breedNames: Set<string>;
      }
    >();

    for (const row of recommendedShowRows) {
      // Skip shows the user is already entered in
      if (enteredShowIds.has(row.showId)) continue;

      const existing = recommendedShowMap.get(row.showId);
      if (existing) {
        if (row.breedName) existing.breedNames.add(row.breedName);
      } else {
        recommendedShowMap.set(row.showId, {
          showId: row.showId,
          showName: row.showName,
          showSlug: row.showSlug,
          startDate: row.startDate,
          entryCloseDate: row.entryCloseDate,
          venueName: row.venueName,
          breedNames: new Set(row.breedName ? [row.breedName] : []),
        });
      }
    }

    const recommendedShows = [...recommendedShowMap.values()]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 5)
      .map((s) => ({
        showId: s.showId,
        showName: s.showName,
        showSlug: s.showSlug,
        startDate: s.startDate,
        entryCloseDate: s.entryCloseDate,
        venueName: s.venueName,
        breedNames: [...s.breedNames],
      }));

    return {
      nextShow,
      deadlineAlerts,
      recentResults,
      ccProgress,
      judgeIntel,
      feedDigest,
      recommendedShows,
    };
  }),
});
