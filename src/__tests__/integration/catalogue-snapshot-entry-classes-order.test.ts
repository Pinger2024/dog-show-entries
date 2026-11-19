import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';

// Same class of bug as report-entry-classes-order.test.ts, this time in the
// catalogue snapshot rather than the reports route: buildCatalogueSnapshot's
// entries query fetches entryClasses with no ORDER BY (Drizzle can't order a
// `with:` relation by a column on the JOINED showClass table), and Postgres
// gives no ordering guarantee for a relation fetched without one. Every
// catalogue format reads `SnapshotEntry.classes` straight off that array —
// catalogue-absentees.tsx joins a multi-class dog's classes with no sort of
// its own (`entry.classes.map(...).join(', ')`), so real-show evidence
// (gsd-scotland-champ-2026, 2026-09-01) showed pages 1-2 swap "9, C" and
// "C, 9" between two otherwise-identical renders.
//
// Root fix: catalogue-snapshot.ts now sorts entry.entryClasses with the
// SAME sortEntryClassesByShowClassOrder() helper the reports fix uses,
// once, at the point `SnapshotEntry.classes` is built — so EVERY format
// (absentees, standard, by-class, judging, marked) gets a stably-ordered
// classes array, and catalogue-ringside.tsx / catalogue-front-matter.tsx's
// own local re-sorts (which already existed) stay harmless, idempotent
// no-ops on top of it.
//
// This test asserts on the SNAPSHOT directly (buildCatalogueSnapshot),
// not a full PDF render + pdftotext parse — the bug and the fix both live
// entirely in the snapshot's `classes` array order, so that's the cheapest
// reliable place to prove it.

import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildCatalogueSnapshot } from '@/server/services/catalogue-snapshot';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeUser,
} from '../helpers/factories';
import { testDb } from '../helpers/db';

describe('buildCatalogueSnapshot — a multi-class dog keeps show running order regardless of insertion order', () => {
  it('SnapshotEntry.classes is ordered by show running order, not DB return order', async () => {
    const { org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });

    const earlyDef = await makeClassDef({ name: 'Minor Puppy', type: 'age', sortOrder: 0 });
    const lateDef = await makeClassDef({ name: 'Special Award Class A', type: 'special', sortOrder: 9 });
    const early = await makeShowClass({ showId: show.id, classDefinitionId: earlyDef.id, breedId: breed.id });
    await testDb.update(schema.showClasses).set({ sortOrder: 0, classNumber: 1 }).where(eq(schema.showClasses.id, early.id));
    const late = await makeShowClass({ showId: show.id, classDefinitionId: lateDef.id, breedId: breed.id });
    await testDb.update(schema.showClasses).set({ sortOrder: 9, classNumber: null }).where(eq(schema.showClasses.id, late.id));

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Multi Class Snapshot Dog' });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await testDb.update(schema.entries).set({ catalogueNumber: '1' }).where(eq(schema.entries.id, entry.id));

    // Later-running class (Special Award Class, sortOrder 9) inserted FIRST.
    await makeEntryClass({ entryId: entry.id, showClassId: late.id, absent: true });
    await makeEntryClass({ entryId: entry.id, showClassId: early.id, absent: true });

    const snapshot = await buildCatalogueSnapshot(db, show.id);
    const snapshotEntry = snapshot.entries.find((e) => e.catalogueNumber === '1');
    expect(snapshotEntry).toBeDefined();

    const order = snapshotEntry!.classes.map((c) => c.name);
    expect(order).toEqual(['Minor Puppy', 'Special Award Class A']);
  });
});
