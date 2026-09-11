/**
 * The RKC registration-number clash rule — kc_reg_number is UNIQUE across
 * ALL dogs on ALL accounts, so any write path that sets it can collide.
 *
 * This used to be written twice with different wording and different case
 * handling (`dogs.create`, `dogs.update`), and was MISSING entirely from a
 * third (`secretary.registerDogForExhibitor`), which let a raw Postgres
 * unique-violation reach the client — the exact failure `update`'s guard was
 * added to stop (Rebecca Landgren, Mandy 2026-08-22).
 *
 * It was also wrong in a new way `update`'s guard never anticipated: a
 * clash can be a dog on SOMEONE ELSE'S account. Belinda Webb signed into a
 * second account she'd accidentally created and tried to re-add dogs that
 * were already on her first one — `update`'s message named the clashing dog
 * and told her to "edit that record instead", which is impossible for a dog
 * she can't see or act on from this account (Michael 2026-09-11).
 *
 * `findDogRegistrationClash` is the one place that decides WHAT the clash
 * is; `dogRegistrationClashMessage` is the one place that decides what to
 * SAY about it — privacy lives entirely in the message function, not in the
 * shape of the result, so a new call site can't accidentally leak another
 * account's dog name by skipping a check a sibling call site remembered.
 *
 * Ownership reuses `dogRowGrantsAccess` from `@/server/dog-access` — the
 * existing single source of truth for "does this user have rights on this
 * dog" (account holder OR linked co-owner) — rather than a second
 * `ownerId === userId` check that could drift from it.
 */
import { and, eq, ne } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { dogs } from '@/server/db/schema';
import { dogRowGrantsAccess } from '@/server/dog-access';

export type DogRegistrationClash =
  | { kind: 'none' }
  | { kind: 'own-deleted'; dog: { id: string; registeredName: string } }
  | { kind: 'own-live'; dog: { id: string; registeredName: string } }
  | { kind: 'other-account-live'; dog: { id: string; registeredName: string } }
  | { kind: 'other-account-deleted'; dog: { id: string; registeredName: string } };

/**
 * Look up whether `kcRegNumber` already belongs to some other dog row, and
 * classify the clash. `excludeDogId` leaves out the dog being edited (for
 * `update`, so a dog keeping its own number isn't read as a clash with
 * itself); omit it for a brand-new dog (`create`, `registerDogForExhibitor`).
 *
 * `currentUserId` is the account the clash is judged relative to — the
 * exhibitor's own id for the exhibitor-facing paths, and the EXHIBITOR
 * being registered for (not the secretary) on the secretary path, since
 * "own" means "already on this exhibitor's account" there too.
 */
export async function findDogRegistrationClash(
  db: Database,
  params: { kcRegNumber: string; excludeDogId?: string; currentUserId: string },
): Promise<DogRegistrationClash> {
  const { kcRegNumber, excludeDogId, currentUserId } = params;

  const clash = await db.query.dogs.findFirst({
    where: excludeDogId
      ? and(eq(dogs.kcRegNumber, kcRegNumber), ne(dogs.id, excludeDogId))
      : eq(dogs.kcRegNumber, kcRegNumber),
    columns: { id: true, ownerId: true, registeredName: true, deletedAt: true },
    with: { owners: { columns: { userId: true } } },
  });
  if (!clash) return { kind: 'none' };

  const dog = { id: clash.id, registeredName: clash.registeredName };
  const isOwn = dogRowGrantsAccess(clash, currentUserId);

  if (isOwn) {
    return clash.deletedAt ? { kind: 'own-deleted', dog } : { kind: 'own-live', dog };
  }
  return clash.deletedAt ? { kind: 'other-account-deleted', dog } : { kind: 'other-account-live', dog };
}

/**
 * The one wording for each clash, by audience. `'owner'` is the exhibitor
 * looking at their own dog form; `'secretary'` is a club secretary
 * resolving a manual entry, who has a legitimate need to know WHICH dog is
 * clashing but never who owns it.
 *
 * Privacy rule this function alone enforces: another account's dog name is
 * never shown to the `'owner'` audience — only that a clash exists, and a
 * route forward. It MAY be shown to `'secretary'` (they're identifying a
 * real dog to resolve a real entry), but the other owner's email is never
 * included for either audience — this type doesn't even carry one.
 */
export function dogRegistrationClashMessage(
  clash: DogRegistrationClash,
  audience: 'owner' | 'secretary',
): string {
  switch (clash.kind) {
    case 'none':
      return '';

    case 'own-deleted':
      return `That registration number belongs to "${clash.dog.registeredName}", a dog that was removed. Please contact the show secretary to have it freed up.`;

    case 'own-live':
      return `That registration number is already on "${clash.dog.registeredName}". If that's this dog added twice, edit that record instead — or remove the duplicate first.`;

    case 'other-account-deleted':
      return audience === 'secretary'
        ? `That registration number belongs to "${clash.dog.registeredName}", a dog removed from another exhibitor's account. Contact Remi support if it needs to be restored.`
        : 'That registration number belongs to a dog that was removed. Please contact the show secretary to have it freed up.';

    case 'other-account-live':
      return audience === 'secretary'
        ? `${clash.dog.registeredName} is already registered under a different exhibitor's account. Check with them before adding it again — or contact Remi support to move it across.`
        : "This dog is already registered on Remi under a different account. If this is your dog, sign in with the account you used before — or use Help & Feedback in the app and we'll move the dog across for you.";
  }
}
