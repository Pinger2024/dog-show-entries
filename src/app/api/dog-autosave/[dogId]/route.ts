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
 * Auth: the dog's owner only — same rule as dogs.update / upsertSvProfile.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { dogs, dogSvProfile } from '@/server/db/schema';

const regBody = z.enum(['kc', 'sv', 'ikc', 'other']).nullable().optional();

const dogFieldsSchema = z.object({
  sireName: z.string().nullable().optional(),
  damName: z.string().nullable().optional(),
  breederName: z.string().nullable().optional(),
  breederCountry: z.string().nullable().optional(),
  breederCity: z.string().nullable().optional(),
  breederPostcode: z.string().nullable().optional(),
  microchipNumber: z.string().nullable().optional(),
  coatType: z.enum(['stock', 'long_stock']).nullable().optional(),
  sireRegistrationBody: regBody,
  sireRegistrationNumber: z.string().nullable().optional(),
  damRegistrationBody: regBody,
  damRegistrationNumber: z.string().nullable().optional(),
});

// Same field set as dogs.upsertSvProfile (minus dogId).
const svProfileSchema = z.object({
  breedSurveyClass: z.string().nullable().optional(),
  breedSurveyYear: z.number().int().min(1900).max(2100).nullable().optional(),
  breedSurveyor: z.string().nullable().optional(),
  hipGrade: z.enum(['not_required', 'normal', 'fast_normal', 'noch_zugelassen', 'bva', 'ankc', 'other']).nullable().optional(),
  hipScore: z.string().nullable().optional(),
  hipScoreOther: z.string().nullable().optional(),
  elbowGrade: z.enum(['not_required', 'normal', 'fast_normal', 'noch_zugelassen', 'bva', 'ankc', 'other']).nullable().optional(),
  elbowScore: z.string().nullable().optional(),
  elbowScoreOther: z.string().nullable().optional(),
  haemophiliaClear: z.enum(['not_required', 'yes', 'no', 'not_tested']).nullable().optional(),
  dmTest: z.enum(['not_required', 'clear', 'carrier', 'affected', 'not_tested']).nullable().optional(),
  koerung: z.enum(['none', 'current_year', 'lebenzeit']).nullable().optional(),
  dna: z.enum(['recorded', 'proven']).nullable().optional(),
  workingTitle: z.string().nullable().optional(),
});

const payloadSchema = z.object({
  dog: dogFieldsSchema.optional(),
  svProfile: svProfileSchema.optional(),
});

/** Blank-ish string normaliser — the form round-trips DB nulls as ''. */
const norm = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

/** Values that mean "the exhibitor hasn't told us anything yet". */
const SV_EMPTY = new Set([null, undefined, 'not_required', '']);

function dogGroupHasContent(g: z.infer<typeof dogFieldsSchema>): boolean {
  return Object.values(g).some((v) => typeof v === 'string' && v.trim().length > 0);
}

function svGroupHasContent(g: z.infer<typeof svProfileSchema>): boolean {
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

  const dog = await db.query.dogs.findFirst({
    where: and(eq(dogs.id, dogId), isNull(dogs.deletedAt)),
    with: { svProfile: true },
  });
  if (!dog) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (dog.ownerId !== session.user.id) {
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
    const existingHasContent = dogGroupHasContent({
      sireName: dog.sireName,
      damName: dog.damName,
      breederName: dog.breederName,
      breederCountry: dog.breederCountry,
      breederCity: dog.breederCity,
      breederPostcode: dog.breederPostcode,
      microchipNumber: dog.microchipNumber,
      sireRegistrationNumber: dog.sireRegistrationNumber,
      damRegistrationNumber: dog.damRegistrationNumber,
    });
    if (!dogGroupHasContent(incoming) && existingHasContent) {
      // Unhydrated-form-defaults shape against a populated dog — refuse.
      console.warn(`[dog-autosave] Refused suspicious dog-fields wipe for ${dogId}`);
      skipped.push('dog');
    } else {
      const set: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(incoming)) {
        if (v === undefined) continue; // merge: absent keys stay untouched
        set[k] = typeof v === 'string' ? norm(v) : v;
      }
      if (Object.keys(set).length > 0) {
        await db.update(dogs).set(set).where(eq(dogs.id, dogId));
      }
    }
  }

  if (parsed.svProfile) {
    const incoming = parsed.svProfile;
    if (!svGroupHasContent(incoming) && svGroupHasContent(dog.svProfile ?? {})) {
      console.warn(`[dog-autosave] Refused suspicious sv-profile wipe for ${dogId}`);
      skipped.push('svProfile');
    } else {
      const set: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(incoming)) {
        if (v === undefined) continue;
        set[k] = typeof v === 'string' ? norm(v) : v;
      }
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
