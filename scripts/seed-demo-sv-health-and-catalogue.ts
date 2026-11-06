/**
 * Demo data enrichment for Amanda's SV journey testing (2026-05-22).
 *
 * - Adds plausible SV health profiles (hip/elbow/DNA/koerung) to every
 *   GSD dog in the demo DB that doesn't already have one. Varied values
 *   so the secretary's filtering / reports view has interesting data.
 * - Bumps catalogue sales: ~80% of entries flagged catalogue_requested.
 * - Adds half a dozen catalogue adverts so the print preview has body.
 *
 * Runs only against the LOCAL demo DB (refuses any other DATABASE_URL).
 *
 *   npx tsx scripts/seed-demo-sv-health-and-catalogue.ts
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';

const DEMO_URL_HINT = 'remi_demo';

function pick<T>(opts: readonly T[]): T {
  return opts[Math.floor(Math.random() * opts.length)]!;
}

function maybe<T>(probability: number, value: T): T | null {
  return Math.random() < probability ? value : null;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.includes(DEMO_URL_HINT)) {
    throw new Error(
      `Refusing to run against non-demo DATABASE_URL. Set DATABASE_URL to point at remi_demo (contains "${DEMO_URL_HINT}").`,
    );
  }

  const client = postgres(dbUrl, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  // ── 1. SV health profiles ────────────────────────────────────────────
  const gsdBreed = await db.query.breeds.findFirst({
    where: eq(schema.breeds.name, 'German Shepherd Dog'),
  });
  if (!gsdBreed) throw new Error('No German Shepherd Dog breed row in demo DB');

  const dogs = await db.query.dogs.findMany({
    where: and(eq(schema.dogs.breedId, gsdBreed.id), isNull(schema.dogs.deletedAt)),
    columns: { id: true, registeredName: true },
  });
  console.log(`📋 ${dogs.length} GSD dogs in demo`);

  const existing = await db.query.dogSvProfile.findMany({
    columns: { dogId: true },
  });
  const existingIds = new Set(existing.map((p) => p.dogId));
  const toCreate = dogs.filter((d) => !existingIds.has(d.id));
  console.log(`   ${existingIds.size} already have SV profiles; creating ${toCreate.length}…`);

  // Plausible distributions:
  //   • 65% normal / 15% fast_normal / 10% bva / 5% noch_zugelassen / 5% other
  //   • DNA: 60% recorded / 30% proven / 10% null
  //   • Koerung: 55% none / 30% current_year / 15% lebenzeit
  //   • Breed survey year: 30% within last 4 years, 70% null
  const hipMix = (['normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal',
    'fast_normal', 'fast_normal', 'fast_normal',
    'bva', 'bva',
    'noch_zugelassen',
    'other'] as const);
  const elbowMix = hipMix;
  const dnaMix = ([
    'recorded', 'recorded', 'recorded', 'recorded', 'recorded', 'recorded',
    'proven', 'proven', 'proven',
    null,
  ] as const);
  const koerungMix = ([
    'none', 'none', 'none', 'none', 'none', 'none',
    'current_year', 'current_year', 'current_year',
    'lebenzeit', 'lebenzeit',
  ] as const);

  if (toCreate.length > 0) {
    const rows = toCreate.map((d) => {
      const hip = pick(hipMix);
      const elbow = pick(elbowMix);
      // For BVA we surface an actual score string; "other" leaves it blank.
      const hipScore =
        hip === 'bva'
          ? `${pick(['3', '4', '5', '6', '7', '9', '10'] as const)}/${pick(['3', '4', '5', '6', '7', '8'] as const)}`
          : null;
      const elbowScore = elbow === 'bva' ? pick(['0', '0', '0', '1'] as const) : null;
      return {
        dogId: d.id,
        hipGrade: hip,
        hipScore,
        elbowGrade: elbow,
        elbowScore,
        dna: pick(dnaMix),
        koerung: pick(koerungMix),
        breedSurveyClass: maybe(0.3, pick(['Kkl 1', 'Kkl 2'] as const)),
        breedSurveyYear: maybe(0.3, 2023 + Math.floor(Math.random() * 3)),
        breedSurveyor: maybe(0.2, pick(['Heinrich Wittkopp', 'Lothar Quoll', 'Reinhardt Meyer'] as const)),
        workingTitle: maybe(0.15, pick(['IGP1', 'IGP2', 'IGP3', 'SchH1', 'VPG2'] as const)),
      };
    });
    await db.insert(schema.dogSvProfile).values(rows);
    console.log(`   ✅ Inserted ${rows.length} SV profile rows`);
  }

  // ── 2. Catalogue sales ───────────────────────────────────────────────
  // Bump catalogue-requested rate to ~80% of confirmed entries by flipping
  // ~half of the existing "false" entries.
  const flipped = await db
    .update(schema.entries)
    .set({ catalogueRequested: true, updatedAt: new Date() })
    .where(
      and(
        eq(schema.entries.catalogueRequested, false),
        isNull(schema.entries.deletedAt),
        sql`random() < 0.6`,
      ),
    )
    .returning({ id: schema.entries.id });
  console.log(`\n🛒 Flipped ${flipped.length} entries to catalogue_requested = true`);

  // ── 3. Catalogue adverts ─────────────────────────────────────────────
  // Add 6 adverts to the SV regional show specifically — that's the
  // catalogue Amanda is most likely to render. Mix of full-page and
  // half-page, mix of catalogue-only and schedule+catalogue.
  const svShow = await db.query.shows.findFirst({
    where: eq(schema.shows.showRuleset, 'wusv'),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    columns: { id: true, name: true },
  });
  if (svShow) {
    const advertSeeds = [
      { advertiserName: "Pedigree GSD Foods Ltd",   document: 'catalogue' as const, position: 'inside_front' as const, sortOrder: 1 },
      { advertiserName: "Westfield Veterinary",      document: 'catalogue' as const, position: 'inside_back'  as const, sortOrder: 2 },
      { advertiserName: "Blackrock Boarding Kennels", document: 'catalogue' as const, position: 'last_page'   as const, sortOrder: 3 },
      { advertiserName: "Northwood Photography",     document: 'both'       as const, position: 'inside_front' as const, sortOrder: 4 },
      { advertiserName: "Kennel Klub Insurance",     document: 'both'       as const, position: 'last_page'   as const, sortOrder: 5 },
      { advertiserName: "Highland Show Supplies",    document: 'schedule'   as const, position: 'inside_back'  as const, sortOrder: 6 },
    ];
    const existingAds = await db.query.catalogueAdverts.findMany({
      where: eq(schema.catalogueAdverts.showId, svShow.id),
      columns: { advertiserName: true },
    });
    const have = new Set(existingAds.map((a) => a.advertiserName));
    const toAdd = advertSeeds.filter((a) => !have.has(a.advertiserName));
    if (toAdd.length > 0) {
      await db.insert(schema.catalogueAdverts).values(
        toAdd.map((a) => ({
          showId: svShow.id,
          advertiserName: a.advertiserName,
          adType: 'full_page' as const,
          document: a.document,
          position: a.position,
          sortOrder: a.sortOrder,
          isPaid: true,
          // Leave imageUrl null — Amanda can upload real artwork via the
          // /adverts UI; for now the catalogue will skip these silently
          // because AdvertPage renders nothing without imageUrl.
        })),
      );
      console.log(`\n📰 Added ${toAdd.length} catalogue adverts to "${svShow.name}"`);
    } else {
      console.log(`\n📰 SV show already has all 6 sample adverts`);
    }
  } else {
    console.log('\n⚠️  No SV/WUSV show found in demo — skipping advert seed');
  }

  await client.end();
  console.log('\nAll done. Demo is ready for Amanda 🎉');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
