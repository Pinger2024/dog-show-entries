/**
 * End-to-end test for the SV / WUSV "regional" show pipeline on the demo DB.
 *
 * Walks one show through the same procedures the live secretary + exhibitor
 * journeys use:
 *   1. Cleans any previous E2E SV show
 *   2. Creates the show via `shows.create` as the SV org's secretary
 *      → verifies the 28-row auto-class build (7 ages × 4 sex/coat combos)
 *   3. Populates the schedule_data (officers, regulations, BRG colours, etc.)
 *   4. Opens entries
 *   5. Seeds 24 exhibitors / 32 GSD dogs with varied ages, coats, and SV
 *      health profiles (a couple deliberately missing health data so we
 *      can exercise the Yearling/Adult/Working gate)
 *   6. Enters each dog via `entries.create` — verifies the coat-type +
 *      health gates as we go
 *   7. Renders the SV schedule PDF (the six-page Sieger document) and the
 *      standard catalogue (no dedicated SV catalogue yet — Amanda's
 *      backlog)
 *   8. Prints a punch list: classes built, dogs entered, gate hits,
 *      PDF page counts, anything that didn't match expectation.
 *
 * Refuses to run against anything other than `remi_demo` so it can't
 * accidentally wreck prod.
 *
 *   npx tsx scripts/e2e-sv-fulltest.ts
 */
import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, and, sql } from 'drizzle-orm';
import * as s from '@/server/db/schema/index.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { generateCataloguePdf, generateSchedulePdf } from '@/server/services/pdf-generation.js';
import { padPdfToMultiple } from '@/lib/pdf-pad.js';
import { createCaller } from '@/server/trpc/router.js';
import { allowedSvGradesForClass } from '@/lib/sv-grading.js';

// ── Demo-only safety check ────────────────────────────────
const DEMO_URL_HINT = 'remi_demo';
const dbUrl = process.env.DATABASE_URL ?? '';
if (!dbUrl.includes(DEMO_URL_HINT)) {
  throw new Error(
    `Refusing to run against non-demo DATABASE_URL. Set DATABASE_URL to point at remi_demo (contains "${DEMO_URL_HINT}").`,
  );
}

// ── Known demo IDs ────────────────────────────────────────
const MIDLAND_REGIONAL_ORG_ID = 'a9ea0936-0035-460a-b22f-b91bf7d97938';
const MANDY_DEMO_USER_ID = 'f53b1958-443b-4c83-9f6d-72d5af87d46e';
const GSD_BREED_ID = '858b16ec-0b76-44e8-89a4-c332dd43c1dd';

const SHOW_NAME = 'E2E SV Regional Test Show';

const uuid = () => crypto.randomUUID();
const pence = (p: number) => p * 100;
const today = new Date();
const futureDate = (daysAhead: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysAhead);
  return d;
};
const dateStr = (daysAhead: number) => futureDate(daysAhead).toISOString().slice(0, 10);

interface Punch {
  level: 'ok' | 'warn' | 'fail';
  area: string;
  msg: string;
}
const punch: Punch[] = [];
const log = (msg: string) => console.log(msg);
const ok = (area: string, msg: string) => {
  punch.push({ level: 'ok', area, msg });
  log(`  ✓ ${msg}`);
};
const warn = (area: string, msg: string) => {
  punch.push({ level: 'warn', area, msg });
  log(`  ⚠ ${msg}`);
};
const fail = (area: string, msg: string) => {
  punch.push({ level: 'fail', area, msg });
  log(`  ✗ ${msg}`);
};

