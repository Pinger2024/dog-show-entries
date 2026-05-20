/**
 * Test Data Generator — creates realistic mock data for a dog show.
 *
 * Adapts to show type (championship/open/limited) and scope (general/group/single_breed).
 * Used by admin "Populate Test Data" action in impersonation mode.
 */

import { db } from '@/server/db';
import { eq, asc, sql, and, isNull, inArray } from 'drizzle-orm';
import * as schema from '@/server/db/schema';

// ── Realistic UK kennel prefixes and suffixes ──

const KENNEL_PREFIXES = [
  'Donaghmore', 'Donaghue', 'Donaghcloney', 'Donahue', 'Donamoor',
  'Donavon', 'Donaworth', 'Donawest', 'Donavale', 'Donaridge',
  'Donabrook', 'Donafern', 'Donacrest', 'Donafield', 'Donastone',
  'Donapark', 'Donahill', 'Donaheath', 'Donaburn', 'Donaglen',
  'Donadale', 'Donalea', 'Donamead', 'Donaloch', 'Donavista',
  'Donagrove', 'Donashiel', 'Donathorne', 'Donavane', 'Donapool',
  'Donavilla', 'Donamont', 'Donariven', 'Donafort', 'Donashire',
  'Donawynd', 'Donawick', 'Donabluff', 'Donaspire', 'Donaregal',
  'Donaward', 'Donahollow', 'Donabrae', 'Donagait', 'Donawhin',
  'Donaknowe', 'Donafirth', 'Donacairn', 'Donavault', 'Donacliff',
  'Donaroyal', 'Donalight', 'Donastar', 'Donasilver', 'Donagold',
  'Donacrown', 'Donacastle', 'Donabridge', 'Donarose', 'Donalily',
  'Springvale', 'Springbrook', 'Springhill', 'Springmead', 'Springfield',
  'Glenloch', 'Glenvale', 'Glenburn', 'Glenmore', 'Glendale',
  'Braeside', 'Braemar', 'Braehead', 'Braemore', 'Braecroft',
  'Caledonian', 'Caledonia', 'Caledony', 'Caledor', 'Caledon',
  'Heatherbank', 'Heatherglen', 'Heatherdale', 'Heathermoor', 'Heatherhill',
  'Burnside', 'Burnbrae', 'Burnfoot', 'Burnhill', 'Burnvale',
  'Strathmore', 'Strathdon', 'Strathaven', 'Strathleven', 'Strathvale',
  'Lochside', 'Lochmore', 'Lochburn', 'Lochvale', 'Lochgreen',
  'Inverclyde', 'Inverdon', 'Invermore', 'Invervale', 'Inverburn',
  'Fairhaven', 'Fairfield', 'Fairburn', 'Fairmead', 'Fairholm',
  'Roseburn', 'Rosevale', 'Rosehill', 'Rosemead', 'Rosecroft',
  'Silverthorn', 'Silverdale', 'Silvervale', 'Silverburn', 'Silverbrook',
  'Goldcrest', 'Goldfield', 'Goldvale', 'Goldburn', 'Goldenhill',
  'Ashbrook', 'Ashvale', 'Ashburn', 'Ashmead', 'Ashfield',
  'Oakwood', 'Oakvale', 'Oakburn', 'Oakmead', 'Oakfield',
  'Willowbank', 'Willowdale', 'Willowburn', 'Willowmead', 'Willowfield',
  'Hawthorn', 'Hawthorne', 'Hawkvale', 'Hawkburn', 'Hawkmead',
  'Thornfield', 'Thornvale', 'Thornburn', 'Thornmead', 'Thorncroft',
  'Belvedere', 'Belvale', 'Belburn', 'Belmead', 'Belfast',
  'Kingsway', 'Kingsvale', 'Kingsburn', 'Kingsmead', 'Kingsfield',
  'Queensway', 'Queensvale', 'Queensburn', 'Queensmead', 'Queensfield',
];

const NAME_WORDS = [
  'Dark Knight', 'Midnight Express', 'Golden Dawn', 'Silver Shadow', 'Royal Command',
  'Highland Fling', 'Northern Star', 'Celtic Pride', 'Scottish Dream', 'Border Legend',
  'Dark Destiny', 'Midnight Magic', 'Golden Spirit', 'Silver Star', 'Royal Promise',
  'Highland Spirit', 'Northern Light', 'Celtic Fire', 'Scottish Rose', 'Border Storm',
  'Dark Romance', 'Midnight Sun', 'Golden Glory', 'Silver Moon', 'Royal Jewel',
  'Highland Dream', 'Northern Wind', 'Celtic Charm', 'Scottish Heather', 'Border Beauty',
  'Dark Thunder', 'Midnight Flame', 'Golden Hope', 'Silver Mist', 'Royal Heritage',
  'Highland Gold', 'Northern Echo', 'Celtic Storm', 'Scottish Thistle', 'Border Prince',
  'Dark Enchantment', 'Midnight Star', 'Golden Era', 'Silver Phantom', 'Royal Legacy',
  'Highland Laird', 'Northern Crown', 'Celtic Dragon', 'Scottish Warrior', 'Border Queen',
  'Stardust', 'Moonshine', 'Sunburst', 'Daybreak', 'Nightfall',
  'Tempest', 'Thunder', 'Lightning', 'Cyclone', 'Tornado',
  'Destiny', 'Fortune', 'Legacy', 'Heritage', 'Dynasty',
  'Triumph', 'Victory', 'Valiant', 'Courage', 'Glory',
  'Diamond', 'Sapphire', 'Emerald', 'Ruby', 'Pearl',
  'Phoenix', 'Dragon', 'Eagle', 'Falcon', 'Hawk',
  'First Edition', 'Top Priority', 'Rising Star', 'New Dawn', 'True North',
  'Bold Venture', 'Grand Design', 'Master Plan', 'High Command', 'Full Circle',
  'Wind Dancer', 'Fire Spirit', 'Ice Queen', 'Earth Song', 'Water Lily',
  'Dream Weaver', 'Star Gazer', 'Moon Walker', 'Sun Chaser', 'Storm Rider',
  'Red Baron', 'Blue Moon', 'Black Diamond', 'White Gold', 'Green Velvet',
  'True Grit', 'Pure Gold', 'Wild Card', 'Dark Horse', 'Bright Spark',
];

const SIRE_SUFFIXES = [
  'of Donaghmore', 'of Springvale', 'of Glenloch', 'of Braeside',
  'of Heatherbank', 'of Burnside', 'of Strathmore', 'of Lochside',
  'at Inverclyde', 'at Fairhaven', 'at Roseburn', 'at Silverthorn',
];

