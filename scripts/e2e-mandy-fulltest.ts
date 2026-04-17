/**
 * End-to-end seeder + catalogue render for Amanda's test cycle.
 *
 * Creates (or regenerates) a fresh test show under Hundark German Shepherd
 * Dog Club with every schedule section populated, then seeds the requested
 * number of dog entries and renders both catalogue formats + the schedule
 * PDF. Reports a summary of page counts / errors / any warnings.
 *
 * Usage:
 *   npx tsx scripts/e2e-mandy-fulltest.ts           # 95 entries
 *   npx tsx scripts/e2e-mandy-fulltest.ts --entries=190
 */
import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, and, sql, asc } from 'drizzle-orm';
import * as s from '@/server/db/schema/index.js';
import { generateShowSlug } from '@/lib/slugify.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { generateCataloguePdf } from '@/server/services/pdf-generation.js';
import { padPdfToMultiple } from '@/lib/pdf-pad.js';

// Known IDs from the production DB (researched up front so the seeder
// doesn't have to guess).
const HUNDARK_ORG_ID = '7a3d666c-a5f9-498a-8936-d05daa42a4bc';
const GSD_BREED_ID = '858b16ec-0b76-44e8-89a4-c332dd43c1dd';
const MANDY_USER_ID = '75e32446-9b97-4e70-9ed5-a6d8987af7af';

const SHOW_NAME = 'Hundark GSD E2E Test Show';

const uuid = () => crypto.randomUUID();
const pence = (p: number) => p * 100;
const dateStr = (daysAhead: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
};
const futureDate = (daysAhead: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d;
};

// react-pdf's image validator looks for a file extension in the URL; without
// one it warns "Not valid image extension" and omits the image. placehold.co
// accepts `.png` (or `.jpg`) in the path and returns the matching format.
const PLACEHOLDER = (w: number, h: number, bg: string, fg: string, text: string) =>
  `https://placehold.co/${w}x${h}/${bg}/${fg}.png?text=${encodeURIComponent(text)}&font=serif`;

function parseArgs() {
  const entryArg = process.argv.find((a) => a.startsWith('--entries='));
  const entries = entryArg ? Number(entryArg.split('=')[1]) : 95;
  return { entries };
}

async function cleanExisting(showName: string) {
  if (!db) throw new Error('no db');
  const existing = await db.select({ id: s.shows.id }).from(s.shows).where(eq(s.shows.name, showName));
  if (existing.length === 0) return;
  console.log(`  cleaning ${existing.length} existing test show(s)…`);
  for (const { id } of existing) {
    // FK-safe delete order
    await db.delete(s.entryClasses).where(sql`${s.entryClasses.entryId} IN (SELECT id FROM entries WHERE show_id = ${id})`);
    await db.delete(s.payments).where(sql`${s.payments.orderId} IN (SELECT id FROM orders WHERE show_id = ${id})`);
    await db.delete(s.entries).where(eq(s.entries.showId, id));
    await db.delete(s.orders).where(eq(s.orders.showId, id));
    await db.delete(s.classSponsorships).where(sql`${s.classSponsorships.showClassId} IN (SELECT id FROM show_classes WHERE show_id = ${id})`);
    await db.delete(s.showClasses).where(eq(s.showClasses.showId, id));
    await db.delete(s.judgeAssignments).where(eq(s.judgeAssignments.showId, id));
    await db.delete(s.rings).where(eq(s.rings.showId, id));
    await db.delete(s.sundryItems).where(eq(s.sundryItems.showId, id));
    const showSponsors = await db.select({ id: s.showSponsors.id, sponsorId: s.showSponsors.sponsorId })
      .from(s.showSponsors).where(eq(s.showSponsors.showId, id));
    for (const ss of showSponsors) {
      await db.delete(s.showSponsors).where(eq(s.showSponsors.id, ss.id));
      // Leave org-owned sponsor rows alone (they may be reused by real shows).
    }
    await db.delete(s.shows).where(eq(s.shows.id, id));
  }
}

