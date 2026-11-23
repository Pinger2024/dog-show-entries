#!/usr/bin/env -S npx tsx
/**
 * Two deliberately extreme synthetic RKC shows, built to prove the
 * front-matter-on-kit Phase B adaptive behaviour actually adapts rather
 * than just working by luck on the real shows captured so far:
 *
 *  - "stress" (synthetic-stress-rkc-champ): 30 first aiders, 30 officers,
 *    12 guarantors, a 60-character club name, a 2,000-character welcome
 *    note, 200 exhibitors (one dog each) across 40 breed classes with
 *    full class definitions, 40 class sponsorships, and 10 Not-For-
 *    Competition dogs.
 *  - "sparse" (synthetic-sparse-rkc-open): the opposite extreme — 2
 *    first aiders, no sponsors, no welcome note, a handful of classes and
 *    entries.
 *
 * See src/__tests__/golden/invariants.test.ts for the assertions these
 * exist to prove (page bounds, no near-blank pages, no orphaned headings)
 * — and their proof-red output (a Phase B change temporarily reverted,
 * confirming the invariant actually catches the regression it targets)
 * recorded in research/evidence-front-matter-on-kit-2026-09-02/.
 *
 * Run with: npx tsx src/__tests__/golden/generate-stress-sparse-fixtures.ts
 * (DATABASE_URL must point at localhost — same guard as the other
 * golden fixture generators.)
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

/** Exactly 60 characters — a club name long enough to force CoverPage's
 *  FitText to actually shrink the organisation name in the top band. */
const STRESS_CLUB_NAME = 'The German Shepherd Dog Club Of Greater Testington Districts'; // 60 chars exactly, checked below

if (STRESS_CLUB_NAME.length !== 60) {
  throw new Error(`STRESS_CLUB_NAME must be exactly 60 characters, got ${STRESS_CLUB_NAME.length}`);
}

/** Exactly 2,000 characters — long enough that ShowInformationContent's
 *  Welcome block cannot possibly stay atomic on one page. */
function buildWelcomeNote(): string {
  const sentence =
    'We are delighted to welcome every exhibitor to this championship show and hope you and your dogs have a wonderful, friendly and well-run day with us. ';
  let text = '';
  while (text.length < 2000) text += sentence;
  return text.slice(0, 2000);
}

const CLASS_DEFS: Array<{ name: string; description: string }> = [
  { name: 'Minor Puppy', description: 'For dogs of six and not exceeding nine calendar months of age on the first day of the Show.' },
  { name: 'Puppy', description: 'For dogs of six and not exceeding twelve calendar months of age on the first day of the Show.' },
  { name: 'Junior', description: 'For dogs of six and not exceeding eighteen calendar months of age on the first day of the Show.' },
  { name: 'Special Long Coat Junior', description: 'For Long Coat dogs of six and not exceeding eighteen calendar months of age on the first day of the Show.' },
  { name: 'Yearling', description: 'For dogs of twelve and not exceeding twenty-four calendar months of age on the first day of the Show.' },
  { name: 'Novice', description: 'For dogs which have not won a First Prize at a Championship Show, in Novice or in a higher class, confined to Novice, Junior, Puppy or Minor Puppy Classes.' },
  { name: 'Undergraduate', description: 'For dogs which have not won five or more First Prizes at Championship Shows in Undergraduate or higher classes.' },
  { name: 'Graduate', description: 'For dogs which have not won five or more First Prizes at Championship Shows in Graduate, Post Graduate, Minor Limit, Mid Limit, Limit or Open Classes.' },
  { name: 'Post Graduate', description: 'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or five or more First Prizes at Championship Shows in Post Graduate, Minor Limit, Mid Limit, Limit and Open Classes, whether restricted or not, where Challenge Certificates were offered for the breed.' },
  { name: 'Minor Limit', description: 'For dogs which have not become Show Champions and have not won ten or more First Prizes at Championship Shows in Minor Limit, Mid Limit, Limit or Open Classes, whether restricted or not, where Challenge Certificates were offered for the breed.' },
  { name: 'Mid Limit', description: 'For dogs which have not become Show Champions and have not won seven or more First Prizes at Championship Shows in Mid Limit, Limit or Open Classes, whether restricted or not, where Challenge Certificates were offered for the breed.' },
  { name: 'Limit', description: 'For dogs which have not become Show Champions under Royal Kennel Club Regulations or under the rules of any governing body recognised by the Royal Kennel Club or won seven or more First Prizes in all at Championship Shows in Limit or Open Classes confined to the breed, whether restricted or not, at Shows where Challenge Certificates were offered for the breed.' },
  { name: 'Open', description: 'For all dogs of the breeds for which the class is provided and eligible for entry at the Show.' },
  { name: 'Special Long Coat Open', description: 'For all Long Coat dogs of the breed eligible for entry at the Show.' },
  { name: 'Veteran', description: 'For dogs of not less than seven years of age on the first day of the Show.' },
  { name: 'Champion Stakes', description: 'For dogs which have become Show Champions or gained the title of Champion in the country of origin or residence.' },
  { name: 'Special Award Class - Puppy', description: 'For dogs eligible for entry in Special Award Classes, whether restricted or not. They are not eligible for Challenge Certificates.' },
  { name: 'Special Award Class - Junior', description: 'For dogs of eight and not exceeding eighteen calendar months of age on the first day of the Show. They are not eligible for Challenge Certificates.' },
  { name: 'Special Award Class - Post Graduate', description: 'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or five or more First Prizes at Championship Shows, whether restricted or not. They are not eligible for Challenge Certificates.' },
  { name: 'Special Award Class - Open', description: 'For all dogs of the breed for which the class is provided and eligible for entry at the Show. They are not eligible for Challenge Certificates.' },
  { name: 'Junior Handling', description: 'Junior Handling Association class for handlers of six and not exceeding twenty-four years. JHA membership required.' },
];

