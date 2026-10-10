import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { dogs, dogOwners } from '@/server/db/schema';

/**
 * The SINGLE source of truth for "does this user have day-to-day rights on
 * this dog" — view / edit / enter shows / upload photos. True when the user
 * is the dog's account holder (`dogs.owner_id`) OR is linked as a co-owner
 * via a `dog_owners` row whose `user_id` matches.
 *
 * Rafaye Kanto incident, 2026-08-12: the dog's `dogs.owner_id` was John's
 * account, Rachel was properly linked via `dog_owners.user_id` on the same
 * dog — and every gate in the app checked `dogs.owner_id` alone, so Rachel
 * got "you do not own this dog" everywhere and the dog didn't appear in her
 * My Dogs. Founders' ruling: a linked co-owner gets the SAME day-to-day
 * rights as the account holder. Every gate below must go through this file
 * — no call site should repeat `eq(dogs.ownerId, userId)` inline.
 *
 * Deliberately NOT for destructive / account-level actions — deleting the
 * dog, transferring `owner_id`, or anything billing-adjacent stays gated on
 * `eq(dogs.ownerId, userId)` alone (see `dogs.delete` in the dogs router).
 *
 * Use this as a where-fragment: combine with your own
 * `and(eq(dogs.id, ...), isNull(dogs.deletedAt), ...)` as needed — it only
 * expresses the ownership OR-condition, for both single-dog lookups and
 * list/inArray queries.
 */
export function dogAccessCondition(db: Database, userId: string) {
  return or(
    eq(dogs.ownerId, userId),
    inArray(
      dogs.id,
      db
        .select({ id: dogOwners.dogId })
        .from(dogOwners)
        .where(eq(dogOwners.userId, userId)),
    ),
  );
}

/**
 * Boolean check for call sites that fetched a dog (or a row related to one)
 * some other way and just need a yes/no answer for a specific dogId.
 * Excludes soft-deleted dogs.
 */
export async function userMayActOnDog(
  db: Database,
  userId: string,
  dogId: string,
): Promise<boolean> {
  const row = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, dogId), isNull(dogs.deletedAt), dogAccessCondition(db, userId)),
    columns: { id: true },
  });
  return !!row;
}

/**
 * Pure predicate for a dog row that already has its `owners` relation
 * loaded (e.g. `with: { owners: true }`) — avoids a second DB round trip.
 * Same rule as `dogAccessCondition`: account holder OR linked co-owner.
 */
export function dogRowGrantsAccess(
  dog: { ownerId: string; owners?: Array<{ userId: string | null }> },
  userId: string,
): boolean {
  return dog.ownerId === userId || !!dog.owners?.some((o) => o.userId === userId);
}
