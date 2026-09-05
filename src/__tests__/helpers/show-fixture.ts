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
 * profile) → judges (+ roles) → rings → judge assignments → show discount
 * groups → orders → entries (+ JH details/classes/results) → achievements →
 * steward assignments → sundry items → sponsors (+ show/class
 * sponsorships) → catalogue adverts → donations → invoices.
 *
 * `showDiscountGroups` moved ahead of `orders` here (2026-09-02) after a
 * real-fixture failure: `orders.discountGroupId` is a nullable FK to
 * `show_discount_groups.id`, and orders used to be inserted before that
 * table — north-eastern and south-western's real exports both had orders
 * referencing a discount group, so the insert threw
 * `orders_discount_group_id_show_discount_groups_id_fk` on a table that
 * simply didn't exist in the DB yet. The export itself was already
 * complete (showDiscountGroups is queried by showId, the same scope every
 * order referencing one belongs to) — this was purely an insert-order bug.
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

/** Postgres foreign-key-violation error shape, as thrown by the `postgres`
 *  driver — `detail` reads like `Key (discount_group_id)=(6f3b...) is not
 *  present in table "show_discount_groups".` */
interface PgForeignKeyError {
  code?: string;
  detail?: string;
  message?: string;
}

const FK_VIOLATION_DETAIL_RE = /Key \(([^)]+)\)=\(([^)]+)\) is not present in table "([^"]+)"/;

/** Turn a raw Postgres FK-violation error into one that names the table,
 *  the offending column, and the missing id directly — a fixture that's
 *  missing an FK target (an export gap) or was inserted in the wrong order
 *  (a loader bug) should never surface as a bare "insert or update on table
 *  ... violates foreign key constraint" with no indication of WHICH id is
 *  missing from WHICH table. See the file header for the real incident
 *  (`orders.discountGroupId`) this was written for. */
function describeInsertError(tableName: string, err: unknown): Error {
  // Drizzle wraps the real postgres.js error (which carries .code/.detail)
  // in its own error class and puts the original on `.cause` — the
  // top-level error's own .message is Drizzle's "Failed query: ... params:
  // ..." dump, not the useful bit. Unwrap one level before giving up.
  const top = err as { code?: string; detail?: string; message?: string; cause?: unknown } | null;
  const pgErr = (top?.code ? top : (top?.cause as PgForeignKeyError | undefined)) ?? null;
  if (pgErr?.code === '23503' && pgErr.detail) {
    const m = FK_VIOLATION_DETAIL_RE.exec(pgErr.detail);
    if (m) {
      const [, column, id, refTable] = m;
      return new Error(
        `loadShowFixture: inserting into "${tableName}" failed — column "${column}" references ` +
          `id ${id} in table "${refTable}", but no row with that id was inserted into the fixture ` +
          `(export gap) or hasn't been inserted YET (loader ordering bug — "${refTable}" must be ` +
          `loaded before "${tableName}"). Original: ${pgErr.message ?? pgErr.detail}`,
        { cause: err },
      );
    }
  }
  return new Error(
    `loadShowFixture: inserting into "${tableName}" failed: ${pgErr?.message ?? String(err)}`,
    { cause: err },
  );
}

/** Insert helper — a no-op for an empty array (drizzle's `.values([])`
 *  throws rather than inserting nothing). `tableName` is the human-readable
 *  name used in a clear failure message (see describeInsertError) rather
 *  than letting a raw Postgres error (which never names which JS array it
 *  came from) reach the caller. */
async function insertAll(
  db: Database,
  table: Parameters<Database['insert']>[0],
  tableName: string,
  rows: unknown[],
) {
  if (rows.length === 0) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(table).values(rows as any[]);
  } catch (err) {
    throw describeInsertError(tableName, err);
  }
}

export async function loadShowFixture(db: Database, rawFixture: ShowFixture): Promise<LoadedShowFixture> {
  const fixture = reviveDates(rawFixture);
  const t = fixture.tables;

  await insertAll(db, schema.breedGroups, 'breedGroups', t.breedGroups);
  await insertAll(db, schema.breeds, 'breeds', t.breeds);
  await insertAll(db, schema.organisations, 'organisations', t.organisations);
  await insertAll(db, schema.venues, 'venues', t.venues);
  await insertAll(db, schema.users, 'users', t.users);
  await insertAll(db, schema.shows, 'shows', t.shows);
  await insertAll(db, schema.classDefinitions, 'classDefinitions', t.classDefinitions);
  await insertAll(db, schema.showClasses, 'showClasses', t.showClasses);
  await insertAll(db, schema.showBreeds, 'showBreeds', t.showBreeds);
  await insertAll(db, schema.dogs, 'dogs', t.dogs);
  await insertAll(db, schema.dogOwners, 'dogOwners', t.dogOwners);
  await insertAll(db, schema.dogTitles, 'dogTitles', t.dogTitles);
  await insertAll(db, schema.dogSvProfile, 'dogSvProfile', t.dogSvProfile);
  await insertAll(db, schema.judges, 'judges', t.judges);
  await insertAll(db, schema.rings, 'rings', t.rings);
  await insertAll(db, schema.judgeRoles, 'judgeRoles', t.judgeRoles);
  await insertAll(db, schema.judgeAssignments, 'judgeAssignments', t.judgeAssignments);
  // showDiscountGroups BEFORE orders — orders.discountGroupId references it
  // (see the file header for the real-fixture failure this fixes).
  await insertAll(db, schema.showDiscountGroups, 'showDiscountGroups', t.showDiscountGroups);
  await insertAll(db, schema.orders, 'orders', t.orders);
  await insertAll(db, schema.entries, 'entries', t.entries);
  await insertAll(db, schema.juniorHandlerDetails, 'juniorHandlerDetails', t.juniorHandlerDetails);
  await insertAll(db, schema.entryClasses, 'entryClasses', t.entryClasses);
  await insertAll(db, schema.results, 'results', t.results);
  await insertAll(db, schema.achievements, 'achievements', t.achievements);
  await insertAll(db, schema.stewardAssignments, 'stewardAssignments', t.stewardAssignments);
  await insertAll(db, schema.sundryItems, 'sundryItems', t.sundryItems);
  await insertAll(db, schema.sponsors, 'sponsors', t.sponsors);
  await insertAll(db, schema.showSponsors, 'showSponsors', t.showSponsors);
  await insertAll(db, schema.classSponsorships, 'classSponsorships', t.classSponsorships);

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
  await insertAll(db, schema.catalogueAdverts, 'catalogueAdverts', advertRows);

  await insertAll(db, schema.showDonations, 'showDonations', t.showDonations);
  await insertAll(db, schema.invoices, 'invoices', t.invoices);

  const showRow = t.shows[0] as Record<string, unknown> | undefined;
  if (!showRow) throw new Error(`Fixture "${fixture.slug}" has no show row`);

  return {
    showId: String(showRow.id),
    organisationId: String(showRow.organisationId),
    slug: fixture.slug,
  };
}
