import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema/index.js';

const SHOW_ID = '112d5104-f0fc-463c-8bfd-2942337b6fb4';
const ORG_ID = 'b8a6dfcd-65aa-4442-abc7-342873f02be4';

async function main() {
  if (!db) {
    console.log('No database connection');
    return;
  }

  console.log('═══ Populating show with marketing data ═══\n');

  // 1. Update show to look its best
  const closeDateFuture = new Date();
  closeDateFuture.setDate(closeDateFuture.getDate() + 5); // 5 days from now
  closeDateFuture.setHours(23, 59, 0, 0);

  await db
    .update(schema.shows)
    .set({
      entryCloseDate: closeDateFuture,
      startTime: '10:00',
      showOpenTime: '09:00',
      secretaryName: 'Amanda McAteer',
      secretaryEmail: 'mandy@hundarkgsd.co.uk',
      secretaryPhone: '07813 880000',
      secretaryAddress: 'Clyde Valley GSD Club, Strathaven, ML10 6QD',
      onCallVet: 'Clyde Veterinary Group, Hyndford Road, Lanark ML11 9SZ',
      kcLicenceNo: '2026/3847',
      description:
        'The Clyde Valley German Shepherd Dog Club Premier Open Show returns to Strathaven Rugby Club for a day of exceptional competition. ' +
        'Judging commences at 10:00am with 12 classes across all coat varieties. ' +
        'This show qualifies for Kennel Club Stud Book entries and is open to all exhibitors. ' +
        'Entries are accepted online via Remi — the easiest way to enter your dog.',
      scheduleData: {
        country: 'scotland',
        publicAdmission: true,
        wetWeatherAccommodation: true,
        isBenched: false,
        acceptsNfc: true,
        latestArrivalTime: '09:45',
        showManager: 'David McAteer',
        guarantors: [
          { name: 'Amanda McAteer', address: 'Strathaven' },
          { name: 'David McAteer', address: 'Strathaven' },
          { name: 'James Wilson', address: 'Hamilton' },
        ],
        officers: [
          { name: 'Amanda McAteer', position: 'Chairperson & Show Secretary' },
          { name: 'David McAteer', position: 'Vice-Chairperson' },
          { name: 'James Wilson', position: 'Treasurer' },
          { name: 'Sarah Brown', position: 'Committee Member' },
          { name: 'Karen Mitchell', position: 'Committee Member' },
        ],
        awardsDescription:
          'Best in Show, Reserve Best in Show, Best Puppy in Show, Best Veteran in Show. ' +
          'Rosettes to 5th place in all classes. Special rosettes for all Best of Sex awards.',
        directions:
          'From M74: Exit at Junction 8 (Strathaven). Follow A71 towards Strathaven. ' +
          'The Rugby Club is on the left just before the town centre, well signposted. ' +
          'Postcode for sat nav: ML10 6QD.',
        catering: 'Hot and cold refreshments available throughout the day from the Rugby Club kitchen.',
      },
    })
    .where(eq(schema.shows.id, SHOW_ID));

  console.log('✓ Show updated with rich details + future close date');

  // 2. Create sponsors in the org directory
  const sponsorData = [
    {
      name: 'Royal Canin',
      category: 'pet_food' as const,
      website: 'https://www.royalcanin.com/uk',
      logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Royal-Canin-Logo.svg/640px-Royal-Canin-Logo.svg.png',
      contactName: 'UK Sponsorship Team',
      contactEmail: 'sponsorship@royalcanin.com',
      notes: 'Exclusive nutrition partner. Logo must appear on all printed materials per agreement.',
    },
    {
      name: "Skinner's Pet Foods",
      category: 'pet_food' as const,
      website: 'https://www.skinners.co.uk',
      logoUrl: 'https://ui-avatars.com/api/?name=Skinners&background=2D5F3F&color=fff&size=200&font-size=0.35&bold=true',
      contactName: 'Events Team',
      contactEmail: 'events@skinners.co.uk',
      notes: 'Scottish-based pet food company. Long-standing supporter of the GSD community.',
    },
    {
      name: 'Petplan',
      category: 'insurance' as const,
      website: 'https://www.petplan.co.uk',
      logoUrl: 'https://ui-avatars.com/api/?name=Petplan&background=1e40af&color=fff&size=200&font-size=0.35&bold=true',
      contactName: 'Events & Sponsorship',
      contactEmail: 'events@petplan.co.uk',
      notes: 'Pet insurance provider. Keen to support KC-affiliated shows.',
    },
    {
      name: 'Vet-Concept',
      category: 'health_testing' as const,
      website: 'https://www.vet-concept.com',
      logoUrl: 'https://ui-avatars.com/api/?name=VC&background=059669&color=fff&size=200&font-size=0.4&bold=true',
      contactName: 'Dr. Klaus Weber',
      contactEmail: 'info@vet-concept.com',
      notes: 'German health supplement brand, popular in GSD circles.',
    },
    {
      name: 'The Dorado Kennel',
      category: 'breed_club' as const,
      logoUrl: 'https://ui-avatars.com/api/?name=Dorado&background=B8963E&color=fff&size=200&font-size=0.3&bold=true',
      contactName: 'Helen & Robert Stewart',
      contactEmail: 'dorado.gsds@outlook.com',
      notes: 'Well-known GSD kennel. Donates trophies annually.',
    },
    {
      name: 'Groomers Choice Scotland',
      category: 'grooming' as const,
      website: 'https://www.groomerschoice.co.uk',
      logoUrl: 'https://ui-avatars.com/api/?name=GC&background=7c3aed&color=fff&size=200&font-size=0.4&bold=true',
      contactName: 'Fiona Campbell',
      contactEmail: 'fiona@groomerschoice.co.uk',
      notes: 'Professional grooming supplies. Local business supporter.',
    },
  ];

  const createdSponsors: { id: string; name: string }[] = [];

  for (const sp of sponsorData) {
    const [created] = await db
      .insert(schema.sponsors)
      .values({ ...sp, organisationId: ORG_ID })
      .returning();
    createdSponsors.push({ id: created!.id, name: created!.name });
    console.log(`✓ Created sponsor: ${created!.name}`);
  }

  // 3. Assign sponsors to the show with tiers
  const tierAssignments: {
    sponsorName: string;
    tier: 'title' | 'show' | 'class' | 'prize' | 'advertiser';
    displayOrder: number;
    customTitle?: string;
    specialPrizes?: string;
  }[] = [
    {
      sponsorName: 'Royal Canin',
      tier: 'title',
      displayOrder: 0,
      customTitle: 'Official Nutrition Partner',
      specialPrizes: 'Royal Canin Goody Bag for Best in Show & Reserve Best in Show',
    },
    {
      sponsorName: "Skinner's Pet Foods",
      tier: 'show',
      displayOrder: 1,
      customTitle: 'Show Sponsor',
      specialPrizes: "Skinner's hamper for Best Puppy in Show",
    },
    {
      sponsorName: 'Petplan',
      tier: 'show',
      displayOrder: 2,
      customTitle: 'Insurance Partner',
    },
    {
      sponsorName: 'Vet-Concept',
      tier: 'class',
      displayOrder: 3,
    },
    {
      sponsorName: 'The Dorado Kennel',
      tier: 'prize',
      displayOrder: 4,
    },
    {
      sponsorName: 'Groomers Choice Scotland',
      tier: 'advertiser',
      displayOrder: 5,
    },
  ];

  const showSponsorMap: Record<string, string> = {}; // sponsorName → showSponsorId

  for (const ta of tierAssignments) {
    const sponsor = createdSponsors.find((s) => s.name === ta.sponsorName);
    if (!sponsor) continue;

    const [ss] = await db
      .insert(schema.showSponsors)
      .values({
        showId: SHOW_ID,
        sponsorId: sponsor.id,
        tier: ta.tier,
        displayOrder: ta.displayOrder,
        customTitle: ta.customTitle ?? null,
        specialPrizes: ta.specialPrizes ?? null,
      })
      .returning();

    showSponsorMap[ta.sponsorName] = ss!.id;
    console.log(`✓ Assigned ${ta.sponsorName} as ${ta.tier} sponsor`);
  }

  // 4. Create class sponsorships with trophies
  // Get the show classes
  const classes = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, SHOW_ID),
    with: { classDefinition: true },
  });

  const classMap = new Map(
    classes.map((c) => [c.classDefinition?.name ?? '', c.id])
  );

  const classSponsorships: {
    className: string;
    sponsorName: string;
    trophyName?: string;
    trophyDonor?: string;
    prizeDescription?: string;
  }[] = [
    {
      className: 'Open',
      sponsorName: 'Royal Canin',
      trophyName: 'The Royal Canin Challenge Cup',
      prizeDescription: 'Perpetual trophy + Royal Canin goody bag',
    },
    {
      className: 'Puppy',
      sponsorName: "Skinner's Pet Foods",
      trophyName: "The Skinner's Puppy Cup",
      prizeDescription: "Skinner's starter pack for puppies",
    },
    {
      className: 'Veteran',
      sponsorName: 'The Dorado Kennel',
      trophyName: 'The Dorado Memorial Trophy',
      trophyDonor: 'Helen & Robert Stewart',
      prizeDescription: 'Perpetual trophy in memory of Ch. Dorado vom Donaublick',
    },
    {
      className: 'Junior',
      sponsorName: 'Vet-Concept',
      trophyName: 'The Vet-Concept Junior Trophy',
      prizeDescription: 'Health supplement starter kit',
    },
    {
      className: 'Post Graduate',
      sponsorName: 'Petplan',
      trophyName: 'The Petplan Progress Award',
      prizeDescription: '3 months free pet insurance',
    },
    {
      className: 'Special Long Coat Open',
      sponsorName: 'Groomers Choice Scotland',
      trophyName: 'The Groomers Choice Long Coat Trophy',
      prizeDescription: 'Professional grooming kit',
    },
  ];

  for (const cs of classSponsorships) {
    const classId = classMap.get(cs.className);
    const showSponsorId = showSponsorMap[cs.sponsorName];
    if (!classId || !showSponsorId) {
      console.log(`⚠ Skipped class sponsorship: ${cs.className} → ${cs.sponsorName} (not found)`);
      continue;
    }

    await db.insert(schema.classSponsorships).values({
      showClassId: classId,
      showSponsorId: showSponsorId,
      trophyName: cs.trophyName ?? null,
      trophyDonor: cs.trophyDonor ?? null,
      prizeDescription: cs.prizeDescription ?? null,
    });

    console.log(`✓ Class sponsorship: ${cs.className} → ${cs.sponsorName} (${cs.trophyName ?? 'no trophy'})`);
  }

  console.log('\n═══ Done! ═══');
  console.log(`\nView the show at: https://remishowmanager.co.uk/shows/${SHOW_ID}`);
  console.log(`OG image preview: https://remishowmanager.co.uk/shows/${SHOW_ID}/opengraph-image`);
  console.log(`Secretary sponsors: https://remishowmanager.co.uk/secretary/shows/${SHOW_ID}/sponsors`);
}

main().catch(console.error);
