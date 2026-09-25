#!/usr/bin/env -S npx tsx
/**
 * Build a realistic, entirely-synthetic RKC single-breed championship show
 * directly in remi_test (via the same factories.ts helpers the integration
 * suite uses), then export it through the REAL export-show-fixture-core.ts
 * code path and write the result as
 * src/__tests__/golden/fixtures/synthetic-rkc-champ.json.
 *
 * This exists so the export→loader→render pipeline is proven end-to-end
 * BEFORE the team lead ever runs scripts/export-show-fixture.ts against a
 * real show — see the golden-documents plan (2026-09-01).
 *
 * Shape: ~40 entries across 20 classes (9 dog age classes + 9 matching
 * bitch age classes + 1 Special Award Class + 1 Junior Handling class),
 * one show sponsor + one class sponsorship, two catalogue adverts (one
 * portrait, one landscape — exercises advert-orientation.ts), an issued
 * invoice, a recorded result, an absent entry, and NFC entries.
 *
 * Run with: npx tsx src/__tests__/golden/generate-synthetic-fixture.ts
 * (DATABASE_URL must point at localhost — same guard as the test suite.)
 */

// `@/server/db` reads process.env.DATABASE_URL at module-EVALUATION time
// (it opens the postgres.js pool as a top-level side effect), and ES module
// imports are hoisted ahead of any top-level statement in this file — so
// env vars must be loaded (mirroring vitest.config.ts's own approach)
// BEFORE anything that transitively imports '@/server/db' is imported. That
// means helpers/db and helpers/factories are dynamically imported inside
// main() below, after the env is loaded; everything else here is safe to
// import statically since it never touches the DB pool at import time.
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
import { buildPlaceholderAdvertDataUri } from '../../../scripts/lib/placeholder-image';

