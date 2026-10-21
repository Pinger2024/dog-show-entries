/**
 * SH01 stats against the REAL Clyde Valley + GSD Club of Scotland golden
 * fixtures (both single-breed shows, show_classes.breed_id NULL — the exact
 * shape that put totals in the Mixed column pre-fix, confirmed 2026-08-31
 * against the real weekend's data). This exercises the same DB shapes the
 * route handler feeds computeSh01Stats, not hand-built fixtures.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { cleanDb } from '../../__tests__/helpers/db';
import { loadShowFixture } from '../../__tests__/helpers/show-fixture';
import { computeSh01Stats, type Sh01EntryInput, type Sh01ClassInput } from '../sh01-absentee';
import type { ShowFixture } from '../../../scripts/lib/export-show-fixture-core';

const FIXTURES_DIR = path.join(__dirname, '../../__tests__/golden/fixtures');

function loadFixture(name: string): ShowFixture {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, `${name}.json`), 'utf8')) as ShowFixture;
}

async function computeForFixture(name: string) {
  const fixture = loadFixture(name);
  const { showId } = await loadShowFixture(db, fixture);

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { breed: true },
  });
  if (!show) throw new Error(`fixture ${name} did not load a show`);

  const [showClasses, entries] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: { breed: true },
    }),
    db.query.entries.findMany({
      where: eq(schema.entries.showId, showId),
      with: { dog: { with: { breed: true } } },
    }),
  ]);

  const nonDeleted = entries.filter((e) => !e.deletedAt) as unknown as Sh01EntryInput[];
  return computeSh01Stats(nonDeleted, showClasses as unknown as Sh01ClassInput[], show.breed?.name ?? null);
}

describe('SH01 stats against real single-breed golden fixtures (Mandy/Michael 2026-08-31)', () => {
  beforeAll(async () => {
    await cleanDb();
  });

  it('Clyde Valley Open 2026: single breed, sexed classes → Dogs & Bitches, not Mixed', async () => {
    const { breeds } = await computeForFixture('clyde-valley-open-2026');
    expect(breeds).toHaveLength(1);
    const row = breeds[0];
    expect(row.judgedSeparately).toBe(true);
    // 17 dogs (4 abs) + 29 bitches (8 abs) = 46 entered, 12 absent — matches
    // the chief steward's real weekend figures (2026-08-31).
    expect(row.dogs).toBe(17);
    expect(row.absentDogs).toBe(4);
    expect(row.bitches).toBe(29);
    expect(row.absentBitches).toBe(8);
  });

  it('GSD Club of Scotland Champ 2026: single breed, sexed classes → Dogs & Bitches, not Mixed', async () => {
    const { breeds } = await computeForFixture('gsd-scotland-champ-2026');
    expect(breeds).toHaveLength(1);
    const row = breeds[0];
    expect(row.judgedSeparately).toBe(true);
    // 28 dogs (13 abs) + 41 bitches (13 abs) = 69 entered, 26 absent —
    // matches the real weekend figures (2026-08-31).
    expect(row.dogs).toBe(28);
    expect(row.absentDogs).toBe(13);
    expect(row.bitches).toBe(41);
    expect(row.absentBitches).toBe(13);
  });
});