const FIRST_NAMES = [
  'Angus', 'Morag', 'Fiona', 'Donald', 'Eilidh', 'Hamish', 'Catriona', 'Isla',
  'Euan', 'Rhona', 'Iain', 'Seonaid', 'Calum', 'Kirsty', 'Fergus', 'Mairi',
  'Alistair', 'Shona', 'Lachlan', 'Flora', 'Gavin', 'Heather', 'Ross', 'Iona',
  'Douglas', 'Ailsa', 'Malcolm', 'Jean', 'Duncan', 'Beth', 'Robert', 'Linda',
  'Ken', 'Susan', 'Peter', 'Jane', 'Michael', 'Sarah', 'David', 'Emma',
];
const SURNAMES = [
  'MacDonald', 'Campbell', 'Stewart', 'MacLeod', 'Fraser', 'Grant', 'Ross',
  'MacKay', 'Robertson', 'Phillips', 'Dorado', 'Anderson', 'Scott', 'Murray',
  'Reid', 'Clark', 'Walker', 'Young', 'King', 'Wright', 'Hall', 'Green',
  'Baker', 'Carter', 'Mitchell', 'Bell', 'Wood', 'Hughes', 'Morris',
];
const KENNELS = [
  'Hundark', 'Fairycross', 'Donacastle', 'Doradoville', 'Sadira', 'Highland',
  'Loch Ness', 'Cairngorm', 'Skye', 'Glencoe', 'Braemar', 'Tayside', 'Inverclyde',
  'Donaheim', 'Kingsvale', 'Silverthorn', 'Donawynd', 'Braeside', 'Donafield',
  'Ellroost', 'Carseview', 'Strathmore', 'Sadiratton', 'Jasueter',
];
const REG_SUFFIXES = ['Dark Knight', 'Silver Shadow', 'Golden Spirit', 'Bold Venture', 'Dream Catcher', 'Moonshine', 'Highland Fling', 'Sun Chaser', 'Star of Scotland', 'Dark Angel', 'Royal Jewel', 'Pure Gold', 'Blue Diamond', 'Silver Mist', 'Tempest', 'Phantom', 'Destiny', 'Duchess', 'Duke', 'Dynasty', 'Dominion', 'Heritage', 'Legacy', 'Saga', 'Journey', 'Odyssey'];
const COLOURS = ['Black & Gold', 'Black & Tan', 'Sable', 'Bi-colour', 'Black', 'Blue', 'Grey', 'Long Coat Black & Gold', 'Long Coat Sable'];
const TOWNS = ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee', 'Inverness', 'Perth', 'Stirling', 'Motherwell', 'Hamilton', 'Paisley', 'Kilmarnock', 'Ayr', 'Falkirk', 'Dumfries'];

function pickN<T>(arr: T[], n: number, seed: number): T[] {
  const copy = [...arr];
  // Deterministic shuffle by stepping through with a seeded offset
  const out: T[] = [];
  let idx = seed;
  for (let i = 0; i < n && copy.length > 0; i++) {
    idx = (idx * 1103515245 + 12345) & 0x7fffffff;
    const pos = idx % copy.length;
    out.push(copy.splice(pos, 1)[0]);
  }
  return out;
}