const UK_FIRST_NAMES = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Thomas', 'Charles', 'Christopher',
  'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth',
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen',
  'Margaret', 'Nancy', 'Lisa', 'Betty', 'Dorothy', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna',
  'Helen', 'Fiona', 'Morag', 'Eileen', 'Sheila', 'Jean', 'Elaine', 'Alison', 'Catriona', 'Isla',
  'Ian', 'Angus', 'Donald', 'Hamish', 'Alistair', 'Campbell', 'Gordon', 'Douglas', 'Duncan', 'Fraser',
];

const UK_SURNAMES = [
  'Smith', 'Jones', 'Williams', 'Brown', 'Taylor', 'Wilson', 'Davies', 'Evans', 'Thomas', 'Johnson',
  'Roberts', 'Walker', 'Wright', 'Thompson', 'White', 'Robinson', 'Hall', 'Green', 'Lewis', 'Clarke',
  'Campbell', 'Stewart', 'Anderson', 'MacLeod', 'MacDonald', 'Ross', 'Fraser', 'Grant', 'Murray', 'Cameron',
  'Henderson', 'Robertson', 'Hamilton', 'Watson', 'Reid', 'Mitchell', 'Mackenzie', 'Kerr', 'Morrison', 'Scott',
  'McAteer', 'McBride', 'McCallum', 'McConnell', 'McGregor', 'McIntyre', 'McLean', 'McMillan', 'McNeil', 'McPherson',
];

const SCOTTISH_STREETS = [
  'High Street', 'Main Street', 'Station Road', 'Park Road', 'Church Street',
  'Victoria Road', 'Albert Road', 'Queen Street', 'King Street', 'Bridge Street',
  'George Street', 'Castle Street', 'Argyll Street', 'Union Street', 'Hope Street',
  'Buchanan Street', 'Sauchiehall Street', 'Bath Street', 'West Nile Street', 'Bothwell Street',
  'Millerfield Place', 'Renfrew Street', 'West Regent Street', 'Blythswood Square', 'St Vincent Street',
  'Auchinleck Road', 'Ballater Drive', 'Cairnhill Road', 'Drumchapel Road', 'Easterhouse Road',
  'Fenwick Road', 'Greenhill Avenue', 'Hillpark Drive', 'Kirkintilloch Road', 'Langside Avenue',
  'Maryhill Road', 'Newton Mearns Road', 'Pollokshaws Road', 'Rutherglen Main Street', 'Shawlands Cross',
];

const SCOTTISH_TOWNS = [
  'Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee', 'Inverness',
  'Perth', 'Stirling', 'Dunfermline', 'Falkirk', 'Paisley',
  'East Kilbride', 'Livingston', 'Hamilton', 'Cumbernauld', 'Kilmarnock',
  'Ayr', 'Greenock', 'Dumfries', 'Kirkcaldy', 'Motherwell',
  'Coatbridge', 'Rutherglen', 'Bearsden', 'Bishopbriggs', 'Cambuslang',
  'Lanark', 'Strathaven', 'Biggar', 'Lesmahagow', 'Carluke',
  'Wishaw', 'Airdrie', 'Bellshill', 'Bothwell', 'Blantyre',
];

const SCOTTISH_POSTCODES_PREFIX = [
  'G1', 'G2', 'G3', 'G4', 'G5', 'G11', 'G12', 'G13', 'G14', 'G15',
  'G20', 'G21', 'G22', 'G23', 'G31', 'G32', 'G33', 'G34', 'G40', 'G41',
  'G42', 'G43', 'G44', 'G45', 'G46', 'G51', 'G52', 'G53', 'G60', 'G61',
  'G62', 'G63', 'G64', 'G65', 'G66', 'G67', 'G68', 'G69', 'G71', 'G72',
  'G73', 'G74', 'G75', 'G76', 'G77', 'G78', 'ML1', 'ML2', 'ML3', 'ML4',
  'ML5', 'ML6', 'ML7', 'ML8', 'ML9', 'ML10', 'ML11', 'ML12',
  'EH1', 'EH2', 'EH3', 'EH4', 'EH5', 'EH6', 'EH7', 'EH8',
  'KA1', 'KA2', 'KA3', 'KA4', 'KA5', 'KA6', 'KA7', 'KA8',
  'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PA8',
];

const BREEDER_NAMES = [
  'Mr & Mrs J. Smith', 'Mrs K. Campbell', 'Mr D. Anderson', 'Miss S. Fraser',
  'Mr & Mrs R. Wilson', 'Mrs M. MacDonald', 'Mr G. Stewart', 'Miss L. Murray',
  'Mr & Mrs A. Ross', 'Mrs H. Cameron', 'Mr I. Henderson', 'Miss F. Robertson',
  'Mr & Mrs P. Hamilton', 'Mrs E. Watson', 'Mr T. Reid', 'Miss C. Mitchell',
  'Mr & Mrs W. Mackenzie', 'Mrs B. Morrison', 'Mr N. Scott', 'Miss D. Clark',
  'Donaghmore Kennels', 'Springvale Kennels', 'Glenloch Kennels', 'Braeside Kennels',
  'Heatherbank Kennels', 'Burnside Kennels', 'Strathmore Kennels', 'Lochside Kennels',
  'Inverclyde Kennels', 'Fairhaven Kennels', 'Roseburn Kennels', 'Silverthorn Kennels',
];

// ── Breed colour maps ──

