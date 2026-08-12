/**
 * Beacon-friendly autosave endpoint for the dog form's data-loss-prone
 * sections (Mandy 2026-07-11: an exhibitor filled in sire/dam registration
 * and health details but never pressed the second save button).
 *
 * Same design as /api/schedule-autosave (the 2026-04-22 lessons):
 * - Plain route (not tRPC) so `navigator.sendBeacon()` can deliver the
 *   final snapshot during unmount/navigation without being aborted.
 * - MERGE semantics — only keys present in the payload are written, so a
 *   partial snapshot can never drag unrelated fields to null.
 * - Wipe guard — a payload with no user content against a dog that already
 *   has content is refused (the unhydrated-form-defaults failure mode).
 *
 * Covers two groups, each optional per request:
 *   dog       — pedigree names, breeder location, microchip, coat type,
 *               sire/dam registration (columns on `dogs`)
 *   svProfile — the SV Health & Working Titles card (dog_sv_profile)
 *
 * Auth: the dog's account holder OR a linked co-owner (`dog_owners.user_id`)
 * — same rule as dogs.update / upsertSvProfile.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { dogs, dogSvProfile } from '@/server/db/schema';
import { dogAccessCondition } from '@/server/dog-access';
import {
  dogAutosaveFieldsSchema,
  svProfileInputSchema,
} from '@/server/trpc/routers/dogs';

const payloadSchema = z.object({
  dog: dogAutosaveFieldsSchema.optional(),
  svProfile: svProfileInputSchema.optional(),
});

// Field lists derived from the schemas, so the wipe guards can never drift
// out of sync with what the payload may contain.
const DOG_FIELD_KEYS = Object.keys(dogAutosaveFieldsSchema.shape) as Array<
  keyof z.infer<typeof dogAutosaveFieldsSchema>
>;
const SV_FIELD_KEYS = Object.keys(svProfileInputSchema.shape) as Array<
  keyof z.infer<typeof svProfileInputSchema>
>;

const pick = (row: Record<string, unknown>, keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, row[k]]));

/** Merge set: absent keys stay untouched; blank strings normalise to null. */
function toMergeSet(incoming: Record<string, unknown>): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined) continue;
    set[k] = typeof v === 'string' ? norm(v) : v;
  }
  return set;
}

/** Blank-ish string normaliser — the form round-trips DB nulls as ''. */
const norm = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

/** Values that mean "the exhibitor hasn't told us anything yet". */
const SV_EMPTY = new Set([null, undefined, 'not_required', '']);

function dogGroupHasContent(g: Record<string, unknown>): boolean {
  return Object.values(g).some((v) => typeof v === 'string' && v.trim().length > 0);
}

function svGroupHasContent(g: Record<string, unknown>): boolean {
  return Object.entries(g).some(([, v]) => {
    if (typeof v === 'number') return true;
    if (typeof v === 'string') return v.trim().length > 0 && !SV_EMPTY.has(v);
    return false;
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dogId: string }> }
) {
  const { dogId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  if (!db) {
    return NextResponse.json({ error: 'db unavailable' }, { status: 500 });
  }

  // 404 vs 403 needs a separate existence check first — folding the access
  // condition into one query would make "dog doesn't exist" and "dog
  // exists but isn't yours" indistinguishable.
  const dogExists = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, dogId), isNull(dogs.deletedAt)),
    columns: { id: true },
  });
  if (!dogExists) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, dogId), isNull(dogs.deletedAt), dogAccessCondition(db, session.user.id)),
    with: { svProfile: true },
  });
  if (!dog) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let parsed: z.infer<typeof payloadSchema>;
  try {
    parsed = payloadSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const skipped: string[] = [];

  if (parsed.dog) {
    const incoming = parsed.dog;
    const existing = pick(dog as unknown as Record<string, unknown>, DOG_FIELD_KEYS);
    if (!dogGroupHasContent(incoming) && dogGroupHasContent(existing)) {
      // Unhydrated-form-defaults shape against a populated dog — refuse.
      console.warn(`[dog-autosave] Refused suspicious dog-fields wipe for ${dogId}`);
      skipped.push('dog');
    } else {
      const set = toMergeSet(incoming);
      if (Object.keys(set).length > 0) {
        await db.update(dogs).set(set).where(eq(dogs.id, dogId));
      }
    }
  }

  if (parsed.svProfile) {
    const incoming = parsed.svProfile;
    const existing = pick((dog.svProfile ?? {}) as Record<string, unknown>, SV_FIELD_KEYS);
    if (!svGroupHasContent(incoming) && svGroupHasContent(existing)) {
      console.warn(`[dog-autosave] Refused suspicious sv-profile wipe for ${dogId}`);
      skipped.push('svProfile');
    } else {
      const set = toMergeSet(incoming);
      if (Object.keys(set).length > 0) {
        await db
          .insert(dogSvProfile)
          .values({ dogId, ...set })
          .onConflictDoUpdate({
            target: dogSvProfile.dogId,
            set: { ...set, updatedAt: new Date() },
          });
      }
    }
  }

  return NextResponse.json(
    skipped.length > 0 ? { ok: true, skipped } : { ok: true },
  );
}
