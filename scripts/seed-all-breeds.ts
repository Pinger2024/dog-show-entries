/**
 * Comprehensive KC breed seeder — adds all ~222 KC-recognized breeds.
 * Run with: npx tsx scripts/seed-all-breeds.ts
 *
 * Uses onConflictDoNothing() so it's safe to re-run (idempotent).
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

// All KC-recognized breeds organized by group
const breedsByGroup: Record<string, string[]> = {
  Gundog: [
    'Barbet',
    'Bracco Italiano',
    'Braque D\'Auvergne',
    'Brittany',
    'English Setter',
    'German Longhaired Pointer',
    'German Shorthaired Pointer',
    'German Wirehaired Pointer',
    'Gordon Setter',
    'Hungarian Vizsla',
    'Hungarian Wire Haired Vizsla',
    'Irish Red and White Setter',
    'Irish Setter',
    'Italian Spinone',
    'Korthals Griffon',
    'Lagotto Romagnolo',
    'Large Munsterlander',
    'Pointer',
    'Portuguese Pointer',
    'Retriever (Chesapeake Bay)',
    'Retriever (Curly Coated)',
    'Retriever (Flat Coated)',
    'Retriever (Golden)',
    'Retriever (Labrador)',
    'Retriever (Nova Scotia Duck Tolling)',
    'Slovakian Rough Haired Pointer',
    'Small Munsterlander',
    'Spaniel (American Cocker)',
    'Spaniel (American Water)',
    'Spaniel (Clumber)',
    'Spaniel (Cocker)',
    'Spaniel (English Springer)',
    'Spaniel (Field)',
    'Spaniel (Irish Water)',
    'Spaniel (Sussex)',
    'Spaniel (Welsh Springer)',
    'Spanish Water Dog',
    'Weimaraner',
    // Keep existing names as aliases
    'Labrador Retriever',
    'Golden Retriever',
    'English Springer Spaniel',
    'Cocker Spaniel',
  ],
  Hound: [
    'Afghan Hound',
    'Azawakh',
    'Basenji',
    'Basset Bleu De Gascogne',
    'Basset Fauve De Bretagne',
    'Basset Griffon Vendeen (Grand)',
    'Basset Griffon Vendeen (Petit)',
    'Basset Hound',
    'Bavarian Mountain Hound',
    'Beagle',
    'Black and Tan Coonhound',
    'Bloodhound',
    'Borzoi',
    'Cirneco Dell\'Etna',
    'Dachshund (Long Haired)',
    'Dachshund (Miniature Long Haired)',
    'Dachshund (Miniature Smooth Haired)',
    'Dachshund (Miniature Wire Haired)',
    'Dachshund (Smooth Haired)',
    'Dachshund (Wire Haired)',
    'Deerhound',
    'Finnish Spitz',
    'Foxhound',
    'Grand Bleu De Gascogne',
    'Greyhound',
    'Griffon Fauve De Bretagne',
    'Hamiltonstovare',
    'Harrier',
    'Ibizan Hound',
    'Irish Wolfhound',
    'Norwegian Elkhound',
    'Otterhound',
    'Pharaoh Hound',
    'Portuguese Podengo',
    'Rhodesian Ridgeback',
    'Saluki',
    'Sloughi',
    'Whippet',
  ],
  Pastoral: [
    'Anatolian Shepherd Dog',
    'Australian Cattle Dog',
    'Australian Shepherd',
    'Bearded Collie',
    'Beauceron',
    'Belgian Shepherd Dog (Groenendael)',
    'Belgian Shepherd Dog (Laekenois)',
    'Belgian Shepherd Dog (Malinois)',
    'Belgian Shepherd Dog (Tervueren)',
    'Bergamasco',
    'Border Collie',
    'Briard',
    'Catalan Sheepdog',
    'Collie (Rough)',
    'Collie (Smooth)',
    'Estrela Mountain Dog',
    'Finnish Lapphund',
    'German Shepherd Dog',
    'Hungarian Kuvasz',
    'Hungarian Mudi',
    'Hungarian Puli',
    'Hungarian Pumi',
    'Icelandic Sheepdog',
    'Komondor',
    'Lancashire Heeler',
    'Maremma Sheepdog',
    'Norwegian Buhund',
    'Old English Sheepdog',
    'Picardy Sheepdog',
    'Polish Lowland Sheepdog',
    'Pyrenean Mountain Dog',
    'Pyrenean Sheepdog (Long Haired)',
    'Pyrenean Sheepdog (Smooth Faced)',
    'Samoyed',
    'Shetland Sheepdog',
    'Swedish Lapphund',
    'Swedish Vallhund',
    'Turkish Kangal Dog',
    'Welsh Corgi (Cardigan)',
    'Welsh Corgi (Pembroke)',
    'White Swiss Shepherd Dog',
  ],
  Terrier: [
    'Airedale Terrier',
    'Australian Terrier',
    'Bedlington Terrier',
    'Border Terrier',
    'Bull Terrier',
    'Bull Terrier (Miniature)',
    'Cairn Terrier',
    'Cesky Terrier',
    'Dandie Dinmont Terrier',
    'Fox Terrier (Smooth)',
    'Fox Terrier (Wire)',
    'Glen of Imaal Terrier',
    'Irish Terrier',
    'Jack Russell Terrier',
    'Kerry Blue Terrier',
    'Lakeland Terrier',
    'Manchester Terrier',
    'Norfolk Terrier',
    'Norwich Terrier',
    'Parson Russell Terrier',
    'Scottish Terrier',
    'Sealyham Terrier',
    'Skye Terrier',
    'Soft Coated Wheaten Terrier',
    'Staffordshire Bull Terrier',
    'Welsh Terrier',
    'West Highland White Terrier',
  ],
  Toy: [
    'Affenpinscher',
    'Australian Silky Terrier',
    'Bichon Frise',
    'Bolognese',
    'Cavalier King Charles Spaniel',
    'Chihuahua (Long Coat)',
    'Chihuahua (Smooth Coat)',
    'Chinese Crested',
    'Coton De Tulear',
    'English Toy Terrier (Black and Tan)',
    'Griffon Bruxellois',
    'Havanese',
    'Italian Greyhound',
    'Japanese Chin',
    'King Charles Spaniel',
    'Lowchen',
    'Maltese',
    'Miniature Pinscher',
    'Papillon',
    'Pekingese',
    'Pomeranian',
    'Pug',
    'Russian Toy',
    'Yorkshire Terrier',
  ],
  Utility: [
    'Akita',
    'Boston Terrier',
    'Bulldog',
    'Canaan Dog',
    'Chow Chow',
    'Dalmatian',
    'Eurasier',
    'French Bulldog',
    'German Spitz (Klein)',
    'German Spitz (Mittel)',
    'Japanese Akita Inu',
    'Japanese Shiba Inu',
    'Japanese Spitz',
    'Keeshond',
    'Kooikerhondje',
    'Korean Jindo',
    'Lhasa Apso',
    'Mexican Hairless (Intermediate)',
    'Mexican Hairless (Miniature)',
    'Mexican Hairless (Standard)',
    'Miniature Schnauzer',
    'Poodle (Miniature)',
    'Poodle (Standard)',
    'Poodle (Toy)',
    'Schipperke',
    'Schnauzer',
    'Shar Pei',
    'Shih Tzu',
    'Tibetan Spaniel',
    'Tibetan Terrier',
  ],
  Working: [
    'Alaskan Malamute',
    'Bernese Mountain Dog',
    'Bouvier Des Flandres',
    'Boxer',
    'Bullmastiff',
    'Canadian Eskimo Dog',
    'Dobermann',
    'Dogue De Bordeaux',
    'Entlebucher Mountain Dog',
    'German Pinscher',
    'Giant Schnauzer',
    'Great Dane',
    'Great Swiss Mountain Dog',
    'Greenland Dog',
    'Hovawart',
    'Leonberger',
    'Mastiff',
    'Neapolitan Mastiff',
    'Newfoundland',
    'Portuguese Water Dog',
    'Pyrenean Mastiff',
    'Rottweiler',
    'Russian Black Terrier',
    'Saint Bernard',
    'Siberian Husky',
    'Tibetan Mastiff',
  ],
};

async function main() {
  console.log('Seeding comprehensive KC breed data...\n');

  // Ensure all 7 breed groups exist
  const existingGroups = await db.query.breedGroups.findMany();
  const groupMap = Object.fromEntries(existingGroups.map((g) => [g.name, g.id]));

  const missingGroups = Object.keys(breedsByGroup).filter((g) => !groupMap[g]);
  if (missingGroups.length > 0) {
    console.log(`Creating missing groups: ${missingGroups.join(', ')}`);
    const newGroups = await db
      .insert(schema.breedGroups)
      .values(missingGroups.map((name, i) => ({ name, sortOrder: i + 1 })))
      .onConflictDoNothing()
      .returning();
    for (const g of newGroups) {
      groupMap[g.name] = g.id;
    }
  }
  console.log(`  ✓ ${Object.keys(groupMap).length} breed groups confirmed\n`);

  // Insert all breeds
  let totalInserted = 0;
  for (const [groupName, breeds] of Object.entries(breedsByGroup)) {
    const groupId = groupMap[groupName];
    if (!groupId) {
      console.log(`  ⚠ Group "${groupName}" not found, skipping`);
      continue;
    }

    const result = await db
      .insert(schema.breeds)
      .values(breeds.map((name) => ({ name, groupId })))
      .onConflictDoNothing()
      .returning();

    totalInserted += result.length;
    console.log(`  ${groupName}: ${result.length} new breeds (${breeds.length} total in group)`);
  }

  // Count total breeds in DB
  const allBreeds = await db.query.breeds.findMany();
  console.log(`\n  ✓ ${totalInserted} new breeds inserted`);
  console.log(`  ✓ ${allBreeds.length} total breeds in database\n`);

  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
