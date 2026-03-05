/**
 * Cleanup script — removes breeds from the DB that aren't in the Crufts 2025 list.
 * Only deletes breeds with no references (dogs, showClasses, judgeAssignments).
 * Run with: npx tsx scripts/cleanup-breeds.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

// Crufts 2025 breed list (source of truth from Fossedata)
const cruftsBreeds = new Set([
  // Gundog
  'Bracco Italiano', 'Brittany', 'English Setter', 'German Longhaired Pointer',
  'German Shorthaired Pointer', 'German Wirehaired Pointer', 'Gordon Setter',
  'Hungarian Vizsla', 'Hungarian Wire Haired Vizsla', 'Irish Red and White Setter',
  'Irish Setter', 'Italian Spinone', 'Lagotto Romagnolo', 'Large Munsterlander',
  'Pointer', 'Retriever (Chesapeake Bay)', 'Retriever (Curly Coated)',
  'Retriever (Flat Coated)', 'Retriever (Golden)', 'Retriever (Labrador)',
  'Retriever (Nova Scotia Duck Tolling)', 'Spaniel (American Cocker)',
  'Spaniel (Clumber)', 'Spaniel (Cocker)', 'Spaniel (English Springer)',
  'Spaniel (Field)', 'Spaniel (Irish Water)', 'Spaniel (Sussex)',
  'Spaniel (Welsh Springer)', 'Spanish Water Dog', 'Weimaraner',
  // Hound
  'Afghan Hound', 'Basenji', 'Basset Fauve De Bretagne',
  'Basset Griffon Vendeen (Grand)', 'Basset Griffon Vendeen (Petit)',
  'Basset Hound', 'Bavarian Mountain Hound', 'Beagle', 'Bloodhound', 'Borzoi',
  'Cirneco Dell\'Etna', 'Dachshund (Long Haired)',
  'Dachshund (Miniature Long Haired)', 'Dachshund (Miniature Smooth Haired)',
  'Dachshund (Miniature Wire Haired)', 'Dachshund (Smooth Haired)',
  'Dachshund (Wire Haired)', 'Deerhound', 'Finnish Spitz', 'Foxhound',
  'Greyhound', 'Hamiltonstovare', 'Harrier', 'Ibizan Hound', 'Irish Wolfhound',
  'Norwegian Elkhound', 'Otterhound', 'Pharaoh Hound', 'Portuguese Podengo',
  'Rhodesian Ridgeback', 'Saluki', 'Sloughi', 'Whippet',
  // Pastoral
  'Anatolian Shepherd Dog', 'Australian Cattle Dog', 'Australian Shepherd',
  'Bearded Collie', 'Beauceron', 'Belgian Shepherd Dog (Groenendael)',
  'Belgian Shepherd Dog (Laekenois)', 'Belgian Shepherd Dog (Malinois)',
  'Belgian Shepherd Dog (Tervueren)', 'Border Collie', 'Briard',
  'Catalan Sheepdog', 'Collie (Rough)', 'Collie (Smooth)',
  'Estrela Mountain Dog', 'Finnish Lapphund', 'German Shepherd Dog',
  'Hungarian Puli', 'Hungarian Pumi', 'Komondor', 'Lancashire Heeler',
  'Maremma Sheepdog', 'Norwegian Buhund', 'Old English Sheepdog',
  'Polish Lowland Sheepdog', 'Pyrenean Mountain Dog',
  'Pyrenean Sheepdog (Long Haired)', 'Samoyed', 'Shetland Sheepdog',
  'Swedish Vallhund', 'Turkish Kangal Dog', 'Welsh Corgi (Cardigan)',
  'Welsh Corgi (Pembroke)',
  // Terrier
  'Airedale Terrier', 'Australian Terrier', 'Bedlington Terrier', 'Border Terrier',
  'Bull Terrier', 'Bull Terrier (Miniature)', 'Cairn Terrier', 'Cesky Terrier',
  'Dandie Dinmont Terrier', 'Fox Terrier (Smooth)', 'Fox Terrier (Wire)',
  'Glen of Imaal Terrier', 'Irish Terrier', 'Jack Russell Terrier',
  'Kerry Blue Terrier', 'Lakeland Terrier', 'Manchester Terrier',
  'Norfolk Terrier', 'Norwich Terrier', 'Parson Russell Terrier',
  'Scottish Terrier', 'Sealyham Terrier', 'Skye Terrier',
  'Soft Coated Wheaten Terrier', 'Staffordshire Bull Terrier', 'Welsh Terrier',
  'West Highland White Terrier',
  // Toy
  'Affenpinscher', 'Australian Silky Terrier', 'Bichon Frise', 'Bolognese',
  'Cavalier King Charles Spaniel', 'Chihuahua (Long Coat)',
  'Chihuahua (Smooth Coat)', 'Chinese Crested', 'Coton De Tulear',
  'English Toy Terrier (Black and Tan)', 'Griffon Bruxellois', 'Havanese',
  'Italian Greyhound', 'Japanese Chin', 'King Charles Spaniel', 'Lowchen',
  'Maltese', 'Miniature Pinscher', 'Papillon', 'Pekingese', 'Pomeranian',
  'Pug', 'Yorkshire Terrier',
  // Utility
  'Akita', 'Boston Terrier', 'Bulldog', 'Canaan Dog', 'Chow Chow', 'Dalmatian',
  'Eurasier', 'French Bulldog', 'German Spitz (Klein)', 'German Spitz (Mittel)',
  'Japanese Akita Inu', 'Japanese Shiba Inu', 'Japanese Spitz', 'Keeshond',
  'Kooikerhondje', 'Lhasa Apso', 'Miniature Schnauzer', 'Poodle (Miniature)',
  'Poodle (Standard)', 'Poodle (Toy)', 'Schipperke', 'Schnauzer', 'Shar Pei',
  'Shih Tzu', 'Tibetan Spaniel', 'Tibetan Terrier',
  // Working
  'Alaskan Malamute', 'Bernese Mountain Dog', 'Bouvier Des Flandres', 'Boxer',
  'Bullmastiff', 'Canadian Eskimo Dog', 'Dobermann', 'Dogue De Bordeaux',
  'German Pinscher', 'Giant Schnauzer', 'Great Dane', 'Great Swiss Mountain Dog',
  'Greenland Dog', 'Hovawart', 'Leonberger', 'Mastiff', 'Neapolitan Mastiff',
  'Newfoundland', 'Portuguese Water Dog', 'Rottweiler', 'Russian Black Terrier',
  'Saint Bernard', 'Siberian Husky', 'Tibetan Mastiff',
]);

async function main() {
  console.log('Checking for breeds not in Crufts 2025 list...\n');

  const allBreeds = await db.query.breeds.findMany({
    with: { group: true },
  });

  const toCheck = allBreeds.filter((b) => !cruftsBreeds.has(b.name));

  if (toCheck.length === 0) {
    console.log('All breeds match the Crufts 2025 list. Nothing to clean up.');
    await client.end();
    return;
  }

  console.log(`Found ${toCheck.length} breed(s) not in Crufts 2025 list:\n`);
  for (const b of toCheck) {
    console.log(`  - ${b.name} (${b.group?.name ?? 'unknown group'})`);
  }
  console.log('');

  const deleted: string[] = [];
  const kept: { name: string; reason: string }[] = [];

  for (const breed of toCheck) {
    // Check for references in dogs
    const dogsWithBreed = await db.query.dogs.findFirst({
      where: eq(schema.dogs.breedId, breed.id),
    });
    if (dogsWithBreed) {
      kept.push({ name: breed.name, reason: 'referenced by dogs' });
      continue;
    }

    // Check for references in showClasses
    const classesWithBreed = await db.query.showClasses.findFirst({
      where: eq(schema.showClasses.breedId, breed.id),
    });
    if (classesWithBreed) {
      kept.push({ name: breed.name, reason: 'referenced by show classes' });
      continue;
    }

    // Check for references in judgeAssignments
    const assignmentsWithBreed = await db.query.judgeAssignments.findFirst({
      where: eq(schema.judgeAssignments.breedId, breed.id),
    });
    if (assignmentsWithBreed) {
      kept.push({ name: breed.name, reason: 'referenced by judge assignments' });
      continue;
    }

    // Safe to delete
    await db.delete(schema.breeds).where(eq(schema.breeds.id, breed.id));
    deleted.push(breed.name);
  }

  console.log('Results:');
  if (deleted.length > 0) {
    console.log(`\n  ✓ Deleted ${deleted.length} unreferenced breed(s):`);
    for (const name of deleted) {
      console.log(`    - ${name}`);
    }
  }
  if (kept.length > 0) {
    console.log(`\n  ⚠ Kept ${kept.length} breed(s) (have references):`);
    for (const { name, reason } of kept) {
      console.log(`    - ${name} (${reason})`);
    }
  }

  console.log('');
  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
