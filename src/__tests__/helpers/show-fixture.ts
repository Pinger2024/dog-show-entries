/**
 * Loads a golden-document ShowFixture (src/__tests__/golden/fixtures/*.json)
 * into the test database, preserving the fixture's own ids — cleanDb()
 * truncates every table before each test (see helpers/setup.ts), so a
 * fixture's real UUIDs never collide across tests, and preserving them
 * keeps this loader a straight table-by-table insert instead of a UUID
 * remapping exercise.
 *
 * Insert order follows the FK graph (see the export policy comment at the
 * top of scripts/lib/export-show-fixture-core.ts for the full table list):
 * breed groups → breeds → organisations → venues → users → shows → class
 * definitions → show classes → show breeds → dogs (+ owners/titles/sv
 * profile) → judges (+ roles) → rings → judge assignments → orders →
 * entries (+ JH details/classes/results) → achievements → steward
 * assignments → sundry items → sponsors (+ show/class sponsorships) →
 * catalogue adverts → discount groups → donations → invoices.
 */
import type { Database } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { ShowFixture } from '../../../scripts/lib/export-show-fixture-core';
import { buildPlaceholderAdvertDataUri } from '../../../scripts/lib/placeholder-image';

/** `JSON.parse` turns every `Date` the export serialised back into a plain
 *  string. `Date.prototype.toJSON()` (what `JSON.stringify` calls on a
 *  Date) always produces exactly this shape — millisecond precision,
 *  trailing "Z" — which a plain `date`-typed column's value (e.g.
 *  "2030-06-01", no time component) can never coincidentally match, so this
 *  is a safe, generic reviver with no per-table column bookkeeping needed. */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function reviveDates<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reviveDates) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = reviveDates(v);
    }
    return out as T;
  }
  if (typeof value === 'string' && ISO_DATETIME.test(value)) {
    return new Date(value) as unknown as T;
  }
  return value;
}

export interface LoadedShowFixture {
  showId: string;
  organisationId: string;
  slug: string;
}

/** Insert helper — a no-op for an empty array (drizzle's `.values([])`
 *  throws rather than inserting nothing). */
async function insertAll(db: Database, table: Parameters<Database['insert']>[0], rows: unknown[]) {
  if (rows.length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.insert(table).values(rows as any[]);
}

export async function loadShowFixture(db: Database, rawFixture: ShowFixture): Promise<LoadedShowFixture> {
  const fixture = reviveDates(rawFixture);
  const t = fixture.tables;

  await insertAll(db, schema.breedGroups, t.breedGroups);
  await insertAll(db, schema.breeds, t.breeds);
  await insertAll(db, schema.organisations, t.organisations);
  await insertAll(db, schema.venues, t.venues);
  await insertAll(db, schema.users, t.users);
  await insertAll(db, schema.shows, t.shows);
  await insertAll(db, schema.classDefinitions, t.classDefinitions);
  await insertAll(db, schema.showClasses, t.showClasses);
  await insertAll(db, schema.showBreeds, t.showBreeds);
  await insertAll(db, schema.dogs, t.dogs);
  await insertAll(db, schema.dogOwners, t.dogOwners);
  await insertAll(db, schema.dogTitles, t.dogTitles);
  await insertAll(db, schema.dogSvProfile, t.dogSvProfile);
  await insertAll(db, schema.judges, t.judges);
  await insertAll(db, schema.rings, t.rings);
  await insertAll(db, schema.judgeRoles, t.judgeRoles);
  await insertAll(db, schema.judgeAssignments, t.judgeAssignments);
  await insertAll(db, schema.orders, t.orders);
  await insertAll(db, schema.entries, t.entries);
  await insertAll(db, schema.juniorHandlerDetails, t.juniorHandlerDetails);
  await insertAll(db, schema.entryClasses, t.entryClasses);
  await insertAll(db, schema.results, t.results);
  await insertAll(db, schema.achievements, t.achievements);
  await insertAll(db, schema.stewardAssignments, t.stewardAssignments);
  await insertAll(db, schema.sundryItems, t.sundryItems);
  await insertAll(db, schema.sponsors, t.sponsors);
  await insertAll(db, schema.showSponsors, t.showSponsors);
  await insertAll(db, schema.classSponsorships, t.classSponsorships);

  // Catalogue adverts carry {width, height} instead of a real imageUrl (see
  // export-show-fixture-core.ts) — turn each back into a real, same-shaped
  // placeholder PNG (as a data: URI) here, at load time, so nothing in the
  // render path ever needs to fetch over the network.
  const advertRows = await Promise.all(
    t.catalogueAdverts.map(async (ad) => {
      const row = ad as Record<string, unknown>;
      const width = typeof row.width === 'number' ? row.width : 1000;
      const height = typeof row.height === 'number' ? row.height : 1400;
      const { width: _w, height: _h, ...rest } = row;
      return {
        ...rest,
        imageUrl: await buildPlaceholderAdvertDataUri(width, height, String(row.id ?? row.advertiserName ?? 'advert')),
      };
    }),
  );
  await insertAll(db, schema.catalogueAdverts, advertRows);

  await insertAll(db, schema.showDiscountGroups, t.showDiscountGroups);
  await insertAll(db, schema.showDonations, t.showDonations);
  await insertAll(db, schema.invoices, t.invoices);

  const showRow = t.shows[0] as Record<string, unknown> | undefined;
  if (!showRow) throw new Error(`Fixture "${fixture.slug}" has no show row`);

  return {
    showId: String(showRow.id),
    organisationId: String(showRow.organisationId),
    slug: fixture.slug,
  };
}