const BREED_COLOURS: Record<string, string[]> = {
  'Labrador Retriever': ['Yellow', 'Black', 'Chocolate', 'Fox Red'],
  'Golden Retriever': ['Golden', 'Cream', 'Light Golden', 'Dark Golden'],
  'Cocker Spaniel': ['Golden', 'Black', 'Liver', 'Blue Roan', 'Orange Roan', 'Liver Roan', 'Black & Tan', 'Red'],
  'English Springer Spaniel': ['Liver & White', 'Black & White', 'Liver White & Tan', 'Black White & Tan'],
  'German Shorthaired Pointer': ['Liver', 'Liver & White', 'Liver & White Ticked', 'Solid Liver'],
  'Irish Setter': ['Rich Chestnut', 'Mahogany'],
  'Gordon Setter': ['Black & Tan'],
  'Vizsla': ['Russet Gold', 'Dark Sandy Gold', 'Golden Rust'],
  'Beagle': ['Tricolour', 'Lemon & White', 'Red & White', 'Tan & White'],
  'Whippet': ['Black', 'Blue', 'Fawn', 'Brindle', 'White', 'Red', 'Black & White', 'Blue & White'],
  'Dachshund (Miniature Smooth Haired)': ['Red', 'Black & Tan', 'Chocolate & Tan', 'Dapple'],
  'Afghan Hound': ['Gold', 'Cream', 'Red', 'Black', 'Blue', 'Domino', 'Black & Tan'],
  'Basset Hound': ['Tricolour', 'Lemon & White', 'Red & White'],
  'Border Collie': ['Black & White', 'Red & White', 'Blue Merle', 'Tricolour', 'Chocolate & White'],
  'German Shepherd Dog': ['Black & Tan', 'Black & Gold', 'Black & Red', 'Sable', 'Bi-Colour', 'All Black'],
  'Old English Sheepdog': ['Grey & White', 'Blue & White', 'Grizzle & White'],
  'Shetland Sheepdog': ['Sable', 'Tricolour', 'Blue Merle', 'Black & White', 'Black & Tan'],
  'West Highland White Terrier': ['White'],
  'Staffordshire Bull Terrier': ['Red', 'Fawn', 'White', 'Black', 'Blue', 'Brindle', 'Red & White', 'Fawn & White'],
  'Border Terrier': ['Red', 'Grizzle & Tan', 'Blue & Tan', 'Wheaten'],
  'Airedale Terrier': ['Black & Tan', 'Grizzle & Tan'],
  'Cavalier King Charles Spaniel': ['Blenheim', 'Tricolour', 'Black & Tan', 'Ruby'],
  'Pomeranian': ['Orange', 'Cream', 'Black', 'White', 'Sable', 'Blue', 'Chocolate'],
  'Chihuahua (Smooth Coat)': ['Fawn', 'Cream', 'Black', 'Chocolate', 'White', 'Black & Tan', 'Blue'],
  'Bulldog': ['Red', 'Fawn', 'White', 'Red & White', 'Fawn & White', 'Brindle', 'Brindle & White'],
  'Dalmatian': ['White with Black Spots', 'White with Liver Spots'],
  'Standard Poodle': ['Black', 'White', 'Brown', 'Blue', 'Silver', 'Apricot', 'Red'],
  'Rottweiler': ['Black & Tan', 'Black & Mahogany'],
  'Boxer': ['Red', 'Fawn', 'Brindle', 'Red & White', 'Fawn & White', 'Brindle & White'],
  'Great Dane': ['Fawn', 'Brindle', 'Blue', 'Black', 'Harlequin', 'Mantle'],
  'Dobermann': ['Black & Tan', 'Brown & Tan', 'Blue & Tan'],
};

// ── Popular breeds by group ──

const POPULAR_BREEDS_BY_GROUP: Record<string, string[]> = {
  Gundog: [
    'Labrador Retriever', 'Golden Retriever', 'Cocker Spaniel', 'English Springer Spaniel',
    'German Shorthaired Pointer', 'Irish Setter', 'Gordon Setter', 'Vizsla',
  ],
  Hound: [
    'Beagle', 'Whippet', 'Dachshund (Miniature Smooth Haired)', 'Afghan Hound', 'Basset Hound',
  ],
  Pastoral: [
    'Border Collie', 'German Shepherd Dog', 'Old English Sheepdog', 'Shetland Sheepdog',
  ],
  Terrier: [
    'West Highland White Terrier', 'Staffordshire Bull Terrier', 'Border Terrier', 'Airedale Terrier',
  ],
  Toy: [
    'Cavalier King Charles Spaniel', 'Pomeranian', 'Chihuahua (Smooth Coat)',
  ],
  Utility: [
    'Bulldog', 'Dalmatian', 'Standard Poodle',
  ],
  Working: [
    'Rottweiler', 'Boxer', 'Great Dane', 'Dobermann',
  ],
};

// ── Judge names ──

const JUDGE_NAMES = [
  'Mrs Margaret Cowan', 'Mr James Henderson', 'Mrs Patricia Stewart', 'Mr Robert Campbell',
  'Mrs Helen Fraser', 'Mr William Anderson', 'Mrs Fiona MacDonald', 'Mr Ian Murray',
  'Mrs Jean Cameron', 'Mr Donald Ross', 'Mrs Morag MacLeod', 'Mr Angus Robertson',
  'Mrs Eileen Hamilton', 'Mr Gordon Watson', 'Mrs Sandra Reid', 'Mr Douglas Mitchell',
  'Mrs Sheila Mackenzie', 'Mr Campbell Morrison', 'Mrs Alison Scott', 'Mr Hamish Grant',
];

// ── Helpers ──

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateKcRegNumber(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const prefix = letters[randomInt(0, letters.length - 1)] + letters[randomInt(0, letters.length - 1)];
  const num = randomInt(10000, 99999).toString().padStart(5, '0');
  const suffix = randomInt(1, 99).toString().padStart(2, '0');
  return `${prefix}${num}/${suffix}`;
}

function generateDogName(kennel: string): string {
  return `${kennel} ${pick(NAME_WORDS)}`;
}

function generateAddress(): { address: string; town: string; postcode: string } {
  const num = randomInt(1, 200);
  const street = pick(SCOTTISH_STREETS);
  const town = pick(SCOTTISH_TOWNS);
  const prefix = pick(SCOTTISH_POSTCODES_PREFIX);
  const suffix = `${randomInt(1, 9)}${String.fromCharCode(65 + randomInt(0, 25))}${String.fromCharCode(65 + randomInt(0, 25))}`;
  return {
    address: `${num} ${street}`,
    town,
    postcode: `${prefix} ${suffix}`,
  };
}

function generateOwnerName(): string {
  return `${pick(UK_FIRST_NAMES)} ${pick(UK_SURNAMES)}`;
}

function generateDateOfBirth(ageCategory: 'puppy' | 'yearling' | 'junior' | 'adult' | 'veteran', showDate: Date): string {
  const d = new Date(showDate);
  let monthsOld: number;
  switch (ageCategory) {
    case 'puppy': monthsOld = randomInt(6, 11); break;
    case 'yearling': monthsOld = randomInt(12, 23); break;
    case 'junior': monthsOld = randomInt(6, 17); break;
    case 'adult': monthsOld = randomInt(24, 72); break;
    case 'veteran': monthsOld = randomInt(84, 132); break;
  }
  d.setMonth(d.getMonth() - monthsOld);
  d.setDate(randomInt(1, 28));
  return d.toISOString().split('T')[0];
}

// ── Age class eligibility ──

const CLASS_AGE_MAP: Record<string, 'puppy' | 'yearling' | 'junior' | 'adult' | 'veteran'> = {
  'Minor Puppy': 'puppy',
  'Puppy': 'puppy',
  'Junior': 'junior',
  'Yearling': 'yearling',
  'Novice': 'adult',
  'Graduate': 'adult',
  'Post Graduate': 'adult',
  'Mid Limit': 'adult',
  'Limit': 'adult',
  'Open': 'adult',
  'Veteran': 'veteran',
  'Special Beginners': 'adult',
  'Undergraduate': 'adult',
  'Maiden': 'adult',
};