// ── Cleanup any prior E2E SV show ─────────────────────────
async function cleanExisting(showName: string) {
  if (!db) throw new Error('no db');
  const existing = await db
    .select({ id: s.shows.id })
    .from(s.shows)
    .where(eq(s.shows.name, showName));
  if (existing.length === 0) return;
  log(`  cleaning ${existing.length} prior SV test show(s)…`);
  for (const { id } of existing) {
    await db.delete(s.entryClasses).where(
      sql`${s.entryClasses.entryId} IN (SELECT id FROM entries WHERE show_id = ${id})`,
    );
    await db.delete(s.payments).where(
      sql`${s.payments.orderId} IN (SELECT id FROM orders WHERE show_id = ${id})`,
    );
    await db.delete(s.entries).where(eq(s.entries.showId, id));
    await db.delete(s.orders).where(eq(s.orders.showId, id));
    await db.delete(s.showClasses).where(eq(s.showClasses.showId, id));
    await db.delete(s.judgeAssignments).where(eq(s.judgeAssignments.showId, id));
    await db.delete(s.rings).where(eq(s.rings.showId, id));
    await db.delete(s.sundryItems).where(eq(s.sundryItems.showId, id));
    await db.delete(s.shows).where(eq(s.shows.id, id));
  }
}

// ── Test data ─────────────────────────────────────────────
const FIRST_NAMES = [
  'Klaus', 'Sabine', 'Heinrich', 'Margit', 'Wolfgang', 'Helga',
  'Manfred', 'Brigitte', 'Werner', 'Erika', 'Ursula', 'Dieter',
  'Renate', 'Otto', 'Ingrid', 'Hans', 'Christa', 'Karl',
  'Monika', 'Lars', 'Anneliese', 'Stefan', 'Ute', 'Gerhard',
];
const SURNAMES = [
  'Schmidt', 'Müller', 'Schneider', 'Fischer', 'Weber', 'Wagner',
  'Becker', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter',
  'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun',
];
const KENNELS = [
  'vom Adlerstein', 'vom Schwarzwald', 'vom Rheinhof', 'vom Eichental',
  'von der Eichenburg', 'vom Bergkristall', 'von der Wolfshöhle',
  'vom Hammerschmied', 'vom Burgblick', 'aus der Kraichgaustadt',
  'vom Donautal', 'vom Lechrain', 'vom Sonnenhang', 'vom Falkenhorst',
];
const REG_SUFFIXES = [
  'Adler', 'Schatten', 'Sturm', 'Donner', 'Blitz', 'Wolke', 'Fels',
  'Stern', 'Sonne', 'Mond', 'Schwert', 'Schild', 'Krieger', 'Held',
];
const COLOURS = ['Black & Tan', 'Sable', 'Bi-colour', 'Black', 'Black & Red'];

interface SeededDog {
  dogId: string;
  ownerId: string;
  ownerName: string;
  registeredName: string;
  sex: 'dog' | 'bitch';
  coatType: 'stock' | 'long_stock';
  ageMonths: number;
  hasFullHealth: boolean;
}

// Age buckets matching the SV age defs:
// Baby Puppy 4-6, Minor Puppy 6-9, Puppy 9-12, Junior 12-18, Yearling 18-24,
// Adult 24+, Working 24+. We seed across the spread.
const AGE_BUCKETS_MONTHS = [5, 7, 10, 14, 20, 30, 36, 48];

