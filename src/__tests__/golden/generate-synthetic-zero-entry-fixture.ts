#!/usr/bin/env -S npx tsx
/**
 * Build a synthetic DRAFT show with classes/judges but ZERO confirmed
 * entries — a show a secretary has just created and published a schedule
 * for, before anyone has entered. Real-fixture evidence (winter-spectacular,
 * 2026-09-02): ring-numbers 500s with "No catalogue numbers found"
 * (generateRingNumbersPdf, pdf-generation.ts) on exactly this shape, which
 * took the whole fixture's test run down rather than being recognised as an
 * expected, skippable state. See render-documents.ts's
 * ENTRY_DEPENDENT_DOCUMENTS / hasConfirmedEntries for the fix.
 *
 * Run with: npx tsx src/__tests__/golden/generate-synthetic-zero-entry-fixture.ts
 */
import { loadEnv } from 'vite';

const env = loadEnv('test', process.cwd(), '');
for (const [key, value] of Object.entries(env)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const dbUrl = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(dbUrl)) {
  throw new Error(`Refusing to run against non-localhost DATABASE_URL. Got: ${dbUrl}`);
}

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { exportShowFixture } from '../../../scripts/lib/export-show-fixture-core';

async function main() {
  const { testDb, cleanDb } = await import('../helpers/db');
  const { makeUser, makeOrg, makeMembership, makeBreedGroup, makeBreed, makeClassDef, makeShow, makeShowClass, makeJudge, makeJudgeAssignment } =
    await import('../helpers/factories');

  await cleanDb();

  const breedGroup = await makeBreedGroup({ name: 'Working' });
  const breed = await makeBreed({ name: 'Rottweiler', groupId: breedGroup.id });
  const org = await makeOrg({ name: 'Test Winter Spectacular Club', breedId: breed.id, showRuleset: 'rkc' });
  const secretary = await makeUser({ role: 'secretary', name: 'Test Draft Secretary' });
  await makeMembership({ userId: secretary.id, organisationId: org.id });

  const [venueRow] = await testDb
    .insert(schema.venues)
    .values({ name: 'Test Winter Venue', address: '3 Test Close', postcode: 'TE3 3ST', organisationId: org.id })
    .returning();

  // DRAFT, zero entries — schedule/classes/judges are set up but nobody has
  // entered yet. entries_open/upcoming dates so this reads as "not yet open"
  // rather than "closed with zero entries" (a different, rarer shape).
  const show = await makeShow({
    organisationId: org.id,
    name: 'Test Winter Spectacular 2030',
    showType: 'open',
    showScope: 'single_breed',
    showRuleset: 'rkc',
    breedId: breed.id,
    venueId: venueRow!.id,
    startDate: '2030-12-06',
    endDate: '2030-12-06',
    status: 'draft',
    secretaryUserId: secretary.id,
    secretaryName: 'Test Draft Secretary',
    secretaryEmail: 'draft-secretary@test.local',
    secretaryPhone: '01234 555000',
  });
  await testDb.insert(schema.showBreeds).values({ showId: show.id, breedId: breed.id, ccOffered: false, displayOrder: 0 });

  let sortOrder = 0;
  for (const name of ['Puppy', 'Junior', 'Open']) {
    const classDef = await makeClassDef({ name, type: 'age', sortOrder });
    for (const sex of ['dog', 'bitch'] as const) {
      const sc = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id, breedId: breed.id });
      await testDb.update(schema.showClasses).set({ sex, sortOrder, classNumber: sortOrder + 1 }).where(eq(schema.showClasses.id, sc.id));
      sortOrder++;
    }
  }

  const [ring] = await testDb.insert(schema.rings).values({ showId: show.id, number: 1 }).returning();
  const judge = await makeJudge({ name: 'Test Draft Judge' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: 'dog', ringId: ring!.id });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: 'bitch', ringId: ring!.id });

  console.log(`Built synthetic zero-entry show ${show.id} — 0 entries across ${sortOrder} classes.`);

  const fixture = await exportShowFixture(testDb, show.id, 'synthetic-zero-entry-draft');
  const outPath = path.join(process.cwd(), 'src/__tests__/golden/fixtures/synthetic-zero-entry-draft.json');
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
