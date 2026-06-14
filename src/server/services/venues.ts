import { and, eq, ilike } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { venues } from '@/server/db/schema';

/** Geocode a UK postcode to lat/lng via postcodes.io. Mirrors the
 *  silent-fail block in secretary.createVenue — returns null coords on any
 *  error so a venue save is never blocked or slowed by geocoding. */
async function geocodePostcode(
  postcode: string | null,
): Promise<{ lat: string; lng: string } | null> {
  if (!postcode?.trim()) return null;
  try {
    const cleaned = postcode.trim().replace(/\s+/g, '');
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (res.ok) {
      const data = await res.json();
      if (data.status === 200 && data.result) {
        return { lat: String(data.result.latitude), lng: String(data.result.longitude) };
      }
    }
  } catch {
    // Geocoding failed — venue still works without coordinates.
  }
  return null;
}

/**
 * Resolve a venue name+address+postcode to a venue id for a show. Called by
 * BOTH secretary.updateScheduleData (tRPC) and the schedule-autosave beacon
 * route so the two save paths can never drift apart.
 *
 * Rules:
 * - Blank/whitespace name → returns undefined ("leave the show's venue
 *   alone"). The schedule form autosaves on every keystroke, so a half-typed
 *   or empty name must NEVER create an empty venue or unlink an existing one.
 * - If the show already has a linked venue → update it in place (fixing a
 *   typo / renaming the hall) and reuse its id, so we don't spawn orphan rows
 *   on every edit.
 * - Otherwise reuse an existing org venue with the same name
 *   (case-insensitive) if one exists; else create a new venue for the org.
 */
export async function resolveVenueId(
  db: Database,
  opts: {
    orgId: string;
    currentVenueId: string | null;
    name?: string;
    address?: string;
    postcode?: string;
  },
): Promise<string | undefined> {
  const name = opts.name?.trim();
  if (!name) return undefined; // blank = leave alone

  const address = opts.address?.trim() || null;
  const postcode = opts.postcode?.trim() || null;

  // Update the show's existing venue in place (typo fix / rename).
  if (opts.currentVenueId) {
    const set: Record<string, unknown> = { name, address, postcode };
    // Only touch coordinates when we have a definitive answer: clear them
    // when the postcode is removed, set them when geocoding succeeds, and
    // leave existing coords untouched on a transient geocode failure.
    if (!postcode) {
      set.lat = null;
      set.lng = null;
    } else {
      const geo = await geocodePostcode(postcode);
      if (geo) {
        set.lat = geo.lat;
        set.lng = geo.lng;
      }
    }
    await db.update(venues).set(set).where(eq(venues.id, opts.currentVenueId));
    return opts.currentVenueId;
  }

  // Reuse a previously-saved venue with the same name (no wildcards → exact,
  // case-insensitive match).
  const existing = await db.query.venues.findFirst({
    where: and(eq(venues.organisationId, opts.orgId), ilike(venues.name, name)),
    columns: { id: true },
  });
  if (existing) return existing.id;

  // Create a new venue for this org.
  const geo = await geocodePostcode(postcode);
  const [created] = await db
    .insert(venues)
    .values({
      name,
      address,
      postcode,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      organisationId: opts.orgId,
    })
    .returning({ id: venues.id });
  return created?.id;
}
