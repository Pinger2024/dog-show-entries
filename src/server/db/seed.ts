import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function seed() {
  console.log('🐾 Seeding Remi database...\n');

  // ── Breed Groups (7 KC Groups) ────────────────────────────
  console.log('Creating breed groups...');
  const groups = await db
    .insert(schema.breedGroups)
    .values([
      { name: 'Gundog', sortOrder: 1 },
      { name: 'Hound', sortOrder: 2 },
      { name: 'Pastoral', sortOrder: 3 },
      { name: 'Terrier', sortOrder: 4 },
      { name: 'Toy', sortOrder: 5 },
      { name: 'Utility', sortOrder: 6 },
      { name: 'Working', sortOrder: 7 },
    ])
    .onConflictDoNothing()
    .returning();

  // If groups already existed, fetch them
  const allGroups = groups.length > 0
    ? groups
    : await db.query.breedGroups.findMany();

  const groupMap = Object.fromEntries(allGroups.map((g) => [g.name, g.id]));
  console.log(`  ✓ ${allGroups.length} breed groups (${groups.length} new)`);

  // ── Breeds (30 popular breeds) ────────────────────────────
  console.log('Creating breeds...');
  const breeds = await db
    .insert(schema.breeds)
    .values([
      // Gundog
      { name: 'Labrador Retriever', groupId: groupMap['Gundog'], kcBreedCode: 'LAB' },
      { name: 'Golden Retriever', groupId: groupMap['Gundog'], kcBreedCode: 'GOR' },
      { name: 'English Springer Spaniel', groupId: groupMap['Gundog'], kcBreedCode: 'ESS' },
      { name: 'Cocker Spaniel', groupId: groupMap['Gundog'], kcBreedCode: 'CKS' },
      { name: 'English Setter', groupId: groupMap['Gundog'], kcBreedCode: 'ENS' },
      // Hound
      { name: 'Beagle', groupId: groupMap['Hound'], kcBreedCode: 'BEA' },
      { name: 'Dachshund (Miniature Smooth-Haired)', groupId: groupMap['Hound'], kcBreedCode: 'DMS' },
      { name: 'Whippet', groupId: groupMap['Hound'], kcBreedCode: 'WHP' },
      { name: 'Greyhound', groupId: groupMap['Hound'], kcBreedCode: 'GRY' },
      // Pastoral
      { name: 'Border Collie', groupId: groupMap['Pastoral'], kcBreedCode: 'BDC' },
      { name: 'German Shepherd Dog', groupId: groupMap['Pastoral'], kcBreedCode: 'GSD' },
      { name: 'Shetland Sheepdog', groupId: groupMap['Pastoral'], kcBreedCode: 'SHS' },
      { name: 'Old English Sheepdog', groupId: groupMap['Pastoral'], kcBreedCode: 'OES' },
      // Terrier
      { name: 'Staffordshire Bull Terrier', groupId: groupMap['Terrier'], kcBreedCode: 'SBT' },
      { name: 'Border Terrier', groupId: groupMap['Terrier'], kcBreedCode: 'BDT' },
      { name: 'West Highland White Terrier', groupId: groupMap['Terrier'], kcBreedCode: 'WHW' },
      { name: 'Jack Russell Terrier', groupId: groupMap['Terrier'], kcBreedCode: 'JRT' },
      // Toy
      { name: 'Cavalier King Charles Spaniel', groupId: groupMap['Toy'], kcBreedCode: 'CKC' },
      { name: 'Chihuahua (Smooth Coat)', groupId: groupMap['Toy'], kcBreedCode: 'CHS' },
      { name: 'Pug', groupId: groupMap['Toy'], kcBreedCode: 'PUG' },
      { name: 'Yorkshire Terrier', groupId: groupMap['Toy'], kcBreedCode: 'YKT' },
      // Utility
      { name: 'French Bulldog', groupId: groupMap['Utility'], kcBreedCode: 'FBD' },
      { name: 'Bulldog', groupId: groupMap['Utility'], kcBreedCode: 'BLD' },
      { name: 'Dalmatian', groupId: groupMap['Utility'], kcBreedCode: 'DAL' },
      { name: 'Poodle (Standard)', groupId: groupMap['Utility'], kcBreedCode: 'PDS' },
      // Working
      { name: 'Boxer', groupId: groupMap['Working'], kcBreedCode: 'BOX' },
      { name: 'Rottweiler', groupId: groupMap['Working'], kcBreedCode: 'ROT' },
      { name: 'Dobermann', groupId: groupMap['Working'], kcBreedCode: 'DOB' },
      { name: 'Great Dane', groupId: groupMap['Working'], kcBreedCode: 'GRD' },
      { name: 'Newfoundland', groupId: groupMap['Working'], kcBreedCode: 'NFD' },
    ])
    .onConflictDoNothing()
    .returning();

  const allBreeds = breeds.length > 0
    ? breeds
    : await db.query.breeds.findMany();
  const breedMap = Object.fromEntries(allBreeds.map((b) => [b.name, b.id]));
  console.log(`  ✓ ${allBreeds.length} breeds (${breeds.length} new)`);

  // ── Class Definitions (12 standard KC classes) ────────────
  console.log('Creating class definitions...');
  const classDefs = await db
    .insert(schema.classDefinitions)
    .values([
      // Age-based
      { name: 'Minor Puppy', type: 'age' as const, minAgeMonths: 6, maxAgeMonths: 9, description: 'For dogs of 6 and not exceeding 9 calendar months of age on the first day of the show.' },
      { name: 'Puppy', type: 'age' as const, minAgeMonths: 6, maxAgeMonths: 12, description: 'For dogs of 6 and not exceeding 12 calendar months of age on the first day of the show.' },
      { name: 'Junior', type: 'age' as const, minAgeMonths: 6, maxAgeMonths: 18, description: 'For dogs of 6 and not exceeding 18 calendar months of age on the first day of the show.' },
      { name: 'Yearling', type: 'age' as const, minAgeMonths: 12, maxAgeMonths: 24, description: 'For dogs of 12 and not exceeding 24 calendar months of age on the first day of the show.' },
      { name: 'Veteran', type: 'age' as const, minAgeMonths: 84, description: 'For dogs of not less than 7 years of age on the first day of the show.' },
      // Achievement-based
      { name: 'Maiden', type: 'achievement' as const, maxWins: 0, description: 'For dogs which have not won a CC/RCC or a first prize at an Open or Championship Show.' },
      { name: 'Novice', type: 'achievement' as const, maxWins: 2, description: 'For dogs which have not won a CC or 3 or more first prizes at Open and Championship Shows.' },
      { name: 'Graduate', type: 'achievement' as const, maxWins: 3, description: 'For dogs which have not won a CC or 4 or more first prizes at Championship Shows.' },
      { name: 'Post Graduate', type: 'achievement' as const, maxWins: 4, description: 'For dogs which have not won a CC or 5 or more first prizes at Championship Shows.' },
      { name: 'Limit', type: 'achievement' as const, maxWins: 6, description: 'For dogs which have not become Show Champions or won 3 or more CCs or 7 or more first prizes at Championship Shows in Limit or Open.' },
      { name: 'Undergraduate', type: 'achievement' as const, maxWins: 2, description: 'For dogs which have not won a CC or 3 or more first prizes at Championship Shows in Undergraduate, Graduate, Post Graduate, Mid Limit, Limit, or Open.' },
      { name: 'Mid Limit', type: 'achievement' as const, maxWins: 4, description: 'For dogs which have not won a CC or 3 or more first prizes in Mid Limit, Limit, or Open at Championship Shows.' },
      { name: 'Open', type: 'achievement' as const, description: 'For all dogs of the breed eligible for entry at the show. No restrictions.' },
      // Long Coat GSD varieties
      { name: 'Long Coat Open', type: 'achievement' as const, description: 'For Long Coat German Shepherd Dogs eligible for entry at the show. No restrictions.' },
      { name: 'Long Coat Puppy', type: 'age' as const, minAgeMonths: 6, maxAgeMonths: 12, description: 'For Long Coat German Shepherd Dogs of 6 and not exceeding 12 calendar months of age on the first day of the show.' },
      // Special
      { name: 'Good Citizen Dog Scheme', type: 'special' as const, description: 'For dogs that have passed any level of the Kennel Club Good Citizen Dog Scheme.' },
      { name: 'Special Beginners', type: 'special' as const, description: 'For dogs whose owners/handlers have never won a CC or Reserve CC at Championship Shows.' },
      // Junior Handler classes
      { name: 'Junior Handler (6-11)', type: 'junior_handler' as const, minAgeMonths: 72, maxAgeMonths: 143, description: 'For handlers aged 6-11 years on the day of the show. Judged on handling skill, not the dog.' },
      { name: 'Junior Handler (12-16)', type: 'junior_handler' as const, minAgeMonths: 144, maxAgeMonths: 203, description: 'For handlers aged 12-16 years on the day of the show. Judged on handling skill, not the dog.' },
      { name: 'Junior Handler (17-24)', type: 'junior_handler' as const, minAgeMonths: 204, maxAgeMonths: 299, description: 'For handlers aged 17-24 years on the day of the show. Judged on handling skill, not the dog.' },
    ])
    .onConflictDoNothing()
    .returning();

  const allClassDefs = classDefs.length > 0
    ? classDefs
    : await db.query.classDefinitions.findMany();
  const classMap = Object.fromEntries(allClassDefs.map((c) => [c.name, c.id]));
  console.log(`  ✓ ${allClassDefs.length} class definitions (${classDefs.length} new)`);

  // ── Organisations ─────────────────────────────────────────
  console.log('Creating organisations...');
  const orgs = await db
    .insert(schema.organisations)
    .values([
      { name: 'Yorkshire Canine Society', type: 'general', contactEmail: 'secretary@yorkshirecanine.org.uk' },
      { name: 'The Border Collie Club of Great Britain', type: 'breed_club', contactEmail: 'info@bordercollieclub.org.uk' },
      { name: 'Northern Counties All Breeds', type: 'general', contactEmail: 'entries@ncab.org.uk' },
      { name: 'Midland Counties Canine Society', type: 'general', contactEmail: 'secretary@midlandcounties.org.uk' },
    ])
    .onConflictDoNothing()
    .returning();

  const allOrgs = orgs.length > 0
    ? orgs
    : await db.query.organisations.findMany();
  console.log(`  ✓ ${allOrgs.length} organisations (${orgs.length} new)`);

  // ── Venues ────────────────────────────────────────────────
  console.log('Creating venues...');
  const venuesList = await db
    .insert(schema.venues)
    .values([
      { name: 'Great Yorkshire Showground', address: 'Railway Rd, Harrogate', postcode: 'HG2 8NZ', lat: '53.9867', lng: '-1.5280', indoorOutdoor: 'outdoor', capacity: 5000 },
      { name: 'Stafford County Showground', address: 'Weston Rd, Stafford', postcode: 'ST18 0BD', lat: '52.8194', lng: '-2.1277', indoorOutdoor: 'outdoor', capacity: 8000 },
      { name: 'NEC Birmingham', address: 'North Ave, Marston Green', postcode: 'B40 1NT', lat: '52.4539', lng: '-1.7221', indoorOutdoor: 'indoor', capacity: 20000 },
      { name: 'Event City Manchester', address: 'Phoenix Way, Barton Dock Rd, Stretford', postcode: 'M17 8AS', lat: '53.4668', lng: '-2.3163', indoorOutdoor: 'indoor', capacity: 6000 },
    ])
    .onConflictDoNothing()
    .returning();

  const allVenues = venuesList.length > 0
    ? venuesList
    : await db.query.venues.findMany();
  console.log(`  ✓ ${allVenues.length} venues (${venuesList.length} new)`);

  // ── Judges ────────────────────────────────────────────────
  console.log('Creating judges...');
  const judgesList = await db
    .insert(schema.judges)
    .values([
      { name: 'Mrs Sandra Thompson', kcNumber: 'J12345' },
      { name: 'Mr David Williams', kcNumber: 'J23456' },
      { name: 'Mrs Patricia Morgan', kcNumber: 'J34567' },
      { name: 'Mr Robert Hughes', kcNumber: 'J45678' },
      { name: 'Mrs Helen Clarke', kcNumber: 'J56789' },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`  ✓ ${judgesList.length} judges created (new)`);

  // ── Shows ─────────────────────────────────────────────────
  console.log('Creating shows...');
  const showsList = await db
    .insert(schema.shows)
    .values([
      {
        name: 'Yorkshire Canine Society Championship Show',
        showType: 'championship',
        showScope: 'general',
        organisationId: allOrgs[0].id,
        venueId: allVenues[0].id,
        startDate: '2026-05-16',
        endDate: '2026-05-18',
        entryCloseDate: new Date('2026-04-18T23:59:00Z'),
        status: 'entries_open',
        description: 'One of the premier championship shows in the North of England. CCs on offer for all breeds. Three days of competition across all seven groups.',
      },
      {
        name: 'Border Collie Club Open Show',
        showType: 'open',
        showScope: 'single_breed',
        organisationId: allOrgs[1].id,
        venueId: allVenues[3].id,
        startDate: '2026-04-12',
        endDate: '2026-04-12',
        entryCloseDate: new Date('2026-03-28T23:59:00Z'),
        status: 'entries_open',
        description: 'Annual breed club open show for Border Collies. Classes for all ages and experience levels. Judge: Mrs Sandra Thompson.',
      },
      {
        name: 'Northern Counties All Breeds Open Show',
        showType: 'open',
        showScope: 'general',
        organisationId: allOrgs[2].id,
        venueId: allVenues[0].id,
        startDate: '2026-03-29',
        endDate: '2026-03-29',
        entryCloseDate: new Date('2026-03-14T23:59:00Z'),
        status: 'entries_open',
        description: 'Friendly all-breeds open show in Harrogate. Great for newcomers and experienced exhibitors alike. Excellent venue with free parking.',
      },
      {
        name: 'Midland Counties Championship Show',
        showType: 'championship',
        showScope: 'general',
        organisationId: allOrgs[3].id,
        venueId: allVenues[1].id,
        startDate: '2026-06-20',
        endDate: '2026-06-22',
        entryCloseDate: new Date('2026-05-22T23:59:00Z'),
        status: 'entries_open',
        description: 'Major championship show held at Stafford County Showground. CCs on offer. Benched show with Best in Show on the Sunday.',
      },
      {
        name: 'Spring Gundog Spectacular Open Show',
        showType: 'open',
        showScope: 'group',
        organisationId: orgs[2].id,
        venueId: venuesList[3].id,
        startDate: '2026-04-05',
        endDate: '2026-04-05',
        entryCloseDate: new Date('2026-03-21T23:59:00Z'),
        status: 'entries_open',
        description: 'Gundog group open show featuring all gundog breeds. Specialist judges for each breed. Great atmosphere for gundog enthusiasts.',
      },
      {
        name: 'Summer All Breeds Limited Show',
        showType: 'limited',
        showScope: 'general',
        organisationId: orgs[0].id,
        venueId: venuesList[0].id,
        startDate: '2026-07-11',
        endDate: '2026-07-11',
        entryCloseDate: new Date('2026-06-27T23:59:00Z'),
        status: 'published',
        description: 'Members-only limited show. Relaxed atmosphere, great for building experience. No dogs who have won a CC are eligible.',
      },
      {
        name: 'Autumn Working & Pastoral Open Show',
        showType: 'open',
        showScope: 'group',
        organisationId: allOrgs[2].id,
        venueId: allVenues[1].id,
        startDate: '2026-09-19',
        endDate: '2026-09-19',
        entryCloseDate: new Date('2026-09-05T23:59:00Z'),
        status: 'draft',
        description: 'Combined Working and Pastoral group open show at Stafford. Always well attended with strong entries.',
      },
      {
        name: 'NEC Premier Open Show',
        showType: 'premier_open',
        showScope: 'general',
        organisationId: allOrgs[3].id,
        venueId: allVenues[2].id,
        startDate: '2026-08-08',
        endDate: '2026-08-09',
        entryCloseDate: new Date('2026-07-25T23:59:00Z'),
        status: 'published',
        description: 'Premier open show at the NEC. Group placings qualify for Crufts. Two days covering all seven breed groups.',
      },
    ])
    .onConflictDoNothing()
    .returning();

  const allShows = showsList.length > 0
    ? showsList
    : await db.query.shows.findMany();
  console.log(`  ✓ ${allShows.length} shows (${showsList.length} new)`);

  // ── Show Classes (for open-entry shows) ───────────────────
  console.log('Creating show classes...');
  const standardClasses = ['Minor Puppy', 'Puppy', 'Junior', 'Novice', 'Post Graduate', 'Limit', 'Open', 'Veteran'];
  const selectedBreeds = [
    'Labrador Retriever', 'Golden Retriever', 'Border Collie', 'Cocker Spaniel',
    'German Shepherd Dog', 'Staffordshire Bull Terrier', 'French Bulldog', 'Cavalier King Charles Spaniel',
  ];

  let showClassCount = 0;

  // Only create show classes if shows were newly inserted
  if (showsList.length === 0) {
    console.log('  ⏭ Shows already existed, skipping show class creation');
  }

  // Championship shows — full class sets for selected breeds, both sexes
  for (const show of showsList.filter((s) => s.showType === 'championship')) {
    for (const breedName of selectedBreeds) {
      for (const [sortIdx, className] of standardClasses.entries()) {
        for (const sex of ['dog', 'bitch'] as const) {
          await db.insert(schema.showClasses).values({
            showId: show.id,
            breedId: breedMap[breedName],
            classDefinitionId: classMap[className],
            sex,
            entryFee: className === 'Minor Puppy' ? 2000 : 2500, // £20 / £25 in pence
            sortOrder: sortIdx,
          });
          showClassCount++;
        }
      }
    }
  }

  // Open shows — classes without sex split, lower fees
  for (const show of showsList.filter((s) => s.showType === 'open' || s.showType === 'premier_open')) {
    const showBreeds = show.showScope === 'single_breed'
      ? ['Border Collie']
      : selectedBreeds;

    for (const breedName of showBreeds) {
      if (!breedMap[breedName]) continue;
      for (const [sortIdx, className] of standardClasses.entries()) {
        await db.insert(schema.showClasses).values({
          showId: show.id,
          breedId: breedMap[breedName],
          classDefinitionId: classMap[className],
          entryFee: 500, // £5.00
          sortOrder: sortIdx,
        });
        showClassCount++;
      }
    }
  }

  console.log(`  ✓ ${showClassCount} show classes created`);

  // ── Summary ───────────────────────────────────────────────
  console.log('\n🎉 Seeding complete!\n');
  console.log('  Breed Groups:      ', allGroups.length);
  console.log('  Breeds:            ', allBreeds.length);
  console.log('  Class Definitions: ', allClassDefs.length);
  console.log('  Organisations:     ', allOrgs.length);
  console.log('  Venues:            ', allVenues.length);
  console.log('  Judges:            ', judgesList.length);
  console.log('  Shows:             ', allShows.length);
  console.log('  Show Classes:      ', showClassCount);
  console.log('\n  Your Remi database is ready to go! 🐾\n');

  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
