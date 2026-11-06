/**
 * Recording a show's top awards — Best Dog, Best Bitch, the regional Most
 * Promising Dog/Bitch, a CC, Best of Breed, Best in Show … — has ONE owner:
 * `recordTopAward`. The secretary results page (`secretary.recordAchievement`)
 * and the steward ringside page (`steward.recordAchievement`) both call it and
 * keep only their own access and lock checks.
 *
 * It owns four rules that used to be written twice and disagreed:
 *
 *  - the dog must be entered (confirmed) in the show;
 *  - the award's sex rule — `awardFilter(type).sex`, the same classification
 *    the pickers filter candidates with (the routers each had their own
 *    DOG_ONLY/BITCH_ONLY copy, which never learned Best Dog/Bitch);
 *  - which previous holder the new one replaces — `awardHolderScope`: one per
 *    show, per breed group or per breed, or (placements) per dog. The
 *    secretary's copy was a hard-coded "unique" list from before configurable
 *    Best Awards, so correcting Best Dog / Most Promising / Best Veteran in
 *    Show from A to B left both dogs holding it; the steward's copy removed
 *    every holder in the show, so on a multi-breed show breed Y's Best of
 *    Breed wiped breed X's (bug hunt, 22 Sept 2026);
 *  - `publishedAt` — NULL while the steward releases awards one by one on the
 *    day, but set at once if the show's results are already published: after
 *    Publish Results nothing else can publish it (publishAchievement is
 *    locked and publishResults refuses to run twice), so a correction used to
 *    stay invisible and the public page kept the old winner — or, for a CC,
 *    showed none.
 *
 * Self-reported results on a dog's own profile (`dogs.addExternalResult`) are
 * not show awards — no show, no holder rule — and stay in the dogs router.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { achievements, breeds, dogs, entries, shows } from '@/server/db/schema';
import { awardFilter, awardHolderScope } from '@/lib/top-awards';
import type { AchievementType } from '@/lib/placements';
import { deriveTopAwardJudge } from './derive-award-judge';

export type RecordTopAwardInput = {
  showId: string;
  dogId: string;
  type: AchievementType;
  /** YYYY-MM-DD — the show date the award was made on. */
  date: string;
};

export async function recordTopAward(db: Database, input: RecordTopAwardInput) {
  const dogEntry = await db.query.entries.findFirst({
    where: and(
      eq(entries.showId, input.showId),
      eq(entries.dogId, input.dogId),
      eq(entries.status, 'confirmed'),
      isNull(entries.deletedAt),
    ),
    columns: { id: true },
  });
  if (!dogEntry) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This dog is not entered in this show' });
  }

  const dog = await db.query.dogs.findFirst({
    where: eq(dogs.id, input.dogId),
    columns: { sex: true, breedId: true },
    with: { breed: { columns: { groupId: true } } },
  });
  if (!dog) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This dog is not entered in this show' });
  }

  const requiredSex = awardFilter(input.type).sex;
  if (requiredSex && dog.sex !== requiredSex) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `This award is for ${requiredSex === 'dog' ? 'dogs' : 'bitches'} only`,
    });
  }

  // The judge who made the award, derived from the show's breed-level judge
  // assignments, so a CC credits the right judge toward the Champion "3
  // different judges" rule (Mandy 2026-07-09).
  const judgeId = await deriveTopAwardJudge(db, input.showId, input.type);

  return db.transaction(async (tx) => {
    // Two people can record the same award at once (steward ringside,
    // secretary at the desk). Without this lock each transaction's delete
    // misses the other's uncommitted insert and both dogs end up holding it.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`top-award:${input.showId}:${input.type}`}))`,
    );

    const show = await tx.query.shows.findFirst({
      where: eq(shows.id, input.showId),
      columns: { showScope: true, resultsPublishedAt: true },
    });
    if (!show) throw new TRPCError({ code: 'NOT_FOUND', message: 'Show not found' });

    const scope = awardHolderScope(input.type, show.showScope);
    const inScope =
      scope === 'dog'
        ? eq(achievements.dogId, input.dogId)
        : scope === 'breed'
          ? inArray(
              achievements.dogId,
              tx.select({ id: dogs.id }).from(dogs).where(eq(dogs.breedId, dog.breedId)),
            )
          : scope === 'group'
            ? inArray(
                achievements.dogId,
                tx
                  .select({ id: dogs.id })
                  .from(dogs)
                  .innerJoin(breeds, eq(breeds.id, dogs.breedId))
                  .where(eq(breeds.groupId, dog.breed.groupId)),
              )
            : undefined; // 'show' — every holder at this show

    await tx
      .delete(achievements)
      .where(and(eq(achievements.showId, input.showId), eq(achievements.type, input.type), inScope));

    const [achievement] = await tx
      .insert(achievements)
      .values({
        showId: input.showId,
        dogId: input.dogId,
        type: input.type,
        date: input.date,
        judgeId,
        publishedAt: show.resultsPublishedAt ? new Date() : null,
      })
      .returning();
    return achievement!;
  });
}

/**
 * Remove ONE recorded holder of a show's award — by row id (secretary page) or
 * by dog + type (steward page). Deliberately never the award's whole scope:
 * the steward picker sends "remove the old holder" and "record the new one"
 * together, un-awaited, so a scope-wide clear could land after the record and
 * delete the dog just chosen. Replacing a holder is `recordTopAward`'s job.
 */
export async function removeTopAwardHolder(
  db: Database,
  holder:
    | { showId: string; achievementId: string }
    | { showId: string; dogId: string; type: AchievementType },
): Promise<void> {
  await db
    .delete(achievements)
    .where(
      'achievementId' in holder
        ? and(eq(achievements.id, holder.achievementId), eq(achievements.showId, holder.showId))
        : and(
            eq(achievements.showId, holder.showId),
            eq(achievements.dogId, holder.dogId),
            eq(achievements.type, holder.type),
          ),
    );
}