async function buildStressShow() {
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
  } = await import('../helpers/factories');

  await cleanDb();

  const breedGroup = await makeBreedGroup({ name: 'Pastoral' });
  const breed = await makeBreed({ name: 'German Shepherd Dog', groupId: breedGroup.id });
  const org = await makeOrg({ name: STRESS_CLUB_NAME, breedId: breed.id, showRuleset: 'rkc' });
  const secretary = await makeUser({ role: 'secretary', name: 'Test Stress Secretary' });
  await makeMembership({ userId: secretary.id, organisationId: org.id });

  const [venueRow] = await testDb
    .insert(schema.venues)
    .values({ name: 'Test Stress Showground', address: '1 Test Stress Lane', postcode: 'TE9 9ST', organisationId: org.id })
    .returning();

  const firstAiders = Array.from({ length: 30 }, (_, i) => `Test First Aider ${i + 1}`);
  const officers = Array.from({ length: 30 }, (_, i) => ({ name: `Test Officer ${i + 1}`, position: `Committee Role ${i + 1}` }));
  const guarantors = Array.from({ length: 12 }, (_, i) => ({ name: `Test Guarantor ${i + 1}` }));

  const show = await makeShow({
    organisationId: org.id,
    name: 'Test Stress Championship Show 2030',
    showType: 'championship',
    showScope: 'single_breed',
    showRuleset: 'rkc',
    breedId: breed.id,
    venueId: venueRow!.id,
    startDate: '2030-07-12',
    endDate: '2030-07-12',
    status: 'entries_closed',
    secretaryUserId: secretary.id,
    secretaryName: 'Test Stress Secretary',
    secretaryEmail: 'stress-secretary@test.local',
    secretaryPhone: '01234 999000',
    kcLicenceNo: 'TEST/2030/STRESS',
    scheduleData: {
      country: 'england',
      publicAdmission: true,
      wetWeatherAccommodation: true,
      acceptsNfc: true,
      judgedOnGroupSystem: false,
      showManager: 'Test Stress Show Manager',
      officers,
      guarantors,
      firstAiders,
      welcomeNote: buildWelcomeNote(),
      customStatements: ['OUTSIDE ATTRACTION - RKC RULE F(1) 16h WILL BE STRICTLY ENFORCED'],
      bestAwards: ['Best in Show', 'Reserve Best in Show', 'Best Puppy in Show', 'Best Veteran in Show'],
    },
  });

  await testDb.insert(schema.showBreeds).values({ showId: show.id, breedId: breed.id, ccOffered: true, displayOrder: 0 });

  // ── 20 class definitions x 2 sexes = 40 breed classes ───────────────────
  let sortOrder = 0;
  let classNumber = 1;
  const breedShowClasses: { id: string; sex: 'dog' | 'bitch'; label: string }[] = [];
  for (const def of CLASS_DEFS.slice(0, -1)) {
    // last entry (Junior Handling) handled separately below — no sex split
    const classDef = await makeClassDef({ name: def.name, description: def.description, type: 'age', sortOrder });
    for (const sex of ['dog', 'bitch'] as const) {
      const sc = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id, breedId: breed.id });
      await testDb.update(schema.showClasses).set({ sex, sortOrder, classNumber: classNumber++ }).where(eq(schema.showClasses.id, sc.id));
      breedShowClasses.push({ id: sc.id, sex, label: def.name });
    }
    sortOrder++;
  }

  const jhDef = CLASS_DEFS[CLASS_DEFS.length - 1]!;
  const jhClassDef = await makeClassDef({ name: jhDef.name, description: jhDef.description, type: 'junior_handler', sortOrder });
  const jhShowClass = await makeShowClass({ showId: show.id, classDefinitionId: jhClassDef.id });
  await testDb.update(schema.showClasses).set({ sortOrder, classNumber: classNumber++ }).where(eq(schema.showClasses.id, jhShowClass.id));

  // ── Judges + ring ────────────────────────────────────────────────────────
  const [ring1] = await testDb.insert(schema.rings).values({ showId: show.id, number: 1 }).returning();
  const breedJudge = await makeJudge({ name: 'Test Stress Breed Judge' });
  await makeJudgeAssignment({ showId: show.id, judgeId: breedJudge.id, breedId: breed.id, sex: 'dog', ringId: ring1!.id });
  await makeJudgeAssignment({ showId: show.id, judgeId: breedJudge.id, breedId: breed.id, sex: 'bitch', ringId: ring1!.id });
  const jhJudge = await makeJudge({ name: 'Test Stress JH Judge' });
  await makeJudgeAssignment({ showId: show.id, judgeId: jhJudge.id, ringId: ring1!.id });

  // ── Sponsor + 40 class sponsorships (one per breed class) ───────────────
  const sponsor = await makeSponsor({ organisationId: org.id, name: 'Test Stress Trade Sponsor', category: 'pet_food' });
  const [showSponsor] = await testDb
    .insert(schema.showSponsors)
    .values({ showId: show.id, sponsorId: sponsor.id, tier: 'show', customTitle: 'Proudly sponsored by Test Stress Trade Sponsor' })
    .returning();
  for (const [i, cls] of breedShowClasses.entries()) {
    await testDb.insert(schema.classSponsorships).values({
      showClassId: cls.id,
      showSponsorId: showSponsor!.id,
      trophyName: `The Test Stress Memorial Trophy ${i + 1}`,
      trophyDonor: `Test Stress Donor Family ${i + 1}`,
      prizeDescription: 'Rosette + trophy',
    });
  }

  // ── 200 exhibitors, one dog each, across the 40 breed classes ───────────
  // 5 dogs per class x 40 classes = 200. 10 of them (one per every 4th
  // class's first dog... simplified: first dog of the first 10 classes)
  // are Not For Competition.
  let catalogueNumber = 1;
  for (const [classIdx, cls] of breedShowClasses.entries()) {
    for (let dogIndex = 0; dogIndex < 5; dogIndex++) {
      const exhibitor = await makeUser({ role: 'exhibitor', name: `Test Stress Exhibitor ${catalogueNumber}` });
      const isNfc = classIdx < 10 && dogIndex === 0;
      const dog = await makeDog({
        ownerId: exhibitor.id,
        breedId: breed.id,
        sex: cls.sex,
        registeredName: `Test Stress ${cls.sex === 'dog' ? 'Dog' : 'Bitch'} ${catalogueNumber} Of Testkennel`,
        kcRegNumber: `ST${String(1000000 + catalogueNumber).padStart(8, '0')}01`,
      });
      const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed', isNfc });
      await testDb.update(schema.entries).set({ catalogueNumber: String(catalogueNumber) }).where(eq(schema.entries.id, entry.id));
      await makeEntryClass({ entryId: entry.id, showClassId: cls.id });
      catalogueNumber++;
    }
  }

  // ── Junior Handling entries ──────────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const exhibitor = await makeUser({ role: 'exhibitor', name: `Test Stress JH Handler ${i + 1}` });
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
      handlerName: `Test Stress JH Handler ${i + 1}`,
      dateOfBirth: '2015-01-01',
    });
    await makeEntryClass({ entryId: entry!.id, showClassId: jhShowClass.id });
    catalogueNumber++;
  }

  console.log(`Built stress show ${show.id} — ${catalogueNumber - 1} entries across ${breedShowClasses.length + 1} classes.`);

  const fixture = await exportShowFixture(testDb, show.id, 'synthetic-stress-rkc-champ');
  const outPath = path.join(process.cwd(), 'src/__tests__/golden/fixtures/synthetic-stress-rkc-champ.json');
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
}

