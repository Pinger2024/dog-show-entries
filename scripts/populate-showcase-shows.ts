/**
 * Populate two showcase test shows with COMPLETE data:
 * 1. Single-breed: Highland GSD Showcase Premier Open Show
 * 2. Multi-breed: Scottish All Breeds Championship Show
 *
 * Run: npx tsx scripts/populate-showcase-shows.ts
 */
import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, and, sql } from 'drizzle-orm';
import * as s from '@/server/db/schema/index.js';
import { generateShowSlug } from '@/lib/slugify.js';

/* ═══════════════════════════════════════════════ */
/*  Helpers                                        */
/* ═══════════════════════════════════════════════ */

function uuid() {
  return crypto.randomUUID();
}

function futureDate(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(23, 59, 0, 0);
  return d;
}

function dateStr(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pence(pounds: number): number {
  return pounds * 100;
}

const PLACEHOLDER = (w: number, h: number, bg: string, fg: string, text: string) =>
  `https://placehold.co/${w}x${h}/${bg}/${fg}?text=${encodeURIComponent(text)}&font=serif`;

/* ═══════════════════════════════════════════════ */
/*  Main                                           */
/* ═══════════════════════════════════════════════ */

async function main() {
  if (!db) {
    console.log('No database connection');
    return;
  }

  console.log('═══ Creating two showcase shows with complete data ═══\n');

  // ── Clean up any previous showcase data ──────────
  const existingShows = await db.select({ id: s.shows.id }).from(s.shows)
    .where(sql`${s.shows.name} IN ('Highland GSD Showcase Premier Open Show', 'Scottish All Breeds Championship Show')`);

  if (existingShows.length > 0) {
    console.log(`  Cleaning up ${existingShows.length} existing showcase show(s)...`);
    const showIds = existingShows.map((sh) => sh.id);

    for (const sid of showIds) {
      // Delete in correct order for FK constraints
      await db.delete(s.entryClasses).where(sql`${s.entryClasses.entryId} IN (SELECT id FROM entries WHERE show_id = ${sid})`);
      await db.delete(s.payments).where(sql`${s.payments.orderId} IN (SELECT id FROM orders WHERE show_id = ${sid})`);
      await db.delete(s.entries).where(eq(s.entries.showId, sid));
      await db.delete(s.orders).where(eq(s.orders.showId, sid));
      await db.delete(s.classSponsorships).where(sql`${s.classSponsorships.showClassId} IN (SELECT id FROM show_classes WHERE show_id = ${sid})`);
      await db.delete(s.showClasses).where(eq(s.showClasses.showId, sid));
      await db.delete(s.judgeAssignments).where(eq(s.judgeAssignments.showId, sid));
      await db.delete(s.rings).where(eq(s.rings.showId, sid));
      await db.delete(s.sundryItems).where(eq(s.sundryItems.showId, sid));

      // Delete show sponsors + sponsors
      const showSponsors = await db.select({ id: s.showSponsors.id, sponsorId: s.showSponsors.sponsorId })
        .from(s.showSponsors).where(eq(s.showSponsors.showId, sid));
      for (const ss of showSponsors) {
        await db.delete(s.showSponsors).where(eq(s.showSponsors.id, ss.id));
        await db.delete(s.sponsors).where(eq(s.sponsors.id, ss.sponsorId));
      }

      const show = await db.query.shows.findFirst({ where: eq(s.shows.id, sid) });
      await db.delete(s.shows).where(eq(s.shows.id, sid));

      // Clean up org + venue if they were created by this script
      if (show?.organisationId) {
        await db.delete(s.memberships).where(eq(s.memberships.organisationId, show.organisationId));
        await db.delete(s.organisations).where(eq(s.organisations.id, show.organisationId));
      }
      if (show?.venueId) {
        await db.delete(s.venues).where(eq(s.venues.id, show.venueId));
      }
    }
    console.log('  ✓ Cleaned up previous showcase data\n');
  }

  // ── Lookup existing reference data ──────────────

  const allBreeds = await db.query.breeds.findMany({ with: { group: true } });
  const allClassDefs = await db.query.classDefinitions.findMany();
  const breedsByName = new Map(allBreeds.map((b) => [b.name, b]));
  const classDefsByName = new Map(allClassDefs.map((cd) => [cd.name, cd]));

  function getBreed(name: string) {
    const b = breedsByName.get(name);
    if (!b) throw new Error(`Breed not found: ${name}`);
    return b;
  }
  function getClassDef(name: string) {
    const cd = classDefsByName.get(name);
    if (!cd) throw new Error(`Class definition not found: ${name}`);
    return cd;
  }

  // Find Michael's user for secretary
  const michael = await db.query.users.findFirst({
    where: eq(s.users.email, 'michael@prometheus-it.com'),
  });

  /* ═══════════════════════════════════════════════ */
  /*  SHOW 1: Single-Breed — Highland GSD Showcase   */
  /* ═══════════════════════════════════════════════ */

  console.log('── Show 1: Highland GSD Showcase Premier Open Show ──\n');

  // Organisation
  const org1Id = uuid();
  await db.insert(s.organisations).values({
    id: org1Id,
    name: 'Highland German Shepherd Dog Society',
    type: 'single_breed',
    contactEmail: 'secretary@highlandgsd.org.uk',
    contactPhone: '01463 555 123',
    website: 'https://highlandgsd.org.uk',
    logoUrl: PLACEHOLDER(300, 120, '1a472a', 'C9A84C', 'Highland GSD Society'),
  });
  console.log('  ✓ Organisation: Highland German Shepherd Dog Society');

  // Membership for Michael
  if (michael) {
    await db.insert(s.memberships).values({
      userId: michael.id,
      organisationId: org1Id,
      status: 'active',
    });
  }

  // Venue
  const venue1Id = uuid();
  await db.insert(s.venues).values({
    id: venue1Id,
    name: 'Inverness Leisure Centre',
    address: 'Bught Lane, Inverness',
    postcode: 'IV3 5SS',
    lat: '57.4630000',
    lng: '-4.2370000',
    indoorOutdoor: 'indoor',
    capacity: 500,
  });
  console.log('  ✓ Venue: Inverness Leisure Centre');

  // Show
  const show1Id = uuid();
  const show1Name = 'Highland GSD Showcase Premier Open Show';
  const show1StartDate = dateStr(45); // ~6 weeks from now
  const show1Slug = generateShowSlug(show1Name, show1StartDate);

  await db.insert(s.shows).values({
    id: show1Id,
    name: show1Name,
    slug: show1Slug,
    showType: 'premier_open',
    showScope: 'single_breed',
    organisationId: org1Id,
    venueId: venue1Id,
    startDate: show1StartDate,
    endDate: show1StartDate,
    startTime: '10:00',
    status: 'entries_open',
    entriesOpenDate: new Date(),
    entryCloseDate: futureDate(30),
    postalCloseDate: futureDate(21),
    kcLicenceNo: '2026/4872',
    description:
      'The Highland German Shepherd Dog Society invites exhibitors to our flagship Premier Open Show ' +
      'at the Inverness Leisure Centre. This prestigious event attracts top-quality GSDs from across Scotland ' +
      'and beyond, with expert judging from some of the breed\'s most respected figures. ' +
      'Classes for all ages and abilities including Long Coat and Junior Handler sections. ' +
      'Rosettes to 5th place, special awards for Best in Show, Best Puppy, and Best Veteran. ' +
      'Hot refreshments, trade stands, and a warm Highland welcome await!',
    secretaryName: 'Fiona Campbell',
    secretaryEmail: 'secretary@highlandgsd.org.uk',
    secretaryPhone: '01463 555 123',
    secretaryAddress: '14 Ness Walk, Inverness, IV3 5NE',
    secretaryUserId: michael?.id,
    showOpenTime: '09:00',
    onCallVet: 'Highland Veterinary Group, 22 Harbour Road, Inverness IV1 1UA — Tel: 01463 555 999',
    acceptsPostalEntries: true,
    firstEntryFee: pence(12),
    subsequentEntryFee: pence(8),
    nfcEntryFee: pence(5),
    classSexArrangement: 'separate_sex',
    scheduleData: {
      country: 'scotland',
      publicAdmission: true,
      wetWeatherAccommodation: true,
      isBenched: false,
      acceptsNfc: true,
      latestArrivalTime: '09:45',
      showManager: 'Angus MacDonald',
      guarantors: [
        { name: 'Fiona Campbell', address: 'Inverness' },
        { name: 'Angus MacDonald', address: 'Inverness' },
        { name: 'Morag Stewart', address: 'Nairn' },
      ],
      officers: [
        { name: 'Angus MacDonald', position: 'Chairman' },
        { name: 'Fiona Campbell', position: 'Show Secretary' },
        { name: 'Morag Stewart', position: 'Treasurer' },
        { name: 'Donald Fraser', position: 'Ring Secretary' },
        { name: 'Eilidh MacLeod', position: 'Committee Member' },
        { name: 'Hamish Grant', position: 'Committee Member' },
      ],
      awardsDescription:
        'Best in Show, Reserve Best in Show, Best Puppy in Show, Reserve Best Puppy in Show, ' +
        'Best Veteran in Show, Best Long Coat in Show. Rosettes to 5th place in all classes. ' +
        'The Royal Canin Challenge Cup for Best in Show. The MacDonald Memorial Trophy for Best Puppy.',
      prizeMoney: 'No prize money — trophies, rosettes, and special awards.',
      directions:
        'From A9: Follow signs to Inverness city centre, then Bught Park / Leisure Centre. ' +
        'The Leisure Centre is signposted from the Ness Bridge roundabout. ' +
        'Ample free parking on site. Postcode for sat nav: IV3 5SS.',
      catering: 'Hot and cold food available from the Leisure Centre café. Tea, coffee, and home baking from the club stand.',
      futureShowDates: 'Our next Championship Show is scheduled for September 2026.',
      additionalNotes: 'Dogs must be kept on leads at all times when not in the ring. Please clean up after your dog.',
    },
  });
  console.log(`  ✓ Show: ${show1Name} (slug: ${show1Slug})`);

  // Rings
  const ring1aId = uuid();
  const ring1bId = uuid();
  await db.insert(s.rings).values([
    { id: ring1aId, showId: show1Id, number: 1, startTime: '10:00' },
    { id: ring1bId, showId: show1Id, number: 2, startTime: '10:00' },
  ]);

  // Judges
  const judge1aId = uuid();
  const judge1bId = uuid();
  await db.insert(s.judges).values([
    { id: judge1aId, name: 'Mrs Elaine Robertson', contactEmail: 'elaine.robertson@email.com' },
    { id: judge1bId, name: 'Mr Keith Phillips', contactEmail: 'keith.phillips@email.com' },
  ]);

  const gsd = getBreed('German Shepherd Dog');

  await db.insert(s.judgeAssignments).values([
    { showId: show1Id, judgeId: judge1aId, breedId: gsd.id, ringId: ring1aId },
    { showId: show1Id, judgeId: judge1bId, ringId: ring1bId }, // Long coat + JH
  ]);
  console.log('  ✓ Judges: Mrs Elaine Robertson (GSD), Mr Keith Phillips (Long Coat/JH)');

  // Classes — GSD, separate sex
  const show1ClassNames = [
    'Minor Puppy', 'Puppy', 'Junior', 'Yearling', 'Maiden', 'Novice',
    'Post Graduate', 'Limit', 'Open', 'Veteran',
  ];
  const show1LCClassNames = ['Special Long Coat Puppy', 'Special Long Coat Open'];
  const show1JHClassNames = ['Junior Handler (6-11)', 'Junior Handler (12-16)'];

  const show1ClassIds: { id: string; name: string; sex: string | null }[] = [];
  let classNum = 1;

  // Dogs first, then Bitches
  for (const sex of ['dog', 'bitch'] as const) {
    for (const name of show1ClassNames) {
      const id = uuid();
      show1ClassIds.push({ id, name, sex });
      await db.insert(s.showClasses).values({
        id,
        showId: show1Id,
        breedId: gsd.id,
        classDefinitionId: getClassDef(name).id,
        sex,
        entryFee: classNum === 1 ? pence(12) : pence(8),
        sortOrder: classNum,
        classNumber: classNum,
        isBreedSpecific: true,
      });
      classNum++;
    }
  }

  // Long coat classes
  for (const sex of ['dog', 'bitch'] as const) {
    for (const name of show1LCClassNames) {
      const id = uuid();
      show1ClassIds.push({ id, name, sex });
      await db.insert(s.showClasses).values({
        id,
        showId: show1Id,
        breedId: gsd.id,
        classDefinitionId: getClassDef(name).id,
        sex,
        entryFee: pence(8),
        sortOrder: classNum,
        classNumber: classNum,
        isBreedSpecific: true,
      });
      classNum++;
    }
  }

  // Junior Handler — no sex, no breed
  for (const name of show1JHClassNames) {
    const id = uuid();
    show1ClassIds.push({ id, name, sex: null });
    await db.insert(s.showClasses).values({
      id,
      showId: show1Id,
      classDefinitionId: getClassDef(name).id,
      sex: null,
      entryFee: pence(5),
      sortOrder: classNum,
      classNumber: classNum,
      isBreedSpecific: false,
    });
    classNum++;
  }
  console.log(`  ✓ ${classNum - 1} classes created`);

  // Sponsors
  const sponsor1Ids: string[] = [];
  const show1Sponsors = [
    {
      name: 'Royal Canin', category: 'pet_food' as const,
      website: 'https://www.royalcanin.com/uk',
      logoUrl: PLACEHOLDER(240, 80, 'cc0000', 'FFFFFF', 'ROYAL CANIN'),
      tier: 'title' as const, customTitle: 'Official Nutrition Partner',
      specialPrizes: 'Royal Canin Challenge Cup for Best in Show plus winner\'s hamper valued at £150',
    },
    {
      name: 'Arden Grange', category: 'pet_food' as const,
      website: 'https://www.ardengrange.com',
      logoUrl: PLACEHOLDER(200, 70, '2d5f3f', 'FFFFFF', 'ARDEN GRANGE'),
      tier: 'show' as const, customTitle: 'Official Show Sponsor',
      specialPrizes: 'Arden Grange goodie bag for all Best of Sex winners',
    },
    {
      name: 'Skinner\'s Field & Trial', category: 'pet_food' as const,
      website: 'https://www.skinners.co.uk',
      logoUrl: PLACEHOLDER(200, 70, '8B4513', 'FFFFFF', "SKINNER'S"),
      tier: 'class' as const, customTitle: null,
      specialPrizes: null,
    },
    {
      name: 'Highland Pet Supplies', category: 'local_business' as const,
      website: null,
      logoUrl: PLACEHOLDER(200, 70, '4a6741', 'FFFFFF', 'Highland Pets'),
      tier: 'class' as const, customTitle: null,
      specialPrizes: '£25 gift voucher for Best Puppy in Show',
    },
    {
      name: 'McTavish Grooming', category: 'grooming' as const,
      website: null,
      logoUrl: PLACEHOLDER(200, 70, '6B5B95', 'FFFFFF', 'McTavish'),
      tier: 'class' as const, customTitle: null,
      specialPrizes: 'Free grooming session for Best Veteran in Show',
    },
    {
      name: 'The Dorado Kennel', category: 'breed_club' as const,
      website: null,
      logoUrl: null,
      tier: 'prize' as const, customTitle: 'Trophy Donor',
      specialPrizes: 'The Dorado Memorial Trophy for Best Dog, The Dorado Bitch Trophy for Best Bitch',
    },
  ];

  for (let i = 0; i < show1Sponsors.length; i++) {
    const sp = show1Sponsors[i];
    const sponsorId = uuid();
    const showSponsorId = uuid();
    sponsor1Ids.push(showSponsorId);

    await db.insert(s.sponsors).values({
      id: sponsorId,
      organisationId: org1Id,
      name: sp.name,
      category: sp.category,
      website: sp.website,
      logoUrl: sp.logoUrl,
    });
    await db.insert(s.showSponsors).values({
      id: showSponsorId,
      showId: show1Id,
      sponsorId,
      tier: sp.tier,
      displayOrder: i,
      customTitle: sp.customTitle,
      specialPrizes: sp.specialPrizes,
    });
  }
  console.log(`  ✓ ${show1Sponsors.length} sponsors assigned`);

  // Class sponsorships — Skinner's sponsors Open Dog & Open Bitch
  const openDog = show1ClassIds.find((c) => c.name === 'Open' && c.sex === 'dog');
  const openBitch = show1ClassIds.find((c) => c.name === 'Open' && c.sex === 'bitch');
  const limitDog = show1ClassIds.find((c) => c.name === 'Limit' && c.sex === 'dog');
  const limitBitch = show1ClassIds.find((c) => c.name === 'Limit' && c.sex === 'bitch');
  const pupDog = show1ClassIds.find((c) => c.name === 'Puppy' && c.sex === 'dog');
  const pupBitch = show1ClassIds.find((c) => c.name === 'Puppy' && c.sex === 'bitch');
  const vetDog = show1ClassIds.find((c) => c.name === 'Veteran' && c.sex === 'dog');
  const vetBitch = show1ClassIds.find((c) => c.name === 'Veteran' && c.sex === 'bitch');

  const classSponsorships = [
    { classId: openDog?.id, showSponsorId: sponsor1Ids[2], trophy: 'The Skinner\'s Challenge Trophy', donor: 'Skinner\'s Field & Trial' },
    { classId: openBitch?.id, showSponsorId: sponsor1Ids[2], trophy: 'The Skinner\'s Bitch Trophy', donor: 'Skinner\'s Field & Trial' },
    { classId: limitDog?.id, showSponsorId: sponsor1Ids[5], trophy: 'The Dorado Memorial Trophy', donor: 'Mr & Mrs J. Dorado' },
    { classId: limitBitch?.id, showSponsorId: sponsor1Ids[5], trophy: 'The Dorado Bitch Trophy', donor: 'Mr & Mrs J. Dorado' },
    { classId: pupDog?.id, showSponsorId: sponsor1Ids[3], trophy: 'Highland Pet Supplies Puppy Dog Cup', donor: null },
    { classId: pupBitch?.id, showSponsorId: sponsor1Ids[3], trophy: 'Highland Pet Supplies Puppy Bitch Cup', donor: null },
    { classId: vetDog?.id, showSponsorId: sponsor1Ids[4], trophy: 'The McTavish Veteran Trophy', donor: 'McTavish Grooming' },
    { classId: vetBitch?.id, showSponsorId: sponsor1Ids[4], trophy: 'The McTavish Veteran Bitch Trophy', donor: 'McTavish Grooming' },
  ];

  for (const cs of classSponsorships) {
    if (!cs.classId) continue;
    await db.insert(s.classSponsorships).values({
      showClassId: cs.classId,
      showSponsorId: cs.showSponsorId,
      trophyName: cs.trophy,
      trophyDonor: cs.donor,
    });
  }
  console.log(`  ✓ ${classSponsorships.filter((c) => c.classId).length} class sponsorships / trophies`);

  // Sundry items
  await db.insert(s.sundryItems).values([
    { showId: show1Id, name: 'Catalogue', description: 'Official printed show catalogue', priceInPence: pence(3), maxPerOrder: 2, sortOrder: 1 },
    { showId: show1Id, name: 'Car Parking', description: 'On-site parking permit', priceInPence: pence(5), maxPerOrder: 1, sortOrder: 2 },
  ]);

  // Exhibitors, dogs, entries
  const gsdDogNames = [
    { reg: 'Doradoville Dark Knight', pet: 'Knight', sex: 'dog' as const, dob: '2024-06-15', sire: 'Ch Doradoville Donatello', dam: 'Doradoville Duchess', colour: 'Black & Tan', breeder: 'J. Dorado' },
    { reg: 'Doradoville Dream Catcher', pet: 'Dream', sex: 'bitch' as const, dob: '2024-06-15', sire: 'Ch Doradoville Donatello', dam: 'Doradoville Duchess', colour: 'Sable', breeder: 'J. Dorado' },
    { reg: 'Doradoville Dark Shadow', pet: 'Shadow', sex: 'dog' as const, dob: '2024-06-15', sire: 'Ch Doradoville Donatello', dam: 'Doradoville Duchess', colour: 'Black & Tan', breeder: 'J. Dorado' },
    { reg: 'Doradoville Destiny', pet: 'Destiny', sex: 'bitch' as const, dob: '2024-02-10', sire: 'Ch Doradoville Donatello', dam: 'Doradoville Dior', colour: 'Black & Gold', breeder: 'J. Dorado' },
    { reg: 'Doradoville Dorado Star', pet: 'Star', sex: 'bitch' as const, dob: '2023-03-20', sire: 'Doradoville Dorado', dam: 'Doradoville Dawn', colour: 'Sable', breeder: 'J. Dorado' },
    { reg: 'Doradoville Donatello at Donavon', pet: 'Tello', sex: 'dog' as const, dob: '2019-09-01', sire: 'Doradoville Don', dam: 'Doradoville Diva', colour: 'Black & Tan', breeder: 'J. Dorado' },
    { reg: 'Doradoville Dorian Grey', pet: 'Dorian', sex: 'dog' as const, dob: '2022-11-15', sire: 'Doradoville Don', dam: 'Doradoville Duchess', colour: 'Bi-colour', breeder: 'J. Dorado' },
    { reg: 'Doradoville Diamond Girl', pet: 'Diamond', sex: 'bitch' as const, dob: '2022-11-15', sire: 'Doradoville Don', dam: 'Doradoville Duchess', colour: 'Black & Gold', breeder: 'J. Dorado' },
    { reg: 'Doradoville Dominator', pet: 'Dom', sex: 'dog' as const, dob: '2021-01-08', sire: 'Doradoville Don', dam: 'Doradoville Della', colour: 'Black & Tan', breeder: 'J. Dorado' },
    { reg: 'Doradoville Delilah', pet: 'Lila', sex: 'bitch' as const, dob: '2021-01-08', sire: 'Doradoville Don', dam: 'Doradoville Della', colour: 'Black & Gold', breeder: 'J. Dorado' },
    { reg: 'Doradoville Daredevil', pet: 'Dare', sex: 'dog' as const, dob: '2018-04-22', sire: 'Doradoville Duke', dam: 'Doradoville Darling', colour: 'Black & Tan', breeder: 'J. Dorado' },
    { reg: 'Doradoville Damsel', pet: 'Damsel', sex: 'bitch' as const, dob: '2018-04-22', sire: 'Doradoville Duke', dam: 'Doradoville Darling', colour: 'Sable', breeder: 'J. Dorado' },
    { reg: 'Doradoville Dark Angel', pet: 'Angel', sex: 'bitch' as const, dob: '2025-01-10', sire: 'Ch Doradoville Donatello', dam: 'Doradoville Dawn', colour: 'Black & Gold', breeder: 'J. Dorado' },
    { reg: 'Doradoville Diego', pet: 'Diego', sex: 'dog' as const, dob: '2025-01-10', sire: 'Ch Doradoville Donatello', dam: 'Doradoville Dawn', colour: 'Black & Tan', breeder: 'J. Dorado' },
    { reg: 'Doradoville Dynasty', pet: 'Dynasty', sex: 'bitch' as const, dob: '2023-08-05', sire: 'Doradoville Dorado', dam: 'Doradoville Diva', colour: 'Sable', breeder: 'J. Dorado' },
  ];

  const exhibitors = [
    { name: 'Fiona Campbell', email: 'fiona.campbell@test.com', postcode: 'IV3 5NE' },
    { name: 'Angus MacDonald', email: 'angus.macdonald@test.com', postcode: 'IV2 3AA' },
    { name: 'Morag Stewart', email: 'morag.stewart@test.com', postcode: 'IV12 4AB' },
    { name: 'Eilidh MacLeod', email: 'eilidh.macleod@test.com', postcode: 'PH1 5LJ' },
    { name: 'Donald Fraser', email: 'donald.fraser@test.com', postcode: 'AB10 1XG' },
    { name: 'Catriona Ross', email: 'catriona.ross@test.com', postcode: 'G12 8QQ' },
    { name: 'Hamish Grant', email: 'hamish.grant@test.com', postcode: 'EH3 6AA' },
    { name: 'Isla MacKay', email: 'isla.mackay@test.com', postcode: 'DD1 4BJ' },
  ];

  // Create exhibitors + dogs + entries
  let entryCount = 0;
  for (let i = 0; i < exhibitors.length; i++) {
    const ex = exhibitors[i];
    // Check if user exists
    let user = await db.query.users.findFirst({ where: eq(s.users.email, ex.email) });
    if (!user) {
      const userId = uuid();
      await db.insert(s.users).values({
        id: userId,
        email: ex.email,
        name: ex.name,
        postcode: ex.postcode,
        role: 'exhibitor',
        onboardingCompletedAt: new Date(),
      });
      user = { id: userId } as typeof user;
    }

    // Each exhibitor gets 1-2 dogs
    const dogsForExhibitor = gsdDogNames.slice(i * 2, i * 2 + 2);

    for (const dogData of dogsForExhibitor) {
      const dogId = uuid();
      await db.insert(s.dogs).values({
        id: dogId,
        registeredName: dogData.reg,
        breedId: gsd.id,
        sex: dogData.sex,
        dateOfBirth: dogData.dob,
        sireName: dogData.sire,
        damName: dogData.dam,
        breederName: dogData.breeder,
        colour: dogData.colour,
        ownerId: user!.id,
      });

      // Pick 2-3 classes for this dog
      const eligibleClasses = show1ClassIds.filter((c) => c.sex === dogData.sex && c.name !== 'Junior Handler (6-11)' && c.name !== 'Junior Handler (12-16)');
      const selectedClasses = eligibleClasses
        .sort(() => Math.random() - 0.5)
        .slice(0, 2 + Math.floor(Math.random() * 2));

      const totalFee = selectedClasses.length > 0 ? pence(12) + (selectedClasses.length - 1) * pence(8) : 0;
      const orderId = uuid();
      const entryId = uuid();

      await db.insert(s.orders).values({
        id: orderId,
        showId: show1Id,
        exhibitorId: user!.id,
        status: 'paid',
        totalAmount: totalFee,
      });

      await db.insert(s.entries).values({
        id: entryId,
        showId: show1Id,
        dogId,
        exhibitorId: user!.id,
        orderId,
        status: 'confirmed',
        totalFee,
        entryDate: new Date(),
      });

      for (let ci = 0; ci < selectedClasses.length; ci++) {
        await db.insert(s.entryClasses).values({
          entryId,
          showClassId: selectedClasses[ci].id,
          fee: ci === 0 ? pence(12) : pence(8),
        });
      }

      await db.insert(s.payments).values({
        orderId,
        amount: totalFee,
        status: 'succeeded',
        type: 'initial',
      });

      entryCount++;
    }
  }
  console.log(`  ✓ ${exhibitors.length} exhibitors, ${entryCount} entries created`);

  /* ═══════════════════════════════════════════════ */
  /*  SHOW 2: Multi-Breed — Scottish All Breeds      */
  /* ═══════════════════════════════════════════════ */

  console.log('\n── Show 2: Scottish All Breeds Championship Show ──\n');

  // Organisation
  const org2Id = uuid();
  await db.insert(s.organisations).values({
    id: org2Id,
    name: 'Scottish Kennel Club',
    type: 'multi_breed',
    contactEmail: 'shows@scottishkc.org.uk',
    contactPhone: '0131 555 0200',
    website: 'https://scottishkc.org.uk',
    logoUrl: PLACEHOLDER(300, 120, '1a237e', 'C9A84C', 'Scottish KC'),
  });
  console.log('  ✓ Organisation: Scottish Kennel Club');

  if (michael) {
    await db.insert(s.memberships).values({
      userId: michael.id,
      organisationId: org2Id,
      status: 'active',
    });
  }

  // Venue
  const venue2Id = uuid();
  await db.insert(s.venues).values({
    id: venue2Id,
    name: 'Royal Highland Centre',
    address: 'Ingliston, Edinburgh',
    postcode: 'EH28 8NB',
    lat: '55.9425000',
    lng: '-3.3748000',
    indoorOutdoor: 'both',
    capacity: 5000,
  });
  console.log('  ✓ Venue: Royal Highland Centre');

  // Show
  const show2Id = uuid();
  const show2Name = 'Scottish All Breeds Championship Show';
  const show2StartDate = dateStr(60);
  const show2EndDate = dateStr(61);
  const show2Slug = generateShowSlug(show2Name, show2StartDate);

  await db.insert(s.shows).values({
    id: show2Id,
    name: show2Name,
    slug: show2Slug,
    showType: 'championship',
    showScope: 'general',
    organisationId: org2Id,
    venueId: venue2Id,
    startDate: show2StartDate,
    endDate: show2EndDate,
    startTime: '09:00',
    status: 'entries_open',
    entriesOpenDate: new Date(),
    entryCloseDate: futureDate(45),
    postalCloseDate: futureDate(35),
    kcLicenceNo: '2026/0089',
    description:
      'Scotland\'s most prestigious all-breed championship show returns to the magnificent Royal Highland Centre ' +
      'in Edinburgh. Over 200 breeds compete across all seven Kennel Club groups for Challenge Certificates, ' +
      'with the opportunity to qualify for Crufts. Three championship rings with international judging panels, ' +
      'plus Discover Dogs, have-a-go agility, and over 100 trade stands. ' +
      'Free parking for all visitors. The show runs over two days — Gundogs, Hounds, and Terriers on Day 1; ' +
      'Pastoral, Toy, Utility, and Working on Day 2.',
    secretaryName: 'Margaret Thomson',
    secretaryEmail: 'shows@scottishkc.org.uk',
    secretaryPhone: '0131 555 0200',
    secretaryAddress: 'Scottish Kennel Club, Eskmills Park, Station Road, Musselburgh, EH21 7PQ',
    secretaryUserId: michael?.id,
    showOpenTime: '08:00',
    onCallVet: 'Inglis Veterinary Hospital, 14 St Mary Street, Edinburgh EH1 1SU — Tel: 0131 555 0300',
    acceptsPostalEntries: true,
    firstEntryFee: pence(28),
    subsequentEntryFee: pence(15),
    nfcEntryFee: pence(10),
    classSexArrangement: 'separate_sex',
    scheduleData: {
      country: 'scotland',
      publicAdmission: true,
      wetWeatherAccommodation: true,
      isBenched: true,
      benchingRemovalTime: '16:00',
      acceptsNfc: true,
      judgedOnGroupSystem: true,
      latestArrivalTime: '08:30',
      showManager: 'Robert Davidson',
      guarantors: [
        { name: 'Margaret Thomson', address: 'Musselburgh' },
        { name: 'Robert Davidson', address: 'Edinburgh' },
        { name: 'Helen Crawford', address: 'Glasgow' },
        { name: 'Ian MacPherson', address: 'Stirling' },
      ],
      officers: [
        { name: 'Robert Davidson', position: 'Chairman' },
        { name: 'Margaret Thomson', position: 'Show Secretary' },
        { name: 'Helen Crawford', position: 'Vice-Chairman' },
        { name: 'Ian MacPherson', position: 'Treasurer' },
        { name: 'Alistair McKenzie', position: 'Ring Manager' },
        { name: 'Flora MacDougall', position: 'Chief Steward' },
        { name: 'Kenneth Ross', position: 'Benching Manager' },
      ],
      awardsDescription:
        'Challenge Certificates (CCs) and Reserve CCs awarded in every breed. ' +
        'Best in Show, Reserve Best in Show, Best Puppy in Show. ' +
        'Group winners and Reserve Group winners. ' +
        'Rosettes to 5th place. Special awards for Best Veteran, Best Bred-by-Exhibitor.',
      prizeMoney: 'Prize money in all Group Finals: 1st £100, 2nd £50, 3rd £25.',
      directions:
        'Royal Highland Centre is at Ingliston, adjacent to Edinburgh Airport. ' +
        'Exit M8/M9 at Junction 2 and follow signs. Well signposted from all approaches. ' +
        'Free parking for all exhibitors and public. Postcode: EH28 8NB.',
      catering: 'Multiple catering outlets including sit-down restaurant, hot food stands, coffee bars, and a licensed bar.',
      futureShowDates: 'The Scottish KC Open Show is in November 2026. The 2027 Championship Show dates will be announced at Crufts.',
      additionalNotes:
        'Benching is provided for all breeds. Dogs must remain on their benches when not being exercised or exhibited. ' +
        'Benching removal time is 4:00pm. Exercise areas are provided outside Halls 1 and 3.',
    },
  });
  console.log(`  ✓ Show: ${show2Name} (slug: ${show2Slug})`);

  // Rings
  const ring2Ids = [uuid(), uuid(), uuid()];
  await db.insert(s.rings).values([
    { id: ring2Ids[0], showId: show2Id, number: 1, startTime: '09:00' },
    { id: ring2Ids[1], showId: show2Id, number: 2, startTime: '09:00' },
    { id: ring2Ids[2], showId: show2Id, number: 3, startTime: '09:30' },
  ]);

  // Judges for multi-breed
  const mbJudges = [
    { id: uuid(), name: 'Mr Andrew Brace', email: 'andrew.brace@test.com' },
    { id: uuid(), name: 'Mrs Zena Thorn-Andrews', email: 'zena.thorn@test.com' },
    { id: uuid(), name: 'Mr Frank Kane', email: 'frank.kane@test.com' },
    { id: uuid(), name: 'Dr Patricia Craige Trotter', email: 'patricia.trotter@test.com' },
  ];
  await db.insert(s.judges).values(mbJudges.map((j) => ({ id: j.id, name: j.name, contactEmail: j.email })));

  // Breeds for the multi-breed show — 3-4 breeds per group
  const mbBreeds = [
    { name: 'Labrador Retriever', judge: 0, ring: 0 },
    { name: 'Golden Retriever', judge: 0, ring: 0 },
    { name: 'English Springer Spaniel', judge: 0, ring: 0 },
    { name: 'Cocker Spaniel', judge: 0, ring: 0 },
    { name: 'German Shepherd Dog', judge: 1, ring: 1 },
    { name: 'Border Collie', judge: 1, ring: 1 },
    { name: 'Collie (Rough)', judge: 1, ring: 1 },
    { name: 'Shetland Sheepdog', judge: 1, ring: 1 },
    { name: 'Rottweiler', judge: 2, ring: 2 },
    { name: 'Dobermann', judge: 2, ring: 2 },
    { name: 'Boxer', judge: 2, ring: 2 },
    { name: 'Siberian Husky', judge: 3, ring: 2 },
  ];

  const show2ClassIds: { id: string; breedName: string; className: string; sex: string | null }[] = [];
  let classNum2 = 1;
  const mbClassNames = ['Minor Puppy', 'Puppy', 'Junior', 'Post Graduate', 'Limit', 'Open'];

  for (const breedInfo of mbBreeds) {
    const breed = getBreed(breedInfo.name);

    // Judge assignment
    await db.insert(s.judgeAssignments).values({
      showId: show2Id,
      judgeId: mbJudges[breedInfo.judge].id,
      breedId: breed.id,
      ringId: ring2Ids[breedInfo.ring],
    });

    // Classes — separate sex
    for (const sex of ['dog', 'bitch'] as const) {
      for (const className of mbClassNames) {
        const id = uuid();
        show2ClassIds.push({ id, breedName: breedInfo.name, className, sex });
        await db.insert(s.showClasses).values({
          id,
          showId: show2Id,
          breedId: breed.id,
          classDefinitionId: getClassDef(className).id,
          sex,
          entryFee: classNum2 === 1 ? pence(28) : pence(15),
          sortOrder: classNum2,
          classNumber: classNum2,
          isBreedSpecific: true,
        });
        classNum2++;
      }
    }
  }
  console.log(`  ✓ ${mbBreeds.length} breeds, ${classNum2 - 1} classes, ${mbJudges.length} judges`);

  // Sponsors
  const show2Sponsors = [
    {
      name: 'Purina Pro Plan', category: 'pet_food' as const,
      website: 'https://www.purina.co.uk/pro-plan',
      logoUrl: PLACEHOLDER(240, 80, '8B0000', 'FFFFFF', 'PURINA PRO PLAN'),
      tier: 'title' as const, customTitle: 'Official Sponsor',
      specialPrizes: 'Purina Pro Plan Best in Show Trophy plus one year\'s supply of Pro Plan',
    },
    {
      name: 'Petplan Insurance', category: 'insurance' as const,
      website: 'https://www.petplan.co.uk',
      logoUrl: PLACEHOLDER(200, 70, '003366', 'FFFFFF', 'PETPLAN'),
      tier: 'show' as const, customTitle: 'Official Insurance Partner',
      specialPrizes: 'Petplan policy for Best Puppy in Show winner',
    },
    {
      name: 'Royal Canin', category: 'pet_food' as const,
      website: 'https://www.royalcanin.com/uk',
      logoUrl: PLACEHOLDER(200, 70, 'cc0000', 'FFFFFF', 'ROYAL CANIN'),
      tier: 'show' as const, customTitle: null,
      specialPrizes: 'Royal Canin hampers for all Group winners',
    },
    {
      name: 'Dogs Trust', category: 'other' as const,
      website: 'https://www.dogstrust.org.uk',
      logoUrl: PLACEHOLDER(200, 70, 'FFD700', '1a1a1a', 'DOGS TRUST'),
      tier: 'show' as const, customTitle: 'Rescue Partner',
      specialPrizes: null,
    },
    {
      name: 'Edinburgh Canine Supplies', category: 'pet_products' as const,
      website: null,
      logoUrl: PLACEHOLDER(200, 70, '2d4a2d', 'FFFFFF', 'Edinburgh Canine'),
      tier: 'class' as const, customTitle: null,
      specialPrizes: null,
    },
    {
      name: 'Thistle Veterinary', category: 'health_testing' as const,
      website: null,
      logoUrl: PLACEHOLDER(200, 70, '5B3A7A', 'FFFFFF', 'Thistle Vets'),
      tier: 'advertiser' as const, customTitle: null,
      specialPrizes: null,
    },
  ];

  const show2SponsorIds: string[] = [];
  for (let i = 0; i < show2Sponsors.length; i++) {
    const sp = show2Sponsors[i];
    const sponsorId = uuid();
    const showSponsorId = uuid();
    show2SponsorIds.push(showSponsorId);

    await db.insert(s.sponsors).values({
      id: sponsorId,
      organisationId: org2Id,
      name: sp.name,
      category: sp.category,
      website: sp.website,
      logoUrl: sp.logoUrl,
    });
    await db.insert(s.showSponsors).values({
      id: showSponsorId,
      showId: show2Id,
      sponsorId,
      tier: sp.tier,
      displayOrder: i,
      customTitle: sp.customTitle,
      specialPrizes: sp.specialPrizes,
    });
  }
  console.log(`  ✓ ${show2Sponsors.length} sponsors assigned`);

  // Sundry items
  await db.insert(s.sundryItems).values([
    { showId: show2Id, name: 'Catalogue', description: 'Official Championship Show catalogue (176 pages)', priceInPence: pence(8), maxPerOrder: 3, sortOrder: 1 },
    { showId: show2Id, name: 'VIP Ringside Pass', description: 'Priority ringside seating for both days', priceInPence: pence(25), maxPerOrder: 2, sortOrder: 2 },
    { showId: show2Id, name: 'Breed Critique Booklet', description: 'Post-show judge critiques for your breed (posted)', priceInPence: pence(5), maxPerOrder: 1, sortOrder: 3 },
  ]);

  // Create entries for the multi-breed show — 3 entries per breed (36 total)
  const mbExhibitors = [
    { name: 'James Henderson', email: 'james.henderson@test.com', postcode: 'EH1 1BB' },
    { name: 'Patricia Wilson', email: 'patricia.wilson@test.com', postcode: 'G1 1AA' },
    { name: 'Robert Morrison', email: 'robert.morrison@test.com', postcode: 'AB1 1CC' },
    { name: 'Susan MacIntyre', email: 'susan.macintyre@test.com', postcode: 'DD1 1DD' },
    { name: 'William Ferguson', email: 'william.ferguson@test.com', postcode: 'PA1 1EE' },
    { name: 'Catherine Stewart', email: 'catherine.stewart@test.com', postcode: 'FK1 1FF' },
    { name: 'David Cameron', email: 'david.cameron@test.com', postcode: 'IV1 1GG' },
    { name: 'Elizabeth Reid', email: 'elizabeth.reid@test.com', postcode: 'KY1 1HH' },
    { name: 'Thomas Anderson', email: 'thomas.anderson@test.com', postcode: 'ML1 1JJ' },
    { name: 'Margaret Burns', email: 'margaret.burns@test.com', postcode: 'PH1 1KK' },
    { name: 'Andrew Campbell', email: 'andrew.campbell2@test.com', postcode: 'DG1 1LL' },
    { name: 'Janet Murray', email: 'janet.murray@test.com', postcode: 'TD1 1MM' },
  ];

  const petNames = ['Max', 'Bella', 'Charlie', 'Daisy', 'Rocky', 'Molly', 'Duke', 'Rosie', 'Bear', 'Luna', 'Archie', 'Ruby'];
  const sires = ['Ch Donavon Gold Standard', 'Donavon Donatello', 'Donavon Dark Knight', 'Ch Donavon Designer Label'];
  const dams = ['Donavon Diamond Girl', 'Donavon Dream Catcher', 'Donavon Diva', 'Ch Donavon Destiny'];

  let mbEntryCount = 0;
  for (let i = 0; i < mbExhibitors.length; i++) {
    const ex = mbExhibitors[i];
    let user = await db.query.users.findFirst({ where: eq(s.users.email, ex.email) });
    if (!user) {
      const userId = uuid();
      await db.insert(s.users).values({
        id: userId, email: ex.email, name: ex.name,
        postcode: ex.postcode, role: 'exhibitor', onboardingCompletedAt: new Date(),
      });
      user = { id: userId } as typeof user;
    }

    // Each exhibitor enters 1 breed, 1 dog
    const breedInfo = mbBreeds[i % mbBreeds.length];
    const breed = getBreed(breedInfo.name);
    const sex = i % 2 === 0 ? 'dog' as const : 'bitch' as const;
    const dogId = uuid();

    await db.insert(s.dogs).values({
      id: dogId,
      registeredName: `Donavon ${petNames[i]} of ${ex.name.split(' ')[1]}`,
      breedId: breed.id,
      sex,
      dateOfBirth: `202${2 + (i % 4)}-${String((i % 12) + 1).padStart(2, '0')}-15`,
      sireName: pick(sires),
      damName: pick(dams),
      breederName: `${ex.name.split(' ')[1]} Kennels`,
      colour: pick(['Black', 'Yellow', 'Chocolate', 'Golden', 'Tricolour', 'Sable', 'Black & Tan', 'Fawn', 'Brindle', 'Red']),
      ownerId: user!.id,
    });

    // Enter 2-3 classes
    const eligibleClasses = show2ClassIds.filter((c) => c.breedName === breedInfo.name && c.sex === sex);
    const selectedClasses = eligibleClasses.sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
    const totalFee = pence(28) + (selectedClasses.length - 1) * pence(15);

    const orderId = uuid();
    const entryId = uuid();

    await db.insert(s.orders).values({
      id: orderId, showId: show2Id, exhibitorId: user!.id, status: 'paid', totalAmount: totalFee,
    });
    await db.insert(s.entries).values({
      id: entryId, showId: show2Id, dogId, exhibitorId: user!.id, orderId, status: 'confirmed', totalFee, entryDate: new Date(),
    });
    for (let ci = 0; ci < selectedClasses.length; ci++) {
      await db.insert(s.entryClasses).values({
        entryId, showClassId: selectedClasses[ci].id, fee: ci === 0 ? pence(28) : pence(15),
      });
    }
    await db.insert(s.payments).values({ orderId, amount: totalFee, status: 'succeeded', type: 'initial' });
    mbEntryCount++;
  }
  console.log(`  ✓ ${mbExhibitors.length} exhibitors, ${mbEntryCount} entries created`);

  /* ═══════════════════════════════════════════════ */
  /*  Summary                                        */
  /* ═══════════════════════════════════════════════ */

  console.log('\n═══ Done! ═══');
  console.log(`\nShow 1 (single-breed): /shows/${show1Slug}`);
  console.log(`Show 2 (multi-breed):  /shows/${show2Slug}`);
  console.log('\nBoth shows are entries_open with future close dates.');
}

main().catch(console.error);