// Map class definitions to which age categories of dogs can enter them
function getEligibleAgeCategories(className: string): ('puppy' | 'yearling' | 'junior' | 'adult' | 'veteran')[] {
  const lower = className.toLowerCase();
  if (lower.includes('minor puppy')) return ['puppy'];
  if (lower.includes('puppy') && !lower.includes('minor')) return ['puppy'];
  if (lower.includes('yearling')) return ['yearling'];
  if (lower.includes('junior') && !lower.includes('handler')) return ['junior', 'yearling'];
  if (lower.includes('veteran')) return ['veteran'];
  if (lower.includes('open')) return ['adult', 'yearling', 'veteran'];
  // Default adult classes (Post Grad, Limit, Graduate, Novice, etc.)
  return ['adult', 'yearling'];
}

// ── Main populate function ──

interface PopulateOptions {
  showId: string;
  /** Target number of entries (default 150 for general, 80 for single breed) */
  targetEntries?: number;
}

interface PopulateResult {
  dogsCreated: number;
  entriesCreated: number;
  entryClassesCreated: number;
  judgesCreated: number;
  ringsCreated: number;
  ordersCreated: number;
  sponsorsCreated: number;
  showConfigUpdated: boolean;
}

export async function populateShowWithTestData(opts: PopulateOptions): Promise<PopulateResult> {
  const { showId, targetEntries: targetOverride } = opts;

  // 1. Load the show and its configuration
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true },
  });

  if (!show) throw new Error(`Show ${showId} not found`);

  const showDate = new Date(show.startDate);

  // 2. Load existing show classes
  const showClasses = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, showId),
    with: { classDefinition: true, breed: true },
    orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
  });

  if (showClasses.length === 0) {
    throw new Error('Show has no classes configured. Add classes before populating test data.');
  }

  // 3. Determine which breeds to use based on show scope
  const allBreeds = await db.query.breeds.findMany({ with: { group: true } });
  const breedMap = new Map(allBreeds.map(b => [b.name, b]));
  const breedIdMap = new Map(allBreeds.map(b => [b.id, b]));

  let targetBreedNames: string[];
  let targetEntries: number;

  if (show.showScope === 'single_breed') {
    // Single breed — find which breed from the show classes
    const breedId = showClasses.find(sc => sc.breedId)?.breedId;
    const breedName = breedId ? breedIdMap.get(breedId)?.name : null;
    if (!breedName) {
      // Fallback: use German Shepherd Dog as default single breed
      targetBreedNames = ['German Shepherd Dog'];
    } else {
      targetBreedNames = [breedName];
    }
    targetEntries = targetOverride ?? 80;
  } else if (show.showScope === 'group') {
    // Group show — pick breeds from relevant group(s)
    const breedIds = showClasses.filter(sc => sc.breedId).map(sc => sc.breedId);
    const groups = new Set(breedIds.map(id => breedIdMap.get(id!)?.group?.name).filter(Boolean));
    const groupName = groups.size > 0 ? [...groups][0]! : 'Gundog';
    targetBreedNames = POPULAR_BREEDS_BY_GROUP[groupName] ?? Object.values(POPULAR_BREEDS_BY_GROUP).flat().slice(0, 10);
    targetEntries = targetOverride ?? 120;
  } else {
    // General / all-breed championship — use breeds from all groups
    targetBreedNames = Object.values(POPULAR_BREEDS_BY_GROUP).flat();
    targetEntries = targetOverride ?? 180;
  }

  // Match breed names to DB records
  const targetBreeds = targetBreedNames
    .map(name => breedMap.get(name))
    .filter((b): b is NonNullable<typeof b> => !!b);

  if (targetBreeds.length === 0) {
    throw new Error('No matching breeds found in database. Ensure breed data is populated.');
  }

  // 4. Load existing users to use as exhibitors
  const allUsers = await db.query.users.findMany();
  if (allUsers.length === 0) throw new Error('No users in database.');

  // 5. Separate classes by type: "all breed" classes (no breedId) vs breed-specific
  const allBreedClasses = showClasses.filter(sc => !sc.breedId);
  const breedSpecificClasses = showClasses.filter(sc => sc.breedId);

  // Group all-breed classes by sex
  const dogClasses = allBreedClasses.filter(sc => sc.sex === 'dog');
  const bitchClasses = allBreedClasses.filter(sc => sc.sex === 'bitch');

  // 6. Generate dogs and entries
  const result: PopulateResult = {
    dogsCreated: 0,
    entriesCreated: 0,
    entryClassesCreated: 0,
    judgesCreated: 0,
    ringsCreated: 0,
    ordersCreated: 0,
    sponsorsCreated: 0,
    showConfigUpdated: false,
  };

  // Calculate dogs per breed
  const dogsPerBreed = Math.max(3, Math.ceil(targetEntries / targetBreeds.length));

  // Track used kennel names to avoid duplicates
  const usedNames = new Set<string>();
  const usedKcNumbers = new Set<string>();

  const entryFee = show.firstEntryFee ?? 800; // default £8
  const additionalFee = show.subsequentEntryFee ?? 300; // default £3

  // ── Phase 1: Generate all data in memory ──

  interface PlannedDog {
    registeredName: string;
    kcRegNumber: string;
    breedId: string;
    sex: 'dog' | 'bitch';
    dateOfBirth: string;
    sireName: string;
    damName: string;
    breederName: string;
    colour: string;
    ownerId: string;
    exhibitorId: string;
    exhibitorEmail: string | null;
    ownerName: string;
    ownerAddress: string;
    coOwner: { name: string; address: string } | null;
    selectedClassIds: string[];
    isFirstClassFlags: boolean[];
    totalFee: number;
    catalogueRequested: boolean;
    isNfc: boolean;
  }

  const plannedDogs: PlannedDog[] = [];

  for (const breed of targetBreeds) {
    const numDogs = show.showScope === 'single_breed'
      ? randomInt(Math.max(dogsPerBreed - 3, 8), dogsPerBreed + 5)
      : randomInt(Math.max(dogsPerBreed - 2, 3), dogsPerBreed + 2);

    const breedKennels = pickN(KENNEL_PREFIXES, randomInt(2, 5));
    const breedColours = BREED_COLOURS[breed.name] ?? ['Black', 'Brown', 'Fawn', 'Red'];

    for (let i = 0; i < numDogs; i++) {
      const sex: 'dog' | 'bitch' = Math.random() < 0.5 ? 'dog' : 'bitch';
      const kennel = pick(breedKennels);

      let regName: string;
      let attempts = 0;
      do { regName = generateDogName(kennel); attempts++; } while (usedNames.has(regName) && attempts < 50);
      usedNames.add(regName);

      let kcNum: string;
      do { kcNum = generateKcRegNumber(); } while (usedKcNumbers.has(kcNum));
      usedKcNumbers.add(kcNum);

      const availableClasses = sex === 'dog' ? dogClasses : bitchClasses;
      const breedClasses = breedSpecificClasses.filter(sc => sc.breedId === breed.id && sc.sex === sex);
      const allAvailableForDog = [...availableClasses, ...breedClasses];
      if (allAvailableForDog.length === 0) continue;

      // Weight towards adult dogs
      const ageWeights = [
        { cat: 'puppy' as const, weight: 15 },
        { cat: 'yearling' as const, weight: 20 },
        { cat: 'adult' as const, weight: 45 },
        { cat: 'veteran' as const, weight: 10 },
        { cat: 'junior' as const, weight: 10 },
      ];
      const totalWeight = ageWeights.reduce((s, w) => s + w.weight, 0);
      let r = Math.random() * totalWeight;
      let ageCategory: 'puppy' | 'yearling' | 'junior' | 'adult' | 'veteran' = 'adult';
      for (const w of ageWeights) { r -= w.weight; if (r <= 0) { ageCategory = w.cat; break; } }

      const eligibleClasses = allAvailableForDog.filter(sc => {
        const className = sc.classDefinition?.name ?? '';
        if (className.toLowerCase().includes('junior handler')) return false;
        return getEligibleAgeCategories(className).includes(ageCategory);
      });
      if (eligibleClasses.length === 0) continue;

      const classRoll = Math.random();
      const numClasses = classRoll < 0.2 ? 1 : classRoll < 0.7 ? 2 : 3;
      const selectedClasses = pickN(eligibleClasses, Math.min(numClasses, eligibleClasses.length));
      const totalFee = entryFee + (selectedClasses.length - 1) * additionalFee;

      const exhibitor = pick(allUsers);
      const ownerName = generateOwnerName();
      const addr = generateAddress();
      const coOwner = Math.random() < 0.2
        ? { name: generateOwnerName(), address: (() => { const a = generateAddress(); return `${a.address}, ${a.town}, ${a.postcode}`; })() }
        : null;

      plannedDogs.push({
        registeredName: regName,
        kcRegNumber: kcNum,
        breedId: breed.id,
        sex,
        dateOfBirth: generateDateOfBirth(ageCategory, showDate),
        sireName: `${pick(KENNEL_PREFIXES)} ${pick(NAME_WORDS)} ${pick(SIRE_SUFFIXES)}`,
        damName: `${pick(KENNEL_PREFIXES)} ${pick(NAME_WORDS)}`,
        breederName: pick(BREEDER_NAMES),
        colour: pick(breedColours),
        ownerId: exhibitor.id,
        exhibitorId: exhibitor.id,
        exhibitorEmail: exhibitor.email,
        ownerName,
        ownerAddress: `${addr.address}, ${addr.town}, ${addr.postcode}`,
        coOwner,
        selectedClassIds: selectedClasses.map(sc => sc.id),
        isFirstClassFlags: selectedClasses.map((_, idx) => idx === 0),
        totalFee,
        catalogueRequested: Math.random() < 0.3,
        isNfc: false,
      });
    }
  }

  // Add NFC entries (~5% of planned entries)
  const nfcCount = Math.ceil(plannedDogs.length * 0.05);
  for (let i = 0; i < nfcCount; i++) {
    const breed = pick(targetBreeds);
    const sex: 'dog' | 'bitch' = Math.random() < 0.5 ? 'dog' : 'bitch';
    let regName: string;
    do { regName = generateDogName(pick(KENNEL_PREFIXES)); } while (usedNames.has(regName));
    usedNames.add(regName);
    let kcNum: string;
    do { kcNum = generateKcRegNumber(); } while (usedKcNumbers.has(kcNum));
    usedKcNumbers.add(kcNum);

    const exhibitor = pick(allUsers);
    const ownerName = generateOwnerName();
    const addr = generateAddress();

    plannedDogs.push({
      registeredName: regName,
      kcRegNumber: kcNum,
      breedId: breed.id,
      sex,
      dateOfBirth: generateDateOfBirth('adult', showDate),
      sireName: `${pick(KENNEL_PREFIXES)} ${pick(NAME_WORDS)}`,
      damName: `${pick(KENNEL_PREFIXES)} ${pick(NAME_WORDS)}`,
      breederName: pick(BREEDER_NAMES),
      colour: pick(BREED_COLOURS[breed.name] ?? ['Black']),
      ownerId: exhibitor.id,
      exhibitorId: exhibitor.id,
      exhibitorEmail: exhibitor.email,
      ownerName,
      ownerAddress: `${addr.address}, ${addr.town}, ${addr.postcode}`,
      coOwner: null,
      selectedClassIds: [],
      isFirstClassFlags: [],
      totalFee: entryFee,
      catalogueRequested: false,
      isNfc: true,
    });
  }

  // ── Phase 2: Batch insert all dogs ──

  const BATCH_SIZE = 50;
  const dogInsertResults: { id: string; idx: number }[] = [];

  for (let b = 0; b < plannedDogs.length; b += BATCH_SIZE) {
    const batch = plannedDogs.slice(b, b + BATCH_SIZE);
    const inserted = await db.insert(schema.dogs).values(
      batch.map(d => ({
        registeredName: d.registeredName,
        kcRegNumber: d.kcRegNumber,
        breedId: d.breedId,
        sex: d.sex,
        dateOfBirth: d.dateOfBirth,
        sireName: d.sireName,
        damName: d.damName,
        breederName: d.breederName,
        colour: d.colour,
        ownerId: d.ownerId,
      }))
    ).returning({ id: schema.dogs.id });

    for (let i = 0; i < inserted.length; i++) {
      dogInsertResults.push({ id: inserted[i].id, idx: b + i });
    }
  }

  result.dogsCreated = dogInsertResults.length;

  // ── Phase 3: Batch insert dog owners ──

  const ownerValues: (typeof schema.dogOwners.$inferInsert)[] = [];
  for (const { id: dogId, idx } of dogInsertResults) {
    const planned = plannedDogs[idx];
    ownerValues.push({
      dogId,
      userId: planned.ownerId,
      ownerName: planned.ownerName,
      ownerAddress: planned.ownerAddress,
      ownerEmail: planned.exhibitorEmail ?? `${planned.ownerName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      isPrimary: true,
      sortOrder: 0,
    });
    if (planned.coOwner) {
      ownerValues.push({
        dogId,
        ownerName: planned.coOwner.name,
        ownerAddress: planned.coOwner.address,
        ownerEmail: `${planned.coOwner.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        isPrimary: false,
        sortOrder: 1,
      });
    }
  }

  for (let b = 0; b < ownerValues.length; b += BATCH_SIZE) {
    await db.insert(schema.dogOwners).values(ownerValues.slice(b, b + BATCH_SIZE));
  }

  // ── Phase 4: Batch insert orders ──

  // Only non-NFC dogs get orders
  const regularDogIndices = dogInsertResults.filter(({ idx }) => !plannedDogs[idx].isNfc);

  const orderInsertResults: { id: string; idx: number }[] = [];
  for (let b = 0; b < regularDogIndices.length; b += BATCH_SIZE) {
    const batch = regularDogIndices.slice(b, b + BATCH_SIZE);
    const inserted = await db.insert(schema.orders).values(
      batch.map(({ idx }) => ({
        showId,
        exhibitorId: plannedDogs[idx].exhibitorId,
        status: 'paid' as const,
        totalAmount: plannedDogs[idx].totalFee + (plannedDogs[idx].catalogueRequested ? 500 : 0),
      }))
    ).returning({ id: schema.orders.id });

    for (let i = 0; i < inserted.length; i++) {
      orderInsertResults.push({ id: inserted[i].id, idx: batch[i].idx });
    }
  }

  result.ordersCreated = orderInsertResults.length;

  // Build orderId lookup by planned index
  const orderIdByIdx = new Map<number, string>();
  for (const { id, idx } of orderInsertResults) {
    orderIdByIdx.set(idx, id);
  }

  // ── Phase 5: Batch insert entries ──

  const entryInsertResults: { id: string; idx: number }[] = [];
  let catNumCounter = 1;

  for (let b = 0; b < dogInsertResults.length; b += BATCH_SIZE) {
    const batch = dogInsertResults.slice(b, b + BATCH_SIZE);
    const inserted = await db.insert(schema.entries).values(
      batch.map(({ id: dogId, idx }) => {
        const planned = plannedDogs[idx];
        const isNfc = planned.isNfc;
        return {
          showId,
          dogId,
          exhibitorId: planned.exhibitorId,
          orderId: orderIdByIdx.get(idx) ?? null,
          entryType: 'standard' as const,
          isNfc,
          status: 'confirmed' as const,
          catalogueNumber: isNfc ? null : String(catNumCounter++),
          catalogueRequested: planned.catalogueRequested,
          totalFee: planned.totalFee,
        };
      })
    ).returning({ id: schema.entries.id });

    for (let i = 0; i < inserted.length; i++) {
      entryInsertResults.push({ id: inserted[i].id, idx: batch[i].idx });
    }
  }

  result.entriesCreated = entryInsertResults.length;

  // ── Phase 6: Batch insert entry classes ──

  const entryClassValues: (typeof schema.entryClasses.$inferInsert)[] = [];
  for (const { id: entryId, idx } of entryInsertResults) {
    const planned = plannedDogs[idx];
    for (let c = 0; c < planned.selectedClassIds.length; c++) {
      entryClassValues.push({
        entryId,
        showClassId: planned.selectedClassIds[c],
        fee: planned.isFirstClassFlags[c] ? entryFee : additionalFee,
      });
    }
  }

  for (let b = 0; b < entryClassValues.length; b += BATCH_SIZE) {
    await db.insert(schema.entryClasses).values(entryClassValues.slice(b, b + BATCH_SIZE));
  }

  result.entryClassesCreated = entryClassValues.length;

  // 7. Create judges and assign to breeds/rings
  const existingJudges = await db.query.judgeAssignments.findMany({
    where: eq(schema.judgeAssignments.showId, showId),
  });

  // If no judges assigned yet, create some
  if (existingJudges.length <= 1) {
    // Delete existing assignments to rebuild
    if (existingJudges.length > 0) {
      await db.delete(schema.judgeAssignments).where(eq(schema.judgeAssignments.showId, showId));
    }

    // Delete existing rings
    const existingRings = await db.query.rings.findMany({ where: eq(schema.rings.showId, showId) });
    if (existingRings.length > 0) {
      await db.delete(schema.rings).where(eq(schema.rings.showId, showId));
    }

    // Determine number of judges/rings based on show scope
    const numJudges = show.showScope === 'single_breed' ? 2 : Math.min(7, targetBreeds.length > 10 ? 5 : 3);
    const judgeNames = pickN(JUDGE_NAMES, numJudges);

    // Create judges (or find existing) — batch lookup + batch insert
    const existingJudges = judgeNames.length > 0
      ? await db.query.judges.findMany({
          where: inArray(schema.judges.name, judgeNames),
        })
      : [];
    const existingByName = new Map(existingJudges.map(j => [j.name, j.id]));
    const newJudgeValues = judgeNames
      .filter(name => !existingByName.has(name))
      .map(name => ({
        name,
        kcNumber: `J${randomInt(1000, 9999)}`,
        contactEmail: `${name.split(' ').pop()?.toLowerCase()}@judges.example.com`,
      }));

    if (newJudgeValues.length > 0) {
      const inserted = await db.insert(schema.judges).values(newJudgeValues).returning({ id: schema.judges.id, name: schema.judges.name });
      for (const j of inserted) existingByName.set(j.name, j.id);
      result.judgesCreated += inserted.length;
    }
    const judgeIds = judgeNames.map(name => existingByName.get(name)!);

    // Create rings (batch)
    const insertedRings = await db.insert(schema.rings).values(
      Array.from({ length: numJudges }, (_, i) => ({
        showId,
        number: i + 1,
        startTime: `${9 + Math.floor(i / 2)}:${i % 2 === 0 ? '00' : '30'}`,
      }))
    ).returning({ id: schema.rings.id });
    const ringIds = insertedRings.map(r => r.id);
    result.ringsCreated = ringIds.length;

    // Assign judges to breeds and rings (batch)
    const assignmentValues: (typeof schema.judgeAssignments.$inferInsert)[] = [];
    if (show.showScope === 'single_breed') {
      for (let i = 0; i < judgeIds.length; i++) {
        assignmentValues.push({
          showId,
          judgeId: judgeIds[i],
          breedId: targetBreeds[0]?.id ?? null,
          ringId: ringIds[i],
        });
      }
    } else {
      const breedsPerJudge = Math.ceil(targetBreeds.length / numJudges);
      for (let j = 0; j < numJudges; j++) {
        const judgeBreeds = targetBreeds.slice(j * breedsPerJudge, (j + 1) * breedsPerJudge);
        for (const breed of judgeBreeds) {
          assignmentValues.push({
            showId,
            judgeId: judgeIds[j],
            breedId: breed.id,
            ringId: ringIds[j],
          });
        }
      }
    }
    if (assignmentValues.length > 0) {
      await db.insert(schema.judgeAssignments).values(assignmentValues);
    }
  }

  // 8. Ensure class numbers are sequential if any are null
  const updatedClasses = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, showId),
    orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
  });

  let classNum = 1;
  for (const sc of updatedClasses) {
    if (!sc.classNumber) {
      await db.update(schema.showClasses)
        .set({ classNumber: classNum })
        .where(eq(schema.showClasses.id, sc.id));
    } else {
      classNum = sc.classNumber;
    }
    classNum++;
  }

  // 9. Set a few entries (~10%) to have a different handler
  const confirmedEntries = await db.query.entries.findMany({
    where: and(
      eq(schema.entries.showId, showId),
      eq(schema.entries.status, 'confirmed'),
      isNull(schema.entries.deletedAt),
    ),
  });

  const handleredCount = Math.ceil(confirmedEntries.length * 0.1);
  const entriesToHandler = pickN(confirmedEntries, handleredCount);
  await Promise.all(
    entriesToHandler.map(entry => {
      const handler = pick(allUsers.filter(u => u.id !== entry.exhibitorId));
      if (!handler) return Promise.resolve();
      return db.update(schema.entries)
        .set({ handlerId: handler.id })
        .where(eq(schema.entries.id, entry.id));
    })
  );

  // 11. Populate show configuration (fill in any missing fields)
  const showUpdates: Record<string, unknown> = {};

  if (!show.secretaryName) showUpdates.secretaryName = 'Amanda McAteer';
  if (!show.secretaryEmail) showUpdates.secretaryEmail = 'mandy@hundarkgsd.co.uk';
  if (!show.secretaryPhone) showUpdates.secretaryPhone = '07813 880000';
  if (!show.secretaryAddress) showUpdates.secretaryAddress = '12 Strathaven Road, Lanark, ML11 9AB';
  if (!show.kcLicenceNo) showUpdates.kcLicenceNo = `2026/${randomInt(1000, 9999)}`;
  if (!show.showOpenTime) showUpdates.showOpenTime = '09:00';
  if (!show.startTime) showUpdates.startTime = '10:00';
  if (!show.endTime) showUpdates.endTime = '17:00';
  if (!show.onCallVet) showUpdates.onCallVet = 'Clyde Vet Group, Hyndford Road, New Lanark Market, Lanark ML11 9SZ — Tel: 01555 662561';
  if (!show.firstEntryFee) showUpdates.firstEntryFee = 800;
  if (!show.subsequentEntryFee) showUpdates.subsequentEntryFee = 300;
  if (!show.nfcEntryFee) showUpdates.nfcEntryFee = 500;
  if (!show.classSexArrangement) showUpdates.classSexArrangement = 'separate_sex';
  if (!show.description) {
    showUpdates.description = `Welcome to the ${show.name}. This ${show.showType} show is held under Royal Kennel Club rules and regulations. All breeds scheduled by the RKC are eligible for entry. Entries close 14 days before the show date. We look forward to seeing you and your dogs on the day.`;
  }

  // Populate scheduleData if not set
  if (!show.scheduleData) {
    showUpdates.scheduleData = {
      country: 'scotland',
      publicAdmission: true,
      wetWeatherAccommodation: true,
      isBenched: false,
      acceptsNfc: true,
      judgedOnGroupSystem: show.showScope === 'general',
      latestArrivalTime: '09:30',
      showManager: 'Mr Colin McAteer',
      guarantors: [
        { name: 'Mrs Amanda McAteer', address: '12 Strathaven Road, Lanark, ML11 9AB' },
        { name: 'Mr Colin McAteer', address: '12 Strathaven Road, Lanark, ML11 9AB' },
        { name: 'Mrs Maxine Cowan', address: '15 Hillpark Drive, Glasgow, G43 2SD' },
        { name: 'Mrs Lynette Guy', address: '8 Victoria Road, Paisley, PA2 7AH' },
        { name: 'Mr James Henderson', address: '23 Castle Street, Hamilton, ML3 6BU' },
      ],
      officers: [
        { name: 'Mrs Amanda McAteer', position: 'Show Secretary' },
        { name: 'Mr Colin McAteer', position: 'Show Manager' },
        { name: 'Mrs Maxine Cowan', position: 'Treasurer' },
        { name: 'Mrs Lynette Guy', position: 'Committee Member' },
        { name: 'Mr James Henderson', position: 'Committee Member' },
      ],
      awardsDescription: 'Best in Show, Reserve Best in Show, Best Puppy in Show, Best Veteran in Show. Group winners to compete for Best in Show.',
      prizeMoney: 'Prize cards for 1st through 5th in each class. Rosettes for Best of Breed, Best Puppy of Breed, Best Veteran of Breed.',
      directions: 'From Glasgow: Take M74 south to Junction 8 (Strathaven). Follow A71 into Strathaven. Turn right at mini roundabout onto Lethame Road. Strathaven Rugby Club is on the left after 400m. Ample free parking available.',
      catering: 'Hot and cold refreshments available throughout the day. Tea, coffee, sandwiches, hot dogs, burgers, and home baking. Vegetarian options available.',
      futureShowDates: 'Autumn Championship Show — 18th October 2026. Spring Open Show — 27th April 2027.',
      additionalNotes: 'Dogs must be kept on leads at all times when outside the ring. Please clean up after your dogs. No bitches in season permitted at the show.',
    };
  }

  if (Object.keys(showUpdates).length > 0) {
    await db.update(schema.shows).set(showUpdates).where(eq(schema.shows.id, showId));
    result.showConfigUpdated = true;
  }

  // 12. Update venue if missing details
  if (show.venueId) {
    const venue = await db.query.venues.findFirst({ where: eq(schema.venues.id, show.venueId) });
    if (venue) {
      const venueUpdates: Record<string, unknown> = {};
      if (!venue.address) venueUpdates.address = 'Lethame Road, Strathaven';
      if (!venue.postcode) venueUpdates.postcode = 'ML10 6AD';
      if (!venue.indoorOutdoor) venueUpdates.indoorOutdoor = 'outdoor';
      if (!venue.capacity) venueUpdates.capacity = 500;
      if (Object.keys(venueUpdates).length > 0) {
        await db.update(schema.venues).set(venueUpdates).where(eq(schema.venues.id, show.venueId));
      }
    }
  }

  // 13. Set organisation logo if missing
  if (show.organisationId) {
    const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, show.organisationId) });
    if (org && !org.logoUrl) {
      // Use a placeholder logo URL — in production this would be an actual uploaded image
      await db.update(schema.organisations)
        .set({ logoUrl: 'https://placehold.co/200x200/1a365d/ffffff?text=BC' })
        .where(eq(schema.organisations.id, show.organisationId));
    }
  }

  // 14. Create sponsors and show sponsorships
  const existingSponsors = await db.query.showSponsors.findMany({
    where: eq(schema.showSponsors.showId, showId),
  });

  if (existingSponsors.length === 0 && show.organisationId) {
    const sponsorData = [
      {
        name: 'Royal Canin',
        category: 'pet_food' as const,
        website: 'https://www.royalcanin.com',
        tier: 'title' as const,
        specialPrizes: 'Royal Canin Best in Show Trophy & £100 voucher. Best Puppy in Show £50 voucher.',
      },
      {
        name: 'Petplan Insurance',
        category: 'insurance' as const,
        website: 'https://www.petplan.co.uk',
        tier: 'show' as const,
        specialPrizes: 'Petplan Best Veteran in Show rosette and 12-month insurance policy.',
      },
      {
        name: 'Burns Pet Nutrition',
        category: 'pet_food' as const,
        website: 'https://www.burnspet.co.uk',
        tier: 'show' as const,
        specialPrizes: 'Burns Reserve Best in Show — bag of Burns Original.',
      },
      {
        name: 'Groomers Choice',
        category: 'grooming' as const,
        website: 'https://www.groomerschoice.co.uk',
        tier: 'class' as const,
        specialPrizes: null,
      },
      {
        name: 'K9 Health Check',
        category: 'health_testing' as const,
        website: 'https://www.k9healthcheck.co.uk',
        tier: 'class' as const,
        specialPrizes: null,
      },
      {
        name: 'Strathaven Butchers',
        category: 'local_business' as const,
        website: null,
        tier: 'prize' as const,
        specialPrizes: 'Hamper of locally sourced meats for Best of Breed in Gundog Group.',
      },
      {
        name: 'Clyde Valley Canine Supplies',
        category: 'pet_products' as const,
        website: null,
        tier: 'advertiser' as const,
        specialPrizes: null,
      },
    ];

    // Batch insert all sponsors, then show sponsors, then class sponsorships
    const sponsorInserts = sponsorData.map(sd => ({
      organisationId: show.organisationId,
      name: sd.name,
      category: sd.category,
      website: sd.website,
      contactName: `${pick(UK_FIRST_NAMES)} ${pick(UK_SURNAMES)}`,
      contactEmail: `${sd.name.toLowerCase().replace(/\s+/g, '')}@example.com`,
    }));
    const insertedSponsors = await db.insert(schema.sponsors).values(sponsorInserts).returning();

    const showSponsorInserts = insertedSponsors.map((sponsor, i) => ({
      showId,
      sponsorId: sponsor.id,
      tier: sponsorData[i].tier,
      displayOrder: i,
      specialPrizes: sponsorData[i].specialPrizes,
      prizeMoney: sponsorData[i].tier === 'title' ? 10000 : sponsorData[i].tier === 'show' ? 5000 : null,
    }));
    const insertedShowSponsors = await db.insert(schema.showSponsors).values(showSponsorInserts).returning();

    // Collect class sponsorships for batch insert
    const trophyNames = [
      'The Challenge Trophy', 'The Memorial Cup', 'The Perpetual Shield',
      'The Champion Plate', 'The Anniversary Salver', 'The Founder\'s Trophy',
    ];
    const classSponsorshipValues: (typeof schema.classSponsorships.$inferInsert)[] = [];
    const eligibleClasses = showClasses.filter(sc => !sc.classDefinition?.name?.toLowerCase().includes('junior handler'));
    for (let i = 0; i < insertedShowSponsors.length; i++) {
      if (sponsorData[i].tier === 'class') {
        const randomClasses = pickN(eligibleClasses, randomInt(2, 4));
        for (const sc of randomClasses) {
          classSponsorshipValues.push({
            showClassId: sc.id,
            showSponsorId: insertedShowSponsors[i].id,
            sponsorName: sponsorData[i].name,
            trophyName: `${sponsorData[i].name} ${pick(trophyNames)}`,
            prizeDescription: `Sponsored by ${sponsorData[i].name}`,
          });
        }
      }
    }
    if (classSponsorshipValues.length > 0) {
      await db.insert(schema.classSponsorships).values(classSponsorshipValues);
    }

    result.sponsorsCreated = insertedSponsors.length;
  }

  // 15. Create sundry items (catalogue pre-order, etc.)
  const existingSundry = await db.query.sundryItems.findMany({
    where: eq(schema.sundryItems.showId, showId),
  });

  if (existingSundry.length === 0) {
    const sundryData = [
      { name: 'Catalogue', description: 'Pre-order a show catalogue to collect on the day', priceInPence: 500, maxPerOrder: 5, sortOrder: 0 },
      { name: 'Car Park Pass', description: 'Reserved parking space close to the showground', priceInPence: 300, maxPerOrder: 2, sortOrder: 1 },
      { name: 'Rosette Pack', description: 'Set of 5 rosettes (1st-5th) for your dog\'s collection', priceInPence: 1000, maxPerOrder: 3, sortOrder: 2 },
    ];

    await db.insert(schema.sundryItems).values(
      sundryData.map(item => ({ showId, ...item, enabled: true }))
    );
  }

  return result;
}

