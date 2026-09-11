import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeClassDef,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
} from '../helpers/factories';
import { entries } from '@/server/db/schema';
import { buildCatalogueSnapshot } from '@/server/services/catalogue-snapshot';
import { loadAbsenteeLikeEntries, confirmedAbsentNonJhWhere } from '@/server/services/report-queries';

/**
 * BAGSD absentees ran 12, 15, 18 … 48, 5, 51 (coordinator's review,
 * 2026-09-02) — `catalogueNumber` is a TEXT column, and every affected
 * query ordered it with a bare `asc()`, which is a lexicographic string
 * sort, not a numeric one. Reproduces with entries whose catalogue
 * numbers span single and double digits, set directly (not via
 * resortCatalogueNumbers, which would naturally assign in-order 1..N and
 * never exercise the bug).
 */
describe('catalogue number ordering is numeric, not lexicographic', () => {
  async function setUpAbsentEntries() {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_closed' });
    const def = await makeClassDef({ type: 'age', name: 'Minor Puppy' });
    const showClass = await makeShowClass({ showId: show.id, classDefinitionId: def.id });

    // Exact reported symptom shape: 5, 12, 15, 18, 48, 51.
    const numbers = ['12', '15', '18', '48', '5', '51'];
    for (const n of numbers) {
      const dog = await makeDog({ ownerId: user.id });
      const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: user.id });
      await makeEntryClass({ entryId: entry.id, showClassId: showClass.id, absent: true });
      await testDb.update(entries).set({ catalogueNumber: n }).where(eq(entries.id, entry.id));
    }
    return show;
  }

  it('catalogue-snapshot orders entries numerically (feeds every catalogue PDF format)', async () => {
    const show = await setUpAbsentEntries();
    const snapshot = await buildCatalogueSnapshot(testDb, show.id);
    const numbers = snapshot.entries.map((e) => Number(e.catalogueNumber));
    expect(numbers).toEqual([5, 12, 15, 18, 48, 51]);
  });

  it('loadAbsenteeLikeEntries orders rows numerically (feeds the CSV/JSON/xlsx absentee reports)', async () => {
    const show = await setUpAbsentEntries();
    const rows = await loadAbsenteeLikeEntries(testDb, confirmedAbsentNonJhWhere(show.id));
    const numbers = rows.map((r) => Number(r.catalogueNumber));
    expect(numbers).toEqual([5, 12, 15, 18, 48, 51]);
  });
});
