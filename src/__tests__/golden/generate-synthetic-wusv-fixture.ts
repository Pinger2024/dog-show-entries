#!/usr/bin/env -S npx tsx
/**
 * Build a synthetic WUSV/SV regional show (a dozen entries across coat/age
 * classes) and export it through the real export pipeline, the same way
 * generate-synthetic-fixture.ts does for the RKC synthetic show — see that
 * file's header for the overall rationale.
 *
 * This fixture exists specifically to exercise the RULESET-AWARE half of
 * the golden document list: WUSV shows get the SV-only reports (sv-results,
 * grading-cards) that an RKC show's route rejects, and — per
 * render-documents.ts's reportTypesForRuleset — some RKC-only reports still
 * apply since the reports route doesn't reject them for a WUSV ruleset
 * (verified empirically, not assumed; see that function's doc comment).
 *
 * Shape: 2 SV age classes (Young Dog, Open) x 2 sexes x 2 coat types = 8
 * show classes, 12 entries (one class each — SV/WUSV is one-class-per-dog,
 * unlike RKC's multi-class pattern), each on its own PAID order so the
 * paid-orders-only SV results / grading cards reports have real rows to
 * print, one recorded result, one invoice.
 *
 * Run with: npx tsx src/__tests__/golden/generate-synthetic-wusv-fixture.ts
 * (DATABASE_URL must point at localhost — same guard as the test suite.)
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

const AGE_CLASSES = ['Young Dog', 'Open'];
const SEXES = ['dog', 'bitch'] as const;
const COATS = ['stock', 'long_stock'] as const;

async function main() {
  const { testDb, cleanDb } = await import('../helpers/db');
  const {
    makeUser,
    makeOrg,
    makeMembership,
    makeBreedGroup,
    makeBreed,
    makeClassDef,
    makeShow,
    makeShowClass,
    makeDog,
    makeEntry,
    makeEntryClass,
    makeJudge,
    makeJudgeAssignment,
    makeResult,
    makeOrder,
  } = await import('../helpers/factories');

  await cleanDb();

  const breedGroup = await makeBreedGroup({ name: 'Pastoral' });
  const breed = await makeBreed({ name: 'German Shepherd Dog', groupId: breedGroup.id });

  const org = await makeOrg({ name: 'Test WUSV Regional Group', breedId: breed.id, showRuleset: 'wusv' });
  const secretary = await makeUser({ role: 'secretary', name: 'Test Regional Secretary' });
  await makeMembership({ userId: secretary.id, organisationId: org.id });

  const [venueRow] = await testDb
    .insert(schema.venues)
    .values({ name: 'Test Regional Showground', address: '2 Test Way, Test City', postcode: 'TE2 2ST', organisationId: org.id })
    .returning();

  const show = await makeShow({
    organisationId: org.id,
    name: 'Test GSD Regional Group Show 2030',
    showType: 'championship',
    showScope: 'single_breed',
    showRuleset: 'wusv',
    breedId: breed.id,
    venueId: venueRow!.id,
    startDate: '2030-09-06',
    endDate: '2030-09-06',
    status: 'entries_closed',
    secretaryUserId: secretary.id,
    secretaryName: 'Test Regional Secretary',
    secretaryEmail: 'regional-secretary@test.local',
    secretaryPhone: '01234 998877',
  });

  await testDb.insert(schema.showBreeds).values({ showId: show.id, breedId: breed.id, ccOffered: false, displayOrder: 0 });

  // ── Classes: 2 SV age groups x 2 sexes x 2 coat types = 8 classes ────────
  let sortOrder = 0;
  const classes: { id: string; sex: 'dog' | 'bitch'; coat: 'stock' | 'long_stock' }[] = [];
  for (const ageName of AGE_CLASSES) {
    const classDef = await makeClassDef({ name: `SV ${ageName}`, type: 'sv_age', sortOrder });
    for (const sex of SEXES) {
      for (const coat of COATS) {
        const sc = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id, breedId: breed.id });
        await testDb
          .update(schema.showClasses)
          .set({ sex, svCoatType: coat, sortOrder, classNumber: sortOrder + 1 })
          .where(eq(schema.showClasses.id, sc.id));
        classes.push({ id: sc.id, sex, coat });
        sortOrder++;
      }
    }
  }

  // ── Judge + ring ─────────────────────────────────────────────────────────
  const [ring1] = await testDb.insert(schema.rings).values({ showId: show.id, number: 1 }).returning();
  const judge = await makeJudge({ name: 'Test Regional Judge' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: 'dog', ringId: ring1!.id });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: 'bitch', ringId: ring1!.id });

  // ── Entries: one class each (SV/WUSV convention), 12 total, each PAID ───
  let catalogueNumber = 1;
  let firstResultEntryClassId: string | null = null;
  for (let i = 0; i < 12; i++) {
    const cls = classes[i % classes.length]!;
    const exhibitor = await makeUser({ role: 'exhibitor', name: `Test Regional Exhibitor ${i}` });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const dog = await makeDog({
      ownerId: exhibitor.id,
      breedId: breed.id,
      sex: cls.sex,
      coatType: cls.coat,
      registeredName: `Test Regional ${cls.sex === 'dog' ? 'Dog' : 'Bitch'} ${catalogueNumber} vom Testhaus`,
      kcRegNumber: `SV${String(2000000 + catalogueNumber).padStart(8, '0')}`,
    });
    const entry = await makeEntry({
      showId: show.id,
      dogId: dog.id,
      exhibitorId: exhibitor.id,
      orderId: order.id,
      status: 'confirmed',
    });
    await testDb
      .update(schema.entries)
      .set({ catalogueNumber: String(catalogueNumber) })
      .where(eq(schema.entries.id, entry.id));
    const entryClass = await makeEntryClass({ entryId: entry.id, showClassId: cls.id });
    if (i === 0) firstResultEntryClassId = entryClass.id;
    catalogueNumber++;
  }

  if (firstResultEntryClassId) {
    await makeResult({ entryClassId: firstResultEntryClassId, placement: 1, recordedBy: secretary.id });
  }

  // ── Invoice ──────────────────────────────────────────────────────────────
  await testDb.insert(schema.invoices).values({
    organisationId: org.id,
    showId: show.id,
    invoiceNumber: 'INV-TESTWUSV-0001',
    clubSlug: 'TESTWUSV',
    sequenceNumber: 1,
    viaRemiTotalPence: 6000,
    directTotalPence: 0,
    freeEntriesCount: 0,
    cardFeeTotalPence: 150,
    feeBearingChargeCount: 12,
    discountMode: 'percentage',
    discountValue: 10,
    discountLabel: 'Remi discount',
    discountTotalPence: 15,
    packageFeePence: 2500,
    packageFeeDescription: 'Regional package fee',
    costsTotalPence: 2650,
    netToClubPence: 3350,
    lineItems: {
      viaRemi: { title: 'Money collected by Remi', lines: [{ label: 'Entry fees', amountPence: 6000 }], totalLabel: 'Total via Remi', totalPence: 6000 },
      direct: { title: 'Paid direct to the club', lines: [], totalLabel: 'Total direct', totalPence: 0 },
      free: { title: 'Entries taken free of charge', lines: [], totalLabel: 'Total free', totalPence: 0 },
      totalEntriesLine: '12 via Remi + 0 direct = 12',
      costs: {
        title: 'Less Remi costs',
        lines: [
          { label: 'Card processing fee', amountPence: 150, isCredit: true },
          { label: 'Package fee', amountPence: 2500, isCredit: true },
        ],
        totalLabel: 'Total costs',
        totalPence: 2650,
      },
    },
    issuedByUserId: secretary.id,
  });

  console.log(`Built synthetic WUSV show ${show.id} — ${catalogueNumber - 1} entries across ${classes.length} classes.`);

  const fixture = await exportShowFixture(testDb, show.id, 'synthetic-wusv-regional');
  const outPath = path.join(process.cwd(), 'src/__tests__/golden/fixtures/synthetic-wusv-regional.json');
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