async function seedShow(targetEntries: number) {
  if (!db) throw new Error('no db');

  console.log(`\n── Seeding ${SHOW_NAME} (${targetEntries} entries) ──`);
  await cleanExisting(SHOW_NAME);

  const allClassDefs = await db.query.classDefinitions.findMany();
  const classDefByName = new Map(allClassDefs.map((cd) => [cd.name, cd]));
  const getDef = (name: string) => {
    const d = classDefByName.get(name);
    if (!d) throw new Error(`class definition missing: ${name}`);
    return d;
  };

  // ── SHOW ROW ──────────────────────────────────────
  const showId = uuid();
  const startDate = dateStr(45);
  const slug = generateShowSlug(SHOW_NAME, startDate);

  await db.insert(s.shows).values({
    id: showId,
    name: SHOW_NAME,
    slug,
    showType: 'championship',
    showScope: 'single_breed',
    organisationId: HUNDARK_ORG_ID,
    startDate,
    endDate: startDate,
    startTime: '10:00',
    status: 'entries_open',
    entriesOpenDate: new Date(),
    entryCloseDate: futureDate(30),
    postalCloseDate: futureDate(21),
    kcLicenceNo: '2026/E2E-TEST',
    description:
      'End-to-end test show — Hundark German Shepherd Dog Club. This show exists for format verification; every schedule section has been populated to exercise the full catalogue pipeline.',
    secretaryName: 'Mandy McAteer',
    secretaryEmail: 'mandy@hundarkgsd.co.uk',
    secretaryPhone: '07921861089',
    secretaryAddress: 'Fortissat House, Newmill & Canthill Road, Shotts, ML7 4NS',
    secretaryUserId: MANDY_USER_ID,
    showOpenTime: '08:30',
    onCallVet: 'Clyde Vet Group, Accord Road, Lanark, ML11 9DB — 01555 666 777',
    acceptsPostalEntries: true,
    firstEntryFee: pence(15),
    subsequentEntryFee: pence(10),
    nfcEntryFee: pence(5),
    classSexArrangement: 'separate_sex',
    totalClasses: 24,
    scheduleData: {
      country: 'scotland',
      publicAdmission: true,
      wetWeatherAccommodation: true,
      isBenched: false,
      acceptsNfc: true,
      latestArrivalTime: '09:15',
      showManager: 'Ronnie Curran',
      dockingStatement: 'Only undocked dogs and legally docked dogs may be entered for exhibition at this show.',
      officers: [
        { name: 'Mandy McAteer', position: 'Show Secretary' },
        { name: 'Ronnie Curran', position: 'Show Manager' },
        { name: 'Ann Swift', position: 'Chairperson' },
        { name: 'Fiona Campbell', position: 'Treasurer' },
        { name: 'Angus MacDonald', position: 'Ring Steward' },
      ],
      guarantors: [
        { name: 'Mandy McAteer', address: 'Shotts, ML7 4NS' },
        { name: 'Ronnie Curran', address: 'Motherwell' },
        { name: 'Ann Swift', address: 'Lanark' },
        { name: 'Fiona Campbell', address: 'Inverness' },
      ],
      welcomeNote:
        'Welcome to the Hundark GSD E2E Test Show. This catalogue documents the full flight of data — officers, guarantors, regulations, sponsors, judges and class sponsorships — so we can verify the publishing pipeline end to end before the live shows go to print.',
      awardsDescription:
        'Trophies to 1st, rosettes 1st–5th, prize cards 1st–4th. Special awards for Best of Breed, Reserve Best of Breed, Best Puppy in Breed, Best Veteran in Breed, Best Long Coat in Breed.',
      catering: 'Hot and cold food from the on-site catering van. Tea, coffee, home baking from the club stand.',
      directions: 'From A9: Follow signs to Motherwell, then Strathclyde Country Park. Sat-nav postcode ML1 3ED. Free parking on site.',
      futureShowDates: 'Next championship show: Sunday 2nd August 2026.',
      additionalNotes: 'Gazebos and tents at the ringside by permission of the club, must be 2 metres clear of the ring.',
      prizeMoney: 'No prize money — trophies, rosettes, and special awards.',
      customStatements: [
        'Entry fees cannot be refunded once an entry has been accepted.',
        'No photography, filming or recording without express written permission of the organisers.',
        'All judges at this show agree to abide by the following statement: "In assessing dogs, judges must penalise any features or exaggerations which they consider would be detrimental to the soundness, health or well being of the dog."',
        'This is an unbenched show — exhibitors are responsible for ensuring their dogs are available for judging.',
      ],
      judgedOnGroupSystem: false,
      bestAwards: [
        'Best of Breed',
        'Reserve Best of Breed',
        'Best Dog',
        'Reserve Best Dog',
        'Best Bitch',
        'Reserve Best Bitch',
        'Best Puppy in Breed',
        'Best Veteran in Breed',
        'Best Long Coat in Breed',
      ],
      awardSponsors: [
        { award: 'Best of Breed', sponsorName: 'Royal Canin', sponsorAffix: 'Official Nutrition Partner', trophyName: 'The Hundark Challenge Cup' },
        { award: 'Reserve Best of Breed', sponsorName: 'Skinner\u2019s Field & Trial', trophyName: 'The Skinner\u2019s Salver' },
        { award: 'Best Puppy in Breed', sponsorName: 'Arden Grange', trophyName: 'The Arden Grange Puppy Trophy' },
        { award: 'Best Veteran in Breed', sponsorName: 'McTavish Grooming', trophyName: 'The McTavish Veteran Trophy' },
        { award: 'Best Long Coat in Breed', sponsorName: 'Highland Pet Supplies' },
      ],
    },
  });
  console.log(`  ✓ show row (${showId.slice(0, 8)}…)`);

  // ── RINGS ─────────────────────────────────────────
  const ringDogsId = uuid();
  const ringBitchesId = uuid();
  await db.insert(s.rings).values([
    { id: ringDogsId, showId, number: 1, startTime: '10:00' },
    { id: ringBitchesId, showId, number: 2, startTime: '10:00' },
  ]);

  // ── JUDGES ────────────────────────────────────────
  // Per Amanda: 3 judges for a single-breed show — Dogs / Bitches / JH.
  // Each gets a realistic bio + placeholder photo so the catalogue exercises
  // the bio + photo rendering paths.
  const judgeMandyId = uuid();
  const judgeMikeId = uuid();
  const judgeJhId = uuid();
  await db.insert(s.judges).values([
    {
      id: judgeMandyId,
      name: 'Mandy McAteer',
      contactEmail: 'mandy@hundarkgsd.co.uk',
      bio: 'Mandy has been involved with German Shepherd Dogs for over thirty years, exhibiting, breeding and judging at club, breed and championship level. She has awarded CCs in the breed since 2015 and has judged GSDs at shows across the UK, Ireland and mainland Europe. A committee member of Hundark GSD Club, she has also judged Junior Handling and is a KC A-List judge for the breed.',
      photoUrl: PLACEHOLDER(220, 220, '1f4a3a', 'C9A84C', 'Mandy McAteer'),
    },
    {
      id: judgeMikeId,
      name: 'Mr Michael Stewart',
      contactEmail: 'stewart.judge@test.com',
      bio: 'Michael has been breeding and exhibiting German Shepherds under the Strathmore affix for over twenty-five years. He has made up five UK Show Champions and awarded CCs in the breed since 2018. A frequent speaker at breed seminars, he is particularly known for his keen eye on movement and overall breed type.',
      photoUrl: PLACEHOLDER(220, 220, '2d5f3f', 'C9A84C', 'M Stewart'),
    },
    {
      id: judgeJhId,
      name: 'Miss Patricia Ingham',
      contactEmail: 'ingham.judge@test.com',
      bio: 'Patricia has a lifetime of handling experience and is one of the most respected Junior Handling judges in Scotland. She has judged junior handling classes at over forty RKC-licensed shows and regularly mentors young handlers through the Hundark Junior Handlers programme.',
      photoUrl: PLACEHOLDER(220, 220, '6b5b95', 'ffffff', 'P Ingham'),
    },
  ]);

  // Single-breed championship assignments: Dogs judge, Bitches judge,
  // Junior Handling judge. No per-breed "overall" assignment (that was
  // the rogue row Amanda flagged in the first pass).
  await db.insert(s.judgeAssignments).values([
    { showId, judgeId: judgeMandyId, breedId: GSD_BREED_ID, sex: 'dog', ringId: ringDogsId },
    { showId, judgeId: judgeMikeId, breedId: GSD_BREED_ID, sex: 'bitch', ringId: ringBitchesId },
    { showId, judgeId: judgeJhId, ringId: ringBitchesId }, // JH = no breed, no sex
  ]);
  console.log('  ✓ 3 judges assigned (Dogs=Mandy, Bitches=Michael Stewart, JH=Patricia Ingham) — all with bios + photos');

  // ── CLASSES ───────────────────────────────────────
  const breedClassNames = [
    'Minor Puppy', 'Puppy', 'Junior', 'Yearling',
    'Novice', 'Post Graduate', 'Limit', 'Open', 'Veteran',
  ];
  const lcClassNames = ['Special Long Coat Puppy', 'Special Long Coat Open'];
  const jhClassNames = ['Junior Handler (6-11)', 'Junior Handler (12-16)'];

  const classes: { id: string; name: string; sex: 'dog' | 'bitch' | null }[] = [];
  let classNum = 1;

  for (const sex of ['dog', 'bitch'] as const) {
    for (const name of breedClassNames) {
      const id = uuid();
      classes.push({ id, name, sex });
      await db.insert(s.showClasses).values({
        id, showId,
        breedId: GSD_BREED_ID,
        classDefinitionId: getDef(name).id,
        sex,
        entryFee: classNum === 1 ? pence(15) : pence(10),
        sortOrder: classNum,
        classNumber: classNum,
        isBreedSpecific: true,
      });
      classNum++;
    }
  }

  for (const sex of ['dog', 'bitch'] as const) {
    for (const name of lcClassNames) {
      const id = uuid();
      classes.push({ id, name, sex });
      await db.insert(s.showClasses).values({
        id, showId,
        breedId: GSD_BREED_ID,
        classDefinitionId: getDef(name).id,
        sex,
        entryFee: pence(10),
        sortOrder: classNum,
        classNumber: classNum,
        isBreedSpecific: true,
      });
      classNum++;
    }
  }

  for (const name of jhClassNames) {
    const id = uuid();
    classes.push({ id, name, sex: null });
    await db.insert(s.showClasses).values({
      id, showId,
      classDefinitionId: getDef(name).id,
      sex: null,
      entryFee: pence(5),
      sortOrder: classNum,
      classNumber: classNum,
      isBreedSpecific: false,
    });
    classNum++;
  }
  console.log(`  ✓ ${classes.length} classes`);

  // ── SHOW SPONSORS ─────────────────────────────────
  const sponsorRows = [
    { name: 'Royal Canin', category: 'pet_food' as const, tier: 'title' as const, customTitle: 'Official Nutrition Partner', logoUrl: PLACEHOLDER(240, 80, 'cc0000', 'ffffff', 'ROYAL CANIN') },
    { name: 'Arden Grange', category: 'pet_food' as const, tier: 'show' as const, customTitle: 'Official Show Sponsor', logoUrl: PLACEHOLDER(200, 70, '2d5f3f', 'ffffff', 'ARDEN GRANGE') },
    { name: 'Skinner\u2019s Field & Trial', category: 'pet_food' as const, tier: 'class' as const, customTitle: null, logoUrl: PLACEHOLDER(200, 70, '8b4513', 'ffffff', 'SKINNERS') },
    { name: 'Highland Pet Supplies', category: 'local_business' as const, tier: 'class' as const, customTitle: null, logoUrl: PLACEHOLDER(200, 70, '4a6741', 'ffffff', 'HIGHLAND') },
    { name: 'McTavish Grooming', category: 'grooming' as const, tier: 'class' as const, customTitle: null, logoUrl: PLACEHOLDER(200, 70, '6b5b95', 'ffffff', 'McTAVISH') },
    { name: 'The Dorado Kennel', category: 'breed_club' as const, tier: 'prize' as const, customTitle: 'Trophy Donor', logoUrl: null },
  ];
  const showSponsorIds: string[] = [];
  for (let i = 0; i < sponsorRows.length; i++) {
    const sp = sponsorRows[i];
    const sponsorId = uuid();
    const showSponsorId = uuid();
    showSponsorIds.push(showSponsorId);
    await db.insert(s.sponsors).values({
      id: sponsorId,
      organisationId: HUNDARK_ORG_ID,
      name: sp.name,
      category: sp.category,
      logoUrl: sp.logoUrl,
    });
    await db.insert(s.showSponsors).values({
      id: showSponsorId,
      showId,
      sponsorId,
      tier: sp.tier,
      displayOrder: i,
      customTitle: sp.customTitle,
    });
  }
  console.log(`  ✓ ${sponsorRows.length} show sponsors`);

  // ── CLASS SPONSORSHIPS ────────────────────────────
  // Amanda's spec: EVERY class gets two sponsorship rows — one for the
  // class trophy, one for the rosettes. Rotate through the trophy-donor
  // pool so sponsors get distributed evenly rather than one sponsor
  // claiming everything.
  const trophyDonorPool = [
    { sponsor: 'Skinner\u2019s Field & Trial', donor: 'Skinner\u2019s' },
    { sponsor: 'The Dorado Kennel', donor: 'Mr & Mrs J. Dorado' },
    { sponsor: 'Arden Grange', donor: null },
    { sponsor: 'Highland Pet Supplies', donor: null },
    { sponsor: 'McTavish Grooming', donor: null },
    { sponsor: 'The Hundark Kennel', donor: 'Mandy McAteer' },
    { sponsor: 'Strathmore GSD Club', donor: null },
    { sponsor: 'Lochdale Veterinary Group', donor: null },
  ];
  const rosetteDonorPool = [
    'Royal Canin',
    'Arden Grange',
    'Highland Pet Supplies',
    'Skinner\u2019s Field & Trial',
    'McTavish Grooming',
    'Strathmore Embroidery',
  ];

  let sponsorshipCount = 0;
  for (let ci = 0; ci < classes.length; ci++) {
    const cls = classes[ci];
    const trophy = trophyDonorPool[ci % trophyDonorPool.length];
    const rosette = rosetteDonorPool[ci % rosetteDonorPool.length];
    const sexLabel = cls.sex === 'dog' ? 'Dog' : cls.sex === 'bitch' ? 'Bitch' : '';
    const trophyBase = `${cls.name}${sexLabel ? ' ' + sexLabel : ''} Trophy`;

    await db.insert(s.classSponsorships).values({
      showClassId: cls.id,
      trophyName: `The ${trophy.sponsor.replace(/\u2019s.*/, '\u2019s')} ${trophyBase}`,
      trophyDonor: trophy.donor,
      sponsorName: trophy.sponsor,
    });
    sponsorshipCount++;

    await db.insert(s.classSponsorships).values({
      showClassId: cls.id,
      prizeDescription: 'Rosettes 1st \u2013 5th',
      sponsorName: rosette,
    });
    sponsorshipCount++;
  }
  console.log(`  ✓ ${sponsorshipCount} class sponsorships (trophy + rosette for all ${classes.length} classes)`);

  // ── EXHIBITORS + DOGS + ENTRIES ───────────────────
  // Each exhibitor contributes ~2 dogs on average, each dog enters
  // ~2 classes → roughly `targetEntries` entries total (we round up).
  const dogsPerExhibitor = 2;
  const exhibitorCount = Math.ceil(targetEntries / dogsPerExhibitor);

  let entryCount = 0;
  let catalogueNumber = 1;
  for (let i = 0; i < exhibitorCount && entryCount < targetEntries; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = SURNAMES[(i + 3) % SURNAMES.length];
    const name = `${first} ${last}`;
    const email = `e2e.${first.toLowerCase()}.${last.toLowerCase()}.${i}@test.hundark.local`;
    // Reuse test users across reruns — deleting them would cascade into
    // unrelated show data. If the email already exists we just pick up
    // the existing id.
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
        postcode: `ML${(i % 12) + 1} ${(i % 9) + 1}${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i + 5) % 26))}`,
        role: 'exhibitor',
        onboardingCompletedAt: new Date(),
      });
    }

    for (let d = 0; d < dogsPerExhibitor && entryCount < targetEntries; d++) {
      const dogSex = ((i + d) % 2 === 0 ? 'dog' : 'bitch') as 'dog' | 'bitch';
      const kennel = KENNELS[(i * 3 + d) % KENNELS.length];
      const suffix = REG_SUFFIXES[(i * 7 + d * 3) % REG_SUFFIXES.length];
      const registeredName = `${kennel} ${suffix} ${(i % 9) + 1}${d}`.trim();
      // Age bias so we cover puppy/junior/open/veteran buckets.
      const ageBucket = (i + d) % 6;
      const dob = ageBucket === 0 ? dateStr(-200) // < 12m (puppy)
        : ageBucket === 1 ? dateStr(-400) // junior
        : ageBucket === 2 ? dateStr(-900) // yearling / adult
        : ageBucket === 3 ? dateStr(-1500) // post grad / limit
        : ageBucket === 4 ? dateStr(-2500) // open
        : dateStr(-3000); // veteran (> 7 years)

      const dogId = uuid();
      await db.insert(s.dogs).values({
        id: dogId,
        registeredName,
        breedId: GSD_BREED_ID,
        sex: dogSex,
        dateOfBirth: dob,
        sireName: `${kennel} Sire`,
        damName: `${kennel} Dam`,
        breederName: `${last} ${kennel}`,
        colour: COLOURS[(i * 2 + d) % COLOURS.length],
        // kcRegNumber is unique across the dogs table — namespace it
        // with a short run suffix so reruns don't collide.
        kcRegNumber: `E2E${Date.now().toString(36)}${String(i * 10 + d).padStart(4, '0')}`,
        ownerId: userId,
      });
      await db.insert(s.dogOwners).values({
        dogId,
        userId,
        ownerName: name,
        ownerAddress: `${i} ${last} Street, ${TOWNS[i % TOWNS.length]}`,
        ownerEmail: email,
        sortOrder: 0,
      });

      // Pick 2 classes for this dog: sex-specific, excluding JH
      const eligibleClasses = classes.filter(
        (c) => c.sex === dogSex && !c.name.startsWith('Junior Handler'),
      );
      const selected = pickN(eligibleClasses, 2, i * 31 + d * 7);
      if (selected.length === 0) continue;

      const totalFee = pence(15) + (selected.length - 1) * pence(10);
      const orderId = uuid();
      const entryId = uuid();
      await db.insert(s.orders).values({
        id: orderId,
        showId,
        exhibitorId: userId,
        status: 'paid',
        totalAmount: totalFee,
      });
      await db.insert(s.entries).values({
        id: entryId,
        showId,
        dogId,
        exhibitorId: userId,
        orderId,
        status: 'confirmed',
        totalFee,
        entryDate: new Date(),
        catalogueNumber: String(catalogueNumber),
      });
      catalogueNumber++;
      for (let ci = 0; ci < selected.length; ci++) {
        await db.insert(s.entryClasses).values({
          entryId,
          showClassId: selected[ci].id,
          fee: ci === 0 ? pence(15) : pence(10),
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
  console.log(`  ✓ ${entryCount} entries seeded (${exhibitorCount} exhibitors)`);

  return showId;
}

async function renderCatalogues(showId: string, entryCount: number) {
  const outDir = `/tmp/cat-e2e-${entryCount}`;
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  console.log(`\n── Rendering catalogues → ${outDir} ──`);
  for (const fmt of ['standard', 'by-class'] as const) {
    try {
      const t0 = Date.now();
      // Same pipeline the live download uses: generate → pad to the next
      // multiple of 4 (booklet binding) so the back cover + Notes pages
      // actually appear.
      const raw = await generateCataloguePdf(showId, fmt);
      const padded = Buffer.from(await padPdfToMultiple(raw, 4));
      const pdfPath = `${outDir}/${fmt}.pdf`;
      writeFileSync(pdfPath, padded);
      const info = execFileSync('pdfinfo', [pdfPath]).toString();
      const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
      const rawPages = Math.ceil(raw.length);
      const addedPages = pages - Number(execFileSync('pdfinfo', ['-'], { input: raw }).toString().match(/Pages:\s+(\d+)/)?.[1] ?? pages);
      console.log(`  ${fmt.padEnd(10)} → ${String(pages).padStart(3)} pp  ${Math.round(padded.length / 1024)} KB  ${Date.now() - t0}ms  (+${addedPages} padding)`);
      execFileSync('pdftoppm', [pdfPath, `${outDir}/${fmt}`, '-png', '-r', '100', '-f', String(Math.max(1, pages - 3)), '-l', String(pages)]);
    } catch (err) {
      console.error(`  ${fmt} FAILED:`, (err as Error).message);
    }
  }
}

async function main() {
  const { entries } = parseArgs();
  const showId = await seedShow(entries);
  await renderCatalogues(showId, entries);
  console.log('\nDone.');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