/**
 * Clear all test data from a show (entries, dogs, orders, judges, rings).
 * Only clears data — does not remove classes or show configuration.
 */
export async function clearShowTestData(showId: string): Promise<{ entriesDeleted: number; dogsDeleted: number }> {
  // Get all entries for this show
  const showEntries = await db.query.entries.findMany({
    where: eq(schema.entries.showId, showId),
  });

  const dogIds = showEntries.map(e => e.dogId).filter((id): id is string => !!id);
  const uniqueDogIds = [...new Set(dogIds)];

  // Delete entries (cascades to entry_classes)
  const entriesResult = await db.delete(schema.entries)
    .where(eq(schema.entries.showId, showId))
    .returning();

  // Delete orders
  await db.delete(schema.orders)
    .where(eq(schema.orders.showId, showId));

  // Delete dogs that were created for this show (only if they have no other entries)
  // Find dogs still used by other shows in a single query
  const dogsWithOtherEntries = uniqueDogIds.length > 0
    ? await db.query.entries.findMany({
        where: inArray(schema.entries.dogId, uniqueDogIds),
        columns: { dogId: true },
      })
    : [];
  const dogsStillInUse = new Set(dogsWithOtherEntries.map(e => e.dogId));
  const dogsToDelete = uniqueDogIds.filter(id => !dogsStillInUse.has(id));

  if (dogsToDelete.length > 0) {
    await db.delete(schema.dogOwners).where(inArray(schema.dogOwners.dogId, dogsToDelete));
    await db.delete(schema.dogs).where(inArray(schema.dogs.id, dogsToDelete));
  }
  const dogsDeleted = dogsToDelete.length;

  // Delete rings and judge assignments
  await db.delete(schema.judgeAssignments).where(eq(schema.judgeAssignments.showId, showId));
  await db.delete(schema.rings).where(eq(schema.rings.showId, showId));

  // Delete show sponsors (cascades to class sponsorships)
  const showSponsorRows = await db.query.showSponsors.findMany({
    where: eq(schema.showSponsors.showId, showId),
  });
  if (showSponsorRows.length > 0) {
    const showSponsorIds = showSponsorRows.map(ss => ss.id);
    const sponsorIds = showSponsorRows.map(ss => ss.sponsorId);
    await db.delete(schema.classSponsorships).where(inArray(schema.classSponsorships.showSponsorId, showSponsorIds));
    await db.delete(schema.showSponsors).where(eq(schema.showSponsors.showId, showId));
    await db.delete(schema.sponsors).where(inArray(schema.sponsors.id, sponsorIds));
  }

  // Delete sundry items
  await db.delete(schema.sundryItems).where(eq(schema.sundryItems.showId, showId));

  return { entriesDeleted: entriesResult.length, dogsDeleted };
}