async function main() {
  if (!db) throw new Error('no db');

  log(`\n── SV regional E2E — demo DB ──`);
  await cleanExisting(SHOW_NAME);

  // The secretary's tRPC caller (Mandy is admin + member of the SV org)
  const mandy = await db.query.users.findFirst({
    where: eq(s.users.id, MANDY_DEMO_USER_ID),
  });
  if (!mandy) throw new Error('Mandy demo user not found — re-seed demo first');
  const secCaller = createCaller({
    db,
    session: { user: { id: mandy.id, email: mandy.email, name: mandy.name ?? '', role: mandy.role } },
    impersonating: null,
    callerIsAdmin: mandy.role === 'admin',
  });

  // ── 1. SHOW CREATION via shows.create (real procedure) ─
  log('\n[1/7] Show creation via shows.create');
  const startDate = dateStr(45);
  const created = await secCaller.shows.create({
    name: SHOW_NAME,
    showType: 'championship',
    showScope: 'single_breed',
    showRuleset: 'wusv',
    organisationId: MIDLAND_REGIONAL_ORG_ID,
    breedId: GSD_BREED_ID,
    startDate,
    endDate: startDate,
    classSexArrangement: 'separate_sex',
    firstEntryFee: pence(25),
  });
  const showId = created.id;
  ok('show', `created ${SHOW_NAME} (${showId.slice(0, 8)}…)`);

  // Verify auto-class build: 7 age defs × 4 combos = 28 rows
  const autoClasses = await db.query.showClasses.findMany({
    where: eq(s.showClasses.showId, showId),
    with: { classDefinition: true },
  });
  if (autoClasses.length === 28) {
    ok('classes', `auto-created ${autoClasses.length} SV classes (7 ages × 4 sex/coat)`);
  } else {
    fail('classes', `expected 28 SV classes, got ${autoClasses.length}`);
  }
  // Spot-check: every class should have svCoatType and sex set, classNumber 1..28
  const missingCoat = autoClasses.filter((c) => !c.svCoatType);
  const missingSex = autoClasses.filter((c) => !c.sex);
  if (missingCoat.length > 0) fail('classes', `${missingCoat.length} classes missing svCoatType`);
  if (missingSex.length > 0) fail('classes', `${missingSex.length} classes missing sex`);

  // ── 2. SCHEDULE METADATA ──────────────────────────────
  log('\n[2/7] Schedule metadata');
  await db
    .update(s.shows)
    .set({
      startTime: '09:30',
      showOpenTime: '08:00',
      entriesOpenDate: new Date(),
      entryCloseDate: futureDate(30),
      kcLicenceNo: 'SV/2026/E2E-DEMO',
      secretaryName: 'Mandy McAteer',
      secretaryEmail: 'mandy@hundarkgsd.co.uk',
      secretaryPhone: '07921861089',
      secretaryAddress: 'Fortissat House, Shotts, ML7 4NS',
      onCallVet: 'Midlands Vet Hospital — 0121 555 0123',
      description:
        'End-to-end test of the SV regional pipeline. Full schedule + entry roster seeded for visual catalogue + schedule verification.',
      scheduleData: {
        country: 'england',
        publicAdmission: true,
        wetWeatherAccommodation: true,
        isBenched: true,
        latestArrivalTime: '08:45',
        showManager: 'Helmut Bauer',
        officers: [
          { name: 'Helmut Bauer', position: 'Chairperson' },
          { name: 'Mandy McAteer', position: 'Show Secretary' },
          { name: 'Sabine Schmidt', position: 'Treasurer' },
          { name: 'Klaus Weber', position: 'Ring Steward' },
        ],
        welcomeNote:
          'Welcome to this WUSV-style regional. Judging will follow SV protocol — Stock Coat (a) and Long Stock Coat (b) judged separately within each class.',
        catering: 'Hot food and refreshments on site all day. Beer garden from 16:00.',
        directions: 'Postcode B98 8UF. Free parking on the field; show ring entrances signposted.',
        additionalNotes:
          'This is a subject-to-WUSV-approval test event. Critique sheets will be handed to handlers at ringside.',
      },
      status: 'entries_open',
    })
    .where(eq(s.shows.id, showId));
  ok('schedule', 'metadata populated and entries_open');

  // ── 3. RING + JUDGE ───────────────────────────────────
  log('\n[3/7] Ring + judges');
  const ringId = uuid();
  await db.insert(s.rings).values({ id: ringId, showId, number: 1, startTime: '09:30' });
  const judgeId = uuid();
  await db.insert(s.judges).values({
    id: judgeId,
    name: 'Herr Friedrich Zellinger',
    contactEmail: 'zellinger.test@e2e.local',
    bio:
      'SV-anerkannter Spezialrichter mit über 30 Jahren Erfahrung im deutschen Schäferhund. Has judged at WUSV regional and national levels across Germany, Austria and the UK.',
  });
  await db
    .insert(s.judgeAssignments)
    .values({ showId, judgeId, breedId: GSD_BREED_ID, ringId });
  ok('judges', '1 SV breed specialist assigned to ring 1');

  // ── 4. SEED EXHIBITORS + DOGS ─────────────────────────
  log('\n[4/7] Exhibitors + dogs');
  const seededDogs: SeededDog[] = [];

  for (let i = 0; i < 24; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = SURNAMES[(i + 5) % SURNAMES.length];
    const name = `${first} ${last}`;
    const email = `e2e.sv.${first.toLowerCase()}.${last.toLowerCase()}.${i}@test.demo.local`;
    let userId: string;
    const existing = await db.query.users.findFirst({ where: eq(s.users.email, email) });
    if (existing) {
      userId = existing.id;
    } else {
      userId = uuid();
      await db.insert(s.users).values({
        id: userId,
        email,
        name,
        postcode: `B${(i % 90) + 10} ${(i % 9) + 1}AB`,
        role: 'exhibitor',
        onboardingCompletedAt: new Date(),
      });
      await db.insert(s.userSvProfile).values({
        userId,
        wusvClub: i % 3 === 0 ? 'gsdl' : i % 3 === 1 ? 'bagsd' : 'gsdl_brg',
        wusvMembershipNumber: `WUSV-E2E-${1000 + i}`,
      });
    }

    // 1-2 dogs per exhibitor
    const dogCount = i % 3 === 0 ? 2 : 1;
    for (let d = 0; d < dogCount; d++) {
      const dogSex = ((i + d) % 2 === 0 ? 'dog' : 'bitch') as 'dog' | 'bitch';
      const coatType = ((i + d) % 4 === 0 ? 'long_stock' : 'stock') as 'stock' | 'long_stock';
      const ageMonths = AGE_BUCKETS_MONTHS[(i + d * 2) % AGE_BUCKETS_MONTHS.length]!;
      const dob = (() => {
        const x = new Date(today);
        x.setMonth(x.getMonth() - ageMonths);
        return x.toISOString().slice(0, 10);
      })();
      const kennel = KENNELS[(i * 2 + d) % KENNELS.length];
      const suffix = REG_SUFFIXES[(i + d) % REG_SUFFIXES.length];
      const registeredName = `${suffix} ${kennel}`;
      const dogId = uuid();

      await db.insert(s.dogs).values({
        id: dogId,
        registeredName,
        breedId: GSD_BREED_ID,
        sex: dogSex,
        dateOfBirth: dob,
        coatType,
        sireName: `Vater ${kennel}`,
        damName: `Mutter ${kennel}`,
        breederName: `${last} kennels`,
        colour: COLOURS[(i + d) % COLOURS.length],
        kcRegNumber: `SVE2E${Date.now().toString(36)}${i.toString(36)}${d}`,
        // Every SV exhibit must have a published microchip (Amanda 2026-05-28).
        microchipNumber: `956000${String(100000 + i * 10 + d).slice(-6)}`,
        ownerId: userId,
      });
      await db.insert(s.dogOwners).values({
        dogId,
        userId,
        ownerName: name,
        ownerAddress: `${i + 1} Birmingham Road, Solihull, B91 ${(d % 9) + 1}AA`,
        ownerEmail: email,
        sortOrder: 0,
      });

      // Health profile — full for most, deliberately missing for the
      // last two dogs in each "needs-health" bracket so we can fire
      // the validation gate.
      const needsHealth = ageMonths >= 18; // Yearling+
      const hasFullHealth = !(needsHealth && i % 12 === 11);
      if (hasFullHealth) {
        await db.insert(s.dogSvProfile).values({
          dogId,
          hipGrade: 'normal',
          hipScore: 'a1',
          elbowGrade: 'normal',
          elbowScore: '0',
          haemophiliaClear: 'yes',
          dmTest: 'clear',
          koerung: ageMonths >= 24 ? 'lebenzeit' : 'none',
          dna: 'recorded',
          breedSurveyClass: ageMonths >= 30 ? 'KKL1' : null,
          breedSurveyYear: ageMonths >= 30 ? 2024 : null,
          breedSurveyor: ageMonths >= 30 ? 'Herr Hans Müller' : null,
          workingTitle: ageMonths >= 30 ? (i % 4 === 0 ? 'IGP3' : null) : null,
        });
      }

      seededDogs.push({
        dogId,
        ownerId: userId,
        ownerName: name,
        registeredName,
        sex: dogSex,
        coatType,
        ageMonths,
        hasFullHealth,
      });
    }
  }
  ok('dogs', `${seededDogs.length} GSD dogs seeded across ${24} exhibitors`);

  // ── 5. ENTRIES via entries.create (real procedure) ────
  log('\n[5/7] Entries via entries.create');

  // Map each dog to its target SV class based on (age, sex, coat)
  const classByKey = new Map<string, typeof autoClasses[number]>();
  for (const c of autoClasses) {
    const def = c.classDefinition;
    const key = `${def.name}|${c.sex}|${c.svCoatType}`;
    classByKey.set(key, c);
  }
  const pickClassForDog = (dog: SeededDog) => {
    const ageName =
      dog.ageMonths < 6 ? 'Baby Puppy'
      : dog.ageMonths < 9 ? 'SV Minor Puppy'
      : dog.ageMonths < 12 ? 'SV Puppy'
      : dog.ageMonths < 18 ? 'SV Junior'
      : dog.ageMonths < 24 ? 'SV Yearling'
      : 'Adult';
    return classByKey.get(`${ageName}|${dog.sex}|${dog.coatType}`);
  };

  let entryCount = 0;
  let expectedRejections = 0;
  let unexpectedRejections = 0;
  for (const dog of seededDogs) {
    const target = pickClassForDog(dog);
    if (!target) {
      fail('entries', `no matching SV class for dog ${dog.registeredName} (${dog.ageMonths}m ${dog.sex} ${dog.coatType})`);
      continue;
    }
    const exCaller = createCaller({
      db,
      session: {
        user: {
          id: dog.ownerId,
          email: `e2e.sv.${dog.ownerId.slice(0, 6)}@test.demo.local`,
          name: dog.ownerName,
          role: 'exhibitor',
        },
      },
      impersonating: null,
      callerIsAdmin: false,
    });
    try {
      await exCaller.entries.create({
        dogId: dog.dogId,
        showId,
        classIds: [target.id],
      });
      entryCount++;
    } catch (e) {
      const msg = (e as Error).message;
      // Expected: dogs without health profile entering Yearling/Adult/Working should be blocked
      const expected = !dog.hasFullHealth && dog.ageMonths >= 18;
      if (expected) {
        expectedRejections++;
        ok('entries', `gate fired correctly for ${dog.registeredName} (missing health): "${msg.slice(0, 100)}…"`);
      } else {
        unexpectedRejections++;
        fail('entries', `unexpected rejection for ${dog.registeredName}: ${msg}`);
      }
    }
  }
  ok('entries', `${entryCount} entries accepted, ${expectedRejections} gates fired (expected), ${unexpectedRejections} unexpected`);

  // ── 5b. Negative tests ────────────────────────────────
  log('\n[5b] Negative tests (expected rejections)');
  // Find a dog that's already entered + try to enter it AGAIN
  const enteredDog = seededDogs.find((d) => d.hasFullHealth);
  if (enteredDog) {
    const target = pickClassForDog(enteredDog);
    if (target) {
      const exCaller = createCaller({
        db,
        session: {
          user: {
            id: enteredDog.ownerId,
            email: 'e2e.test@demo.local',
            name: enteredDog.ownerName,
            role: 'exhibitor',
          },
        },
        impersonating: null,
        callerIsAdmin: false,
      });
      try {
        await exCaller.entries.create({
          dogId: enteredDog.dogId,
          showId,
          classIds: [target.id],
        });
        fail('one-per-show', `double-entry slipped through for ${enteredDog.registeredName}`);
      } catch (e) {
        ok('one-per-show', `double-entry blocked: "${(e as Error).message.slice(0, 80)}…"`);
      }
    }
  }

  // Coat-type mismatch: pick a stock dog + try the long-stock class of same age/sex
  const stockDog = seededDogs.find((d) => d.coatType === 'stock' && d.hasFullHealth);
  if (stockDog) {
    const ageName =
      stockDog.ageMonths < 6 ? 'Baby Puppy'
      : stockDog.ageMonths < 9 ? 'SV Minor Puppy'
      : stockDog.ageMonths < 12 ? 'SV Puppy'
      : stockDog.ageMonths < 18 ? 'SV Junior'
      : stockDog.ageMonths < 24 ? 'SV Yearling'
      : 'Adult';
    const wrongClass = classByKey.get(`${ageName}|${stockDog.sex}|long_stock`);
    if (wrongClass) {
      // First wipe the previous entry so the one-per-show guard doesn't fire instead
      await db.delete(s.entryClasses).where(
        sql`${s.entryClasses.entryId} IN (SELECT id FROM entries WHERE dog_id = ${stockDog.dogId} AND show_id = ${showId})`,
      );
      await db.delete(s.entries).where(
        and(eq(s.entries.dogId, stockDog.dogId), eq(s.entries.showId, showId)),
      );
      const exCaller = createCaller({
        db,
        session: {
          user: {
            id: stockDog.ownerId,
            email: 'e2e.test@demo.local',
            name: stockDog.ownerName,
            role: 'exhibitor',
          },
        },
        impersonating: null,
        callerIsAdmin: false,
      });
      try {
        await exCaller.entries.create({
          dogId: stockDog.dogId,
          showId,
          classIds: [wrongClass.id],
        });
        fail('coat-gate', `stock dog ${stockDog.registeredName} allowed into long-stock class`);
      } catch (e) {
        ok('coat-gate', `wrong-coat blocked: "${(e as Error).message.slice(0, 80)}…"`);
        // Re-enter the dog in the correct class so the catalogue isn't short one
        const rightClass = pickClassForDog(stockDog);
        if (rightClass) {
          await exCaller.entries.create({
            dogId: stockDog.dogId,
            showId,
            classIds: [rightClass.id],
          });
        }
      }
    }
  }

  // ── 6. CATALOGUE NUMBERS + RENDER ─────────────────────
  log('\n[6/7] Render');

  // entries.create leaves entries in 'pending' (they confirm via payment
  // webhook in real life). Flip them to 'confirmed' here so the catalogue
  // pipeline — which only renders confirmed rows — has anything to draw.
  const flipped = await db
    .update(s.entries)
    .set({ status: 'confirmed' })
    .where(and(eq(s.entries.showId, showId), eq(s.entries.status, 'pending')))
    .returning({ id: s.entries.id });
  ok('confirm', `${flipped.length} entries flipped to confirmed (simulates payment webhook)`);

  await assignCatalogueNumbers(showId);

  // ── 6b. RECORD + PUBLISH RESULTS so the public results page shows the
  //         SV ratings. Top grade goes to the first 2 placed, the next grade
  //         to the rest, so each class demonstrates the within-grade reset
  //         (e.g. SG1, SG2, G1, G2). Placement = catalogue order.
  let resultsRecorded = 0;
  for (const sc of autoClasses) {
    const ecs = await db.query.entryClasses.findMany({
      where: eq(s.entryClasses.showClassId, sc.id),
      with: {
        entry: { columns: { id: true, status: true, deletedAt: true, catalogueNumber: true } },
      },
    });
    const confirmed = ecs
      .filter((ec) => ec.entry.status === 'confirmed' && !ec.entry.deletedAt)
      .sort((a, b) => (Number(a.entry.catalogueNumber) || 0) - (Number(b.entry.catalogueNumber) || 0));
    if (confirmed.length === 0) continue;
    const grades = allowedSvGradesForClass(sc.classDefinition.name).filter(
      (g) => g.value !== 'disqualified',
    );
    const topGrade = grades[0]?.value as string | undefined;
    const secondGrade = (grades[1]?.value ?? grades[0]?.value) as string | undefined;
    for (let i = 0; i < confirmed.length; i++) {
      await db
        .insert(s.results)
        .values({
          entryClassId: confirmed[i]!.id,
          placement: i + 1,
          svGrade: ((i < 2 ? topGrade : secondGrade) ?? null) as never,
          publishedAt: new Date(),
          recordedBy: MANDY_DEMO_USER_ID,
        })
        .onConflictDoNothing();
      resultsRecorded++;
    }
  }
  await db.update(s.shows).set({ status: 'in_progress' }).where(eq(s.shows.id, showId));
  ok('results', `${resultsRecorded} results recorded + published (top grade ×2 then next grade — shows within-grade reset)`);

  // Verify the public results query returns the grade so the page can render it.
  const live = await secCaller.steward.getLiveResults({ showId });
  const anyGraded = live.breedGroups
    .flatMap((g) => g.classes)
    .flatMap((c) => c.results)
    .some((r) => !!r.svGrade);
  if (anyGraded) {
    ok('results-api', 'getLiveResults returns svGrade for the public results page');
  } else {
    fail('results-api', 'getLiveResults did not return svGrade');
  }

  // ── 6c. SV TOP AWARDS — the only 4 at a regional (no BoB/CC/BIS).
  //         Most Promising Young Dog/Bitch from Minor Puppy/Puppy/Junior
  //         winners; Best Dog/Bitch from Yearling/Adult/Working winners.
  const stripSv = (n: string) => n.replace(/^SV\s+/, '').trim();
  const youngW: { dogId: string; sex: string | null }[] = [];
  const adultW: { dogId: string; sex: string | null }[] = [];
  for (const bg of live.breedGroups) {
    for (const cls of bg.classes) {
      const w = cls.results.find((r) => r.placement === 1);
      if (!w?.dogId) continue;
      const age = stripSv(cls.className);
      const rec = { dogId: w.dogId, sex: w.dogSex };
      if (['Minor Puppy', 'Puppy', 'Junior'].includes(age)) youngW.push(rec);
      else if (['Yearling', 'Adult', 'Working'].includes(age)) adultW.push(rec);
    }
  }
  const pickWinner = (pool: typeof youngW, sex: string) => pool.find((x) => x.sex === sex)?.dogId ?? null;
  const topAwards: Array<[string, string | null]> = [
    ['most_promising_young_dog', pickWinner(youngW, 'dog')],
    ['most_promising_young_bitch', pickWinner(youngW, 'bitch')],
    ['best_dog', pickWinner(adultW, 'dog')],
    ['best_bitch', pickWinner(adultW, 'bitch')],
  ];
  let awardsRecorded = 0;
  for (const [type, dogId] of topAwards) {
    if (!dogId) continue;
    await db.insert(s.achievements).values({
      showId,
      dogId,
      type: type as never,
      date: startDate,
      publishedAt: new Date(),
      recordedBy: MANDY_DEMO_USER_ID,
    });
    awardsRecorded++;
  }
  ok('awards', `${awardsRecorded}/4 SV top awards recorded + published (MPY Dog/Bitch, Best Dog/Bitch)`);

  // Verify the public achievements query returns them (and only SV types).
  const pubCaller = createCaller({ db, session: null, impersonating: null, callerIsAdmin: false });
  const pubAchievements = await pubCaller.steward.getPublicShowAchievements({ showId });
  const svTypes = new Set(['most_promising_young_dog', 'most_promising_young_bitch', 'best_dog', 'best_bitch']);
  const publishedSv = pubAchievements.filter((a) => svTypes.has(a.type));
  if (publishedSv.length === awardsRecorded && awardsRecorded > 0) {
    ok('awards-api', `public results shows ${publishedSv.length} SV top awards (no BoB/CC/BIS)`);
  } else {
    fail('awards-api', `expected ${awardsRecorded} SV awards public, got ${publishedSv.length}`);
  }

  const outDir = `/tmp/e2e-sv-${Date.now()}`;
  mkdirSync(outDir, { recursive: true });
  log(`  output → ${outDir}`);

  // Schedule — exercises the real generateSchedulePdf service which
  // picks SvShowSchedule for wusv shows automatically.
  try {
    const t0 = Date.now();
    const scheduleBuf = await generateSchedulePdf(showId);
    const path = `${outDir}/schedule.pdf`;
    writeFileSync(path, scheduleBuf);
    const info = execFileSync('pdfinfo', [path]).toString();
    const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
    ok('schedule-pdf', `${pages} pages, ${Math.round(scheduleBuf.length / 1024)} KB in ${Date.now() - t0}ms → ${path}`);
    if (pages < 4) warn('schedule-pdf', `expected ~6 pages for SvShowSchedule, got ${pages}`);
  } catch (e) {
    fail('schedule-pdf', `render failed: ${(e as Error).message}`);
  }

  // Catalogue (standard format — no dedicated SV catalogue yet)
  for (const fmt of ['standard', 'by-class'] as const) {
    try {
      const t0 = Date.now();
      const raw = await generateCataloguePdf(showId, fmt);
      const padded = Buffer.from(await padPdfToMultiple(raw, 4));
      const path = `${outDir}/catalogue-${fmt}.pdf`;
      writeFileSync(path, padded);
      const info = execFileSync('pdfinfo', [path]).toString();
      const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
      ok('catalogue-pdf', `${fmt} → ${pages} pp, ${Math.round(padded.length / 1024)} KB in ${Date.now() - t0}ms → ${path}`);
    } catch (e) {
      fail('catalogue-pdf', `${fmt} render failed: ${(e as Error).message}`);
    }
  }

  // Render first/last page of each PDF as PNG for quick eyeballing
  for (const f of ['schedule', 'catalogue-standard', 'catalogue-by-class']) {
    const pdfPath = `${outDir}/${f === 'schedule' ? 'schedule' : f}.pdf`;
    if (!existsSync(pdfPath)) continue;
    try {
      execFileSync('pdftoppm', [pdfPath, `${outDir}/${f}`, '-png', '-r', '100', '-f', '1', '-l', '2']);
    } catch {
      /* swallow — preview is nice-to-have */
    }
  }

  // ── 7. PUNCH LIST ─────────────────────────────────────
  log('\n[7/7] Punch list');
  const counts = punch.reduce(
    (acc, p) => { acc[p.level]++; return acc; },
    { ok: 0, warn: 0, fail: 0 },
  );
  log('');
  log(`  ✓ ok:    ${counts.ok}`);
  log(`  ⚠ warn:  ${counts.warn}`);
  log(`  ✗ fail:  ${counts.fail}`);
  log('');
  if (counts.warn + counts.fail > 0) {
    log('  Issues:');
    for (const p of punch.filter((x) => x.level !== 'ok')) {
      log(`    [${p.level.toUpperCase()}] ${p.area}: ${p.msg}`);
    }
  } else {
    log('  Clean run — no warnings or failures.');
  }
  log('');
  log(`  show id:        ${showId}`);
  log(`  output folder:  ${outDir}`);
  log(`  demo URL:       https://demo.remishowmanager.co.uk/secretary/shows/${showId}`);
  log('');

  process.exit(counts.fail > 0 ? 1 : 0);
}

/** Mirror secretary.assignCatalogueNumbers for the SV layout. SV catalogues
 *  number by class order, lowest sortOrder first. */
async function assignCatalogueNumbers(showId: string) {
  if (!db) return;
  const rows = await db.query.entries.findMany({
    where: and(eq(s.entries.showId, showId), eq(s.entries.status, 'confirmed')),
    with: { entryClasses: { with: { showClass: true } } },
  });
  const sorted = [...rows].sort((a, b) => {
    const aMin = Math.min(...a.entryClasses.map((ec) => ec.showClass?.sortOrder ?? 999));
    const bMin = Math.min(...b.entryClasses.map((ec) => ec.showClass?.sortOrder ?? 999));
    if (aMin !== bMin) return aMin - bMin;
    return new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
  });
  for (let i = 0; i < sorted.length; i++) {
    await db
      .update(s.entries)
      .set({ catalogueNumber: String(i + 1), updatedAt: new Date() })
      .where(eq(s.entries.id, sorted[i]!.id));
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