async function buildSparseShow() {
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
  } = await import('../helpers/factories');

  await cleanDb();

  const breedGroup = await makeBreedGroup({ name: 'Pastoral' });
  const breed = await makeBreed({ name: 'German Shepherd Dog', groupId: breedGroup.id });
  const org = await makeOrg({ name: 'Test Sparse Club', breedId: breed.id, showRuleset: 'rkc' });
  const secretary = await makeUser({ role: 'secretary', name: 'Test Sparse Secretary' });
  await makeMembership({ userId: secretary.id, organisationId: org.id });

  const [venueRow] = await testDb
    .insert(schema.venues)
    .values({ name: 'Test Sparse Hall', address: '1 Test Sparse Lane', postcode: 'TE0 0ST', organisationId: org.id })
    .returning();

  const show = await makeShow({
    organisationId: org.id,
    name: 'Test Sparse Open Show 2030',
    showType: 'open',
    showScope: 'single_breed',
    showRuleset: 'rkc',
    breedId: breed.id,
    venueId: venueRow!.id,
    startDate: '2030-04-05',
    endDate: '2030-04-05',
    status: 'entries_closed',
    secretaryUserId: secretary.id,
    secretaryName: 'Test Sparse Secretary',
    secretaryEmail: 'sparse-secretary@test.local',
    secretaryPhone: '01234 111000',
    kcLicenceNo: 'TEST/2030/SPARSE',
    scheduleData: {
      country: 'england',
      publicAdmission: true,
      wetWeatherAccommodation: true,
      acceptsNfc: false,
      judgedOnGroupSystem: false,
      firstAiders: ['Test Sparse First Aider 1', 'Test Sparse First Aider 2'],
      // Deliberately no welcomeNote, no officers/guarantors, no sponsors,
      // no bestAwards — the opposite extreme from the stress fixture.
    },
  });

  await testDb.insert(schema.showBreeds).values({ showId: show.id, breedId: breed.id, ccOffered: false, displayOrder: 0 });

  let sortOrder = 0;
  let classNumber = 1;
  const showClasses: { id: string; sex: 'dog' | 'bitch' }[] = [];
  for (const name of ['Puppy', 'Open']) {
    const classDef = await makeClassDef({ name, type: 'age', sortOrder });
    for (const sex of ['dog', 'bitch'] as const) {
      const sc = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id, breedId: breed.id });
      await testDb.update(schema.showClasses).set({ sex, sortOrder, classNumber: classNumber++ }).where(eq(schema.showClasses.id, sc.id));
      showClasses.push({ id: sc.id, sex });
    }
    sortOrder++;
  }

  const [ring1] = await testDb.insert(schema.rings).values({ showId: show.id, number: 1 }).returning();
  const judge = await makeJudge({ name: 'Test Sparse Judge' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: 'dog', ringId: ring1!.id });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: 'bitch', ringId: ring1!.id });

  let catalogueNumber = 1;
  for (const cls of showClasses) {
    for (let dogIndex = 0; dogIndex < 2; dogIndex++) {
      const exhibitor = await makeUser({ role: 'exhibitor', name: `Test Sparse Exhibitor ${catalogueNumber}` });
      const dog = await makeDog({
        ownerId: exhibitor.id,
        breedId: breed.id,
        sex: cls.sex,
        registeredName: `Test Sparse ${cls.sex === 'dog' ? 'Dog' : 'Bitch'} ${catalogueNumber} Of Testkennel`,
      });
      const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
      await testDb.update(schema.entries).set({ catalogueNumber: String(catalogueNumber) }).where(eq(schema.entries.id, entry.id));
      await makeEntryClass({ entryId: entry.id, showClassId: cls.id });
      catalogueNumber++;
    }
  }

  console.log(`Built sparse show ${show.id} — ${catalogueNumber - 1} entries across ${showClasses.length} classes.`);

  const fixture = await exportShowFixture(testDb, show.id, 'synthetic-sparse-rkc-open');
  const outPath = path.join(process.cwd(), 'src/__tests__/golden/fixtures/synthetic-sparse-rkc-open.json');
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
}

async function main() {
  await buildStressShow();
  await buildSparseShow();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
