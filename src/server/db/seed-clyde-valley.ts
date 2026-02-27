import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function seedClydeValley() {
  console.log('🐾 Adding Clyde Valley GSD Show...\n');

  // Find or create the organisation
  let org = await db.query.organisations.findFirst({
    where: eq(schema.organisations.name, 'Clyde Valley German Shepherd Dog Club'),
  });

  if (!org) {
    const [created] = await db
      .insert(schema.organisations)
      .values({
        name: 'Clyde Valley German Shepherd Dog Club',
        type: 'breed_club',
        contactEmail: 'secretary@clydevalleygsd.org.uk',
      })
      .returning();
    org = created;
    console.log('  ✓ Created organisation: Clyde Valley GSD Club');
  } else {
    console.log('  ✓ Organisation already exists');
  }

  // Find or create the venue (typical GSD show venue in Central Scotland)
  let venue = await db.query.venues.findFirst({
    where: eq(schema.venues.name, 'Lanark Agricultural Centre'),
  });

  if (!venue) {
    const [created] = await db
      .insert(schema.venues)
      .values({
        name: 'Lanark Agricultural Centre',
        address: 'Hyndford Road, Lanark',
        postcode: 'ML11 9AX',
        lat: '55.6731',
        lng: '-3.7811',
        indoorOutdoor: 'indoor',
        capacity: 500,
      })
      .returning();
    venue = created;
    console.log('  ✓ Created venue: Lanark Agricultural Centre');
  } else {
    console.log('  ✓ Venue already exists');
  }

  // Find GSD breed
  const gsd = await db.query.breeds.findFirst({
    where: eq(schema.breeds.name, 'German Shepherd Dog'),
  });

  if (!gsd) {
    console.error('  ✗ German Shepherd Dog breed not found — run main seed first');
    await client.end();
    process.exit(1);
  }

  // Find class definitions
  const allClassDefs = await db.query.classDefinitions.findMany();
  const classMap = Object.fromEntries(allClassDefs.map((c) => [c.name, c.id]));

  // Add Amanda as a member of the org (she's the secretary)
  const amanda = await db.query.users.findFirst({
    where: eq(schema.users.email, 'mandy@hundarkgsd.co.uk'),
  });

  if (amanda && org) {
    const existingMembership = await db.query.memberships.findFirst({
      where: eq(schema.memberships.userId, amanda.id),
    });
    if (!existingMembership) {
      await db.insert(schema.memberships).values({
        userId: amanda.id,
        organisationId: org.id,
        status: 'active',
      });
      console.log('  ✓ Added Amanda as member of Clyde Valley GSD Club');
    }

    // Ensure Amanda's user role is 'secretary' so she can access the secretary dashboard
    if (amanda.role !== 'secretary') {
      await db
        .update(schema.users)
        .set({ role: 'secretary' })
        .where(eq(schema.users.id, amanda.id));
      console.log('  ✓ Updated Amanda\'s role to secretary');
    }
  }

  // Create the show
  const existingShow = await db.query.shows.findFirst({
    where: eq(schema.shows.name, 'Clyde Valley GSD Club Open Show'),
  });

  if (existingShow) {
    console.log('  ✓ Show already exists — skipping');
    await client.end();
    return;
  }

  const [show] = await db
    .insert(schema.shows)
    .values({
      name: 'Clyde Valley GSD Club Open Show',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org!.id,
      venueId: venue!.id,
      startDate: '2026-05-17',
      endDate: '2026-05-17',
      entryCloseDate: new Date('2026-05-03T23:59:00Z'),
      status: 'entries_open',
      description:
        'The Clyde Valley German Shepherd Dog Club Open Show. Judging commences at 10:00am. All exhibitors welcome. Refreshments available. Open to all KC registered German Shepherd Dogs.',
    })
    .returning();

  console.log(`  ✓ Created show: ${show.name} (${show.startDate})`);

  // Create GSD-specific classes, split by sex
  const gsdClasses = [
    'Minor Puppy',
    'Puppy',
    'Junior',
    'Yearling',
    'Maiden',
    'Novice',
    'Graduate',
    'Post Graduate',
    'Limit',
    'Open',
    'Veteran',
    'Special Beginners',
  ];

  let classCount = 0;
  for (const className of gsdClasses) {
    const classDefId = classMap[className];
    if (!classDefId) {
      console.log(`  ⚠ Skipping ${className} — class definition not found`);
      continue;
    }

    // Create for Dogs
    await db.insert(schema.showClasses).values({
      showId: show.id,
      classDefinitionId: classDefId,
      breedId: gsd.id,
      sex: 'dog',
      entryFee: 800, // £8.00 per class
    });
    classCount++;

    // Create for Bitches
    await db.insert(schema.showClasses).values({
      showId: show.id,
      classDefinitionId: classDefId,
      breedId: gsd.id,
      sex: 'bitch',
      entryFee: 800, // £8.00 per class
    });
    classCount++;
  }

  // Add Junior Handler classes (not breed-specific)
  const jhClasses = [
    'Junior Handler (6-11)',
    'Junior Handler (12-16)',
    'Junior Handler (17-24)',
  ];

  for (const className of jhClasses) {
    const classDefId = classMap[className];
    if (!classDefId) continue;

    await db.insert(schema.showClasses).values({
      showId: show.id,
      classDefinitionId: classDefId,
      breedId: gsd.id,
      entryFee: 500, // £5.00 for JH classes
    });
    classCount++;
  }

  console.log(`  ✓ Created ${classCount} classes for GSD (Dogs & Bitches + JH)`);
  console.log('\n✅ Clyde Valley GSD Show added successfully!');
  console.log(`   Show date: Saturday 17th May 2026`);
  console.log(`   Entries close: 3rd May 2026`);
  console.log(`   Venue: Lanark Agricultural Centre, ML11 9AX`);
  console.log(`   Classes: ${gsdClasses.length} classes × 2 sexes + ${jhClasses.length} JH = ${classCount} total`);
  console.log(`   Entry fee: £8.00/class (£5.00 for Junior Handler)`);

  await client.end();
}

seedClydeValley().catch(console.error);
