import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, asc } from 'drizzle-orm';
import * as s from '@/server/db/schema/index.js';

const showId = '0021ef83-e25c-4dfa-9528-076becc95c69';

async function main() {
  const showClasses = await db.query.showClasses.findMany({
    where: eq(s.showClasses.showId, showId),
    with: { classDefinition: true, breed: true },
    orderBy: [asc(s.showClasses.sortOrder), asc(s.showClasses.classNumber)],
  });
  console.log('Total show classes:', showClasses.length);

  const allBreedClasses = showClasses.filter(sc => sc.breedId === null);
  console.log('All-breed classes (breedId === null):', allBreedClasses.length);

  const allBreedClasses2 = showClasses.filter(sc => sc.breedId == null);
  console.log('All-breed classes (breedId == null):', allBreedClasses2.length);

  const noBid = showClasses.filter(sc => {
    return sc.breedId === null || sc.breedId === undefined;
  });
  console.log('No breedId (null or undefined):', noBid.length);

  for (const sc of showClasses) {
    console.log(`  #${sc.classNumber} ${sc.classDefinition?.name} (${sc.sex}) breedId=${sc.breedId} breed=${sc.breed?.name ?? 'null'}`);
  }

  // Check breeds
  const allBreeds = await db.query.breeds.findMany({ with: { group: true } });
  const breedMap = new Map(allBreeds.map(b => [b.name, b]));

  const POPULAR_BREEDS_BY_GROUP: Record<string, string[]> = {
    Gundog: ['Labrador Retriever', 'Golden Retriever', 'Cocker Spaniel', 'English Springer Spaniel',
      'German Shorthaired Pointer', 'Irish Setter', 'Gordon Setter', 'Vizsla'],
    Hound: ['Beagle', 'Whippet', 'Dachshund (Miniature Smooth Haired)', 'Afghan Hound', 'Basset Hound'],
    Pastoral: ['Border Collie', 'German Shepherd Dog', 'Old English Sheepdog', 'Shetland Sheepdog'],
    Terrier: ['West Highland White Terrier', 'Staffordshire Bull Terrier', 'Border Terrier', 'Airedale Terrier'],
    Toy: ['Cavalier King Charles Spaniel', 'Pomeranian', 'Chihuahua (Smooth Coat)'],
    Utility: ['Bulldog', 'Dalmatian', 'Standard Poodle'],
    Working: ['Rottweiler', 'Boxer', 'Great Dane', 'Dobermann'],
  };

  const targetBreedNames = Object.values(POPULAR_BREEDS_BY_GROUP).flat();
  const targetBreeds = targetBreedNames
    .map(name => breedMap.get(name))
    .filter(b => b != null);

  console.log('\nTarget breeds matched:', targetBreeds.length, 'of', targetBreedNames.length);
  for (const n of targetBreedNames) {
    const found = breedMap.get(n);
    console.log(`  ${n}: ${found ? 'FOUND (' + found.id.slice(0, 8) + ')' : 'MISSING'}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