const AGE_CLASSES = [
  'Minor Puppy',
  'Puppy',
  'Junior',
  'Yearling',
  'Novice',
  'Undergraduate',
  'Graduate',
  'Post Graduate',
  'Limit',
  'Open',
];

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
    makeSponsor,
    makeResult,
    makeStewardAssignment,
    makeOrder,
  } = await import('../helpers/factories');

  await cleanDb();

  const breedGroup = await makeBreedGroup({ name: 'Pastoral' });
  const breed = await makeBreed({ name: 'German Shepherd Dog', groupId: breedGroup.id });

  const org = await makeOrg({ name: 'Test German Shepherd League', breedId: breed.id, showRuleset: 'rkc' });
  const secretary = await makeUser({ role: 'secretary', name: 'Test Secretary' });
  await makeMembership({ userId: secretary.id, organisationId: org.id });

  const [venueRow] = await testDb
    .insert(schema.venues)
    .values({
      name: 'Test Showground',
      address: '1 Test Lane, Test Town',
      postcode: 'TE1 1ST',
      organisationId: org.id,
    })
    .returning();

  const show = await makeShow({
    organisationId: org.id,
    name: 'Test German Shepherd League Championship Show 2030',
    showType: 'championship',
    showScope: 'single_breed',
    showRuleset: 'rkc',
    breedId: breed.id,
    venueId: venueRow!.id,
    startDate: '2030-06-14',
    endDate: '2030-06-14',
    status: 'entries_closed',
    secretaryUserId: secretary.id,
    secretaryName: 'Test Secretary',
    secretaryEmail: 'secretary@test.local',
    secretaryPhone: '01234 567890',
    kcLicenceNo: 'TEST/2030/001',
    scheduleData: {
      country: 'england',
      publicAdmission: true,
      wetWeatherAccommodation: true,
      acceptsNfc: true,
      judgedOnGroupSystem: false,
      showManager: 'Test Show Manager',
      officers: [{ name: 'Test Chair Person', position: 'Chair' }],
      guarantors: [{ name: 'Test Guarantor One' }],
      firstAiders: ['Test First Aider'],
      welcomeNote:
        'Welcome to our 2030 championship show — we hope you have a wonderful day with your dogs.',
      customStatements: ['OUTSIDE ATTRACTION - RKC RULE F(1) 16h WILL BE STRICTLY ENFORCED'],
      bestAwards: ['Best in Show', 'Best Puppy in Show', 'Best Veteran in Show'],
    },
  });

  await testDb
    .insert(schema.showBreeds)
    .values({ showId: show.id, breedId: breed.id, ccOffered: true, displayOrder: 0 });

  // ── Classes: 9 age classes x 2 sexes + 1 Special Award Class + 1 JH ──────
  let sortOrder = 0;
  let classNumber = 1;
  const dogShowClasses: { id: string; classDefId: string; label: string }[] = [];
  const bitchShowClasses: { id: string; classDefId: string; label: string }[] = [];

  for (const name of AGE_CLASSES) {
    const classDef = await makeClassDef({ name, type: 'age', sortOrder });
    const dogClass = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id, breedId: breed.id });
    await testDb
      .update(schema.showClasses)
      .set({ sex: 'dog', sortOrder, classNumber: classNumber++ })
      .where(eq(schema.showClasses.id, dogClass.id));
    dogShowClasses.push({ id: dogClass.id, classDefId: classDef.id, label: name });
    sortOrder++;
  }
  for (const name of AGE_CLASSES) {
    const classDefId = dogShowClasses.find((c) => c.label === name)!.classDefId;
    const bitchClass = await makeShowClass({ showId: show.id, classDefinitionId: classDefId, breedId: breed.id });
    await testDb
      .update(schema.showClasses)
      .set({ sex: 'bitch', sortOrder, classNumber: classNumber++ })
      .where(eq(schema.showClasses.id, bitchClass.id));
    bitchShowClasses.push({ id: bitchClass.id, classDefId, label: name });
    sortOrder++;
  }

  const sacClassDef = await makeClassDef({ name: 'Special Award Class A', type: 'special', sortOrder });
  const sacShowClass = await makeShowClass({ showId: show.id, classDefinitionId: sacClassDef.id, breedId: breed.id });
  await testDb
    .update(schema.showClasses)
    .set({ sortOrder, classNumber: classNumber++ })
    .where(eq(schema.showClasses.id, sacShowClass.id));
  sortOrder++;

  const jhClassDef = await makeClassDef({ name: 'Junior Handling', type: 'junior_handler', sortOrder });
  const jhShowClass = await makeShowClass({ showId: show.id, classDefinitionId: jhClassDef.id });
  await testDb
    .update(schema.showClasses)
    .set({ sortOrder, classNumber: classNumber++ })
    .where(eq(schema.showClasses.id, jhShowClass.id));

  // ── Judges + rings ───────────────────────────────────────────────────────
  const [ring1] = await testDb.insert(schema.rings).values({ showId: show.id, number: 1 }).returning();
  const [ring2] = await testDb.insert(schema.rings).values({ showId: show.id, number: 2 }).returning();

  const breedJudge = await makeJudge({ name: 'Test Breed Judge', kennelClubAffix: 'Testaffix', jepLevel: 6 });
  await makeJudgeAssignment({ showId: show.id, judgeId: breedJudge.id, breedId: breed.id, sex: 'dog', ringId: ring1!.id });
  await makeJudgeAssignment({ showId: show.id, judgeId: breedJudge.id, breedId: breed.id, sex: 'bitch', ringId: ring1!.id });

  const sacJudge = await makeJudge({ name: 'Test SAC Judge' });
  await makeJudgeAssignment({
    showId: show.id,
    judgeId: sacJudge.id,
    isSpecialAwardsClassesJudge: true,
    ringId: ring1!.id,
  });

  const jhJudge = await makeJudge({ name: 'Test JH Judge' });
  await makeJudgeAssignment({ showId: show.id, judgeId: jhJudge.id, ringId: ring2!.id });

  // ── Steward ──────────────────────────────────────────────────────────────
  const steward = await makeUser({ role: 'steward', name: 'Test Steward' });
  await makeStewardAssignment({ userId: steward.id, showId: show.id, ringId: ring1!.id });

  // ── Sponsor + class sponsorship ──────────────────────────────────────────
  const sponsor = await makeSponsor({ organisationId: org.id, name: 'Test Trade Sponsor', category: 'pet_food' });
  const [showSponsor] = await testDb
    .insert(schema.showSponsors)
    .values({ showId: show.id, sponsorId: sponsor.id, tier: 'show', customTitle: 'Proudly sponsored by Test Trade Sponsor' })
    .returning();
  await testDb.insert(schema.classSponsorships).values({
    showClassId: dogShowClasses[dogShowClasses.length - 1]!.id, // Open Dog
    showSponsorId: showSponsor!.id,
    trophyName: 'The Test Memorial Trophy',
    trophyDonor: 'Test Donor Family',
    prizeDescription: 'Rosette + trophy',
  });

  // ── Catalogue adverts — one portrait, one landscape ─────────────────────
  const portraitUri = await buildPlaceholderAdvertDataUri(827, 1169, 'advert-portrait');
  const landscapeUri = await buildPlaceholderAdvertDataUri(1169, 827, 'advert-landscape');
  await testDb.insert(schema.catalogueAdverts).values([
    {
      showId: show.id,
      advertiserName: 'Test Advertiser Portrait',
      document: 'catalogue',
      position: 'last_page',
      imageUrl: portraitUri,
      sortOrder: 0,
    },
    {
      showId: show.id,
      advertiserName: 'Test Advertiser Landscape',
      document: 'catalogue',
      position: 'inside_back',
      imageUrl: landscapeUri,
      sortOrder: 1,
    },
  ]);

  // ── Show donation + discount group + sundry item ────────────────────────
  await testDb.insert(schema.showDonations).values({ showId: show.id, donorName: 'Test Kind Donor', affix: 'Testkennel' });
  const [discountGroup] = await testDb
    .insert(schema.showDiscountGroups)
    .values({ showId: show.id, label: 'Members', firstEntryFeePence: 400, displayOrder: 0 })
    .returning();
  await testDb.insert(schema.sundryItems).values({ showId: show.id, name: 'Catalogue', priceInPence: 300, sortOrder: 0 });

  // ── Entries: 2 dogs per breed class (36), one exhibitor per dog ─────────
  const allBreedClasses = [
    ...dogShowClasses.map((c) => ({ ...c, sex: 'dog' as const })),
    ...bitchShowClasses.map((c) => ({ ...c, sex: 'bitch' as const })),
  ];
  let catalogueNumber = 1;

  for (const [i, cls] of allBreedClasses.entries()) {
    for (let dogIndex = 0; dogIndex < 2; dogIndex++) {
      const exhibitor = await makeUser({ role: 'exhibitor', name: `Test Exhibitor ${i}-${dogIndex}` });
      const isNfc = i === 0 && dogIndex === 0; // one NFC entry in the very first class
      const dog = await makeDog({
        ownerId: exhibitor.id,
        breedId: breed.id,
        sex: cls.sex,
        registeredName: `Test ${cls.sex === 'dog' ? 'Dog' : 'Bitch'} ${catalogueNumber} Of Testkennel`,
        kcRegNumber: `AB${String(1000000 + catalogueNumber).padStart(8, '0')}01`,
      });
      const entry = await makeEntry({
        showId: show.id,
        dogId: dog.id,
        exhibitorId: exhibitor.id,
        status: 'confirmed',
        isNfc,
      });
      await testDb
        .update(schema.entries)
        .set({ catalogueNumber: String(catalogueNumber) })
        .where(eq(schema.entries.id, entry.id));

      // First entry gets a real order referencing the discount group above —
      // regression coverage for the loader FK-ordering bug (orders must load
      // AFTER showDiscountGroups; see show-fixture.ts's file header).
      if (i === 0 && dogIndex === 0) {
        const order = await makeOrder({
          showId: show.id,
          exhibitorId: exhibitor.id,
          status: 'paid',
          discountGroupId: discountGroup!.id,
        });
        await testDb.update(schema.entries).set({ orderId: order.id }).where(eq(schema.entries.id, entry.id));
      }

      const isAbsent = i === allBreedClasses.length - 1 && dogIndex === 1; // last class, 2nd dog: absent
      const entryClass = await makeEntryClass({ entryId: entry.id, showClassId: cls.id, absent: isAbsent });

      // The Open Dog class's first dog also enters the Special Award Class
      // (a second entryClasses row on the same entry) and gets a recorded
      // result — exercises the marked catalogue + SAC judge carve-out, AND
      // the multi-class-entry ordering fix (class-labels.ts's
      // sortEntryClassesByShowClassOrder, applied in the reports route and
      // report-queries.ts) with real data. This combination used to make
      // the reports' per-dog "Classes" column nondeterministic across
      // identical renders — see src/__tests__/integration/
      // report-entry-classes-order.test.ts for the isolated repro/fix.
      if (cls.label === 'Open' && cls.sex === 'dog' && dogIndex === 0) {
        await makeEntryClass({ entryId: entry.id, showClassId: sacShowClass.id });
        await makeResult({ entryClassId: entryClass.id, placement: 1, recordedBy: secretary.id });
      }

      catalogueNumber++;
    }
  }

  // ── Junior Handling entries (dogId null, entryType junior_handler) ──────
  for (let i = 0; i < 3; i++) {
    const exhibitor = await makeUser({ role: 'exhibitor', name: `Test JH Handler ${i}` });
    const [entry] = await testDb
      .insert(schema.entries)
      .values({
        showId: show.id,
        dogId: null,
        exhibitorId: exhibitor.id,
        status: 'confirmed',
        entryType: 'junior_handler',
        totalFee: 500,
        catalogueNumber: String(catalogueNumber),
      })
      .returning();
    await testDb.insert(schema.juniorHandlerDetails).values({
      entryId: entry!.id,
      handlerName: `Test JH Handler ${i}`,
      dateOfBirth: '2015-01-01',
    });
    await makeEntryClass({ entryId: entry!.id, showClassId: jhShowClass.id });
    catalogueNumber++;
  }

  // ── Invoice ──────────────────────────────────────────────────────────────
  await testDb.insert(schema.invoices).values({
    organisationId: org.id,
    showId: show.id,
    invoiceNumber: 'INV-TESTGSL-0001',
    clubSlug: 'TESTGSL',
    sequenceNumber: 1,
    viaRemiTotalPence: 18000,
    directTotalPence: 0,
    freeEntriesCount: 0,
    cardFeeTotalPence: 450,
    feeBearingChargeCount: 20,
    discountMode: 'percentage',
    discountValue: 10,
    discountLabel: 'Remi discount',
    discountTotalPence: 45,
    packageFeePence: 5000,
    packageFeeDescription: 'Standard package fee',
    costsTotalPence: 5405,
    netToClubPence: 12595,
    lineItems: {
      viaRemi: { title: 'Money collected by Remi', lines: [{ label: 'Entry fees', amountPence: 18000 }], totalLabel: 'Total via Remi', totalPence: 18000 },
      direct: { title: 'Paid direct to the club', lines: [], totalLabel: 'Total direct', totalPence: 0 },
      free: { title: 'Entries taken free of charge', lines: [], totalLabel: 'Total free', totalPence: 0 },
      totalEntriesLine: '39 via Remi + 0 direct = 39 (including 3 junior handlers and 1 not-for-competition)',
      costs: {
        title: 'Less Remi costs',
        lines: [
          { label: 'Card processing fee', amountPence: 450, isCredit: true },
          { label: 'Package fee', amountPence: 5000, isCredit: true },
        ],
        totalLabel: 'Total costs',
        totalPence: 5405,
      },
    },
    issuedByUserId: secretary.id,
  });

  console.log(`Built synthetic show ${show.id} — ${catalogueNumber - 1} entries across ${sortOrder + 1} classes.`);

  const fixture = await exportShowFixture(testDb, show.id, 'synthetic-rkc-champ');
  const outPath = path.join(process.cwd(), 'src/__tests__/golden/fixtures/synthetic-rkc-champ.json');
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
