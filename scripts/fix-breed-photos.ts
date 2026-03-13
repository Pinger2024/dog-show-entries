import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { sql } from 'drizzle-orm';

/**
 * Mapping from our RKC breed names to dog.ceo API breed paths.
 * dog.ceo format: /breed/{breed}/images/random  or  /breed/{breed}/{sub}/images/random
 * We store just the path segment: "germanshepherd" or "retriever/golden"
 */
const BREED_MAP: Record<string, string> = {
  'Afghan Hound': 'hound/afghan',
  'Airedale Terrier': 'airedale',
  'Basset Hound': 'hound/basset',
  'Beagle': 'beagle',
  'Border Collie': 'collie/border',
  'Border Terrier': 'terrier/border',
  'Boxer': 'boxer',
  'Bulldog': 'bulldog/english',
  'Cavalier King Charles Spaniel': 'spaniel/cocker', // No cavalier in API, cocker spaniel is closest
  'Chihuahua (Smooth Coat)': 'chihuahua',
  'Cocker Spaniel': 'spaniel/cocker',
  'Dachshund (Miniature Smooth Haired)': 'dachshund',
  'Dalmatian': 'dalmatian',
  'Dobermann': 'doberman',
  'English Springer Spaniel': 'springer/english',
  'German Shepherd Dog': 'german/shepherd',
  'German Shepherd Dog (Long Coat)': 'german/shepherd',
  'German Shorthaired Pointer': 'pointer/german',
  'Golden Retriever': 'retriever/golden',
  'Gordon Setter': 'setter/gordon',
  'Great Dane': 'dane/great',
  'Irish Setter': 'setter/irish',
  'Labrador Retriever': 'labrador',
  'Old English Sheepdog': 'sheepdog/english',
  'Pomeranian': 'pomeranian',
  'Rottweiler': 'rottweiler',
  'Shetland Sheepdog': 'sheepdog/shetland',
  'Staffordshire Bull Terrier': 'bullterrier/staffordshire',
  'West Highland White Terrier': 'terrier/westhighland',
  'Whippet': 'whippet',
};

async function fetchBreedImages(apiPath: string, count: number): Promise<string[]> {
  const url = `https://dog.ceo/api/breed/${apiPath}/images/random/${count}`;
  const res = await fetch(url);
  const data = (await res.json()) as { message: string | string[]; status: string };

  if (data.status !== 'success') {
    console.error(`  Failed to fetch from ${url}`);
    return [];
  }

  // API returns a single string if count=1, array otherwise
  return Array.isArray(data.message) ? data.message : [data.message];
}

async function main() {
  if (!db) {
    console.log('No db connection');
    return;
  }

  // Get all breeds that have dog_photos
  const breeds = (await db.execute(sql`
    SELECT DISTINCT b.name as breed_name, b.id as breed_id, COUNT(dp.id) as photo_count
    FROM dog_photos dp
    JOIN dogs d ON dp.dog_id = d.id
    JOIN breeds b ON d.breed_id = b.id
    GROUP BY b.name, b.id
    ORDER BY b.name
  `)) as { breed_name: string; breed_id: string; photo_count: string }[];

  console.log(`Found ${breeds.length} breeds with photos in database\n`);

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const breed of breeds) {
    const apiPath = BREED_MAP[breed.breed_name];

    if (!apiPath) {
      console.log(`SKIP: "${breed.breed_name}" — no mapping to dog.ceo API`);
      totalSkipped += Number(breed.photo_count);
      continue;
    }

    console.log(`Processing: ${breed.breed_name} (${breed.photo_count} photos) -> ${apiPath}`);

    // Fetch 3 breed-specific images
    const images = await fetchBreedImages(apiPath, 3);

    if (images.length === 0) {
      console.log(`  ERROR: Could not fetch images for ${apiPath}`);
      totalSkipped += Number(breed.photo_count);
      continue;
    }

    console.log(`  Fetched ${images.length} images`);

    // Get all dog_photo IDs for dogs of this breed
    const photos = (await db.execute(sql`
      SELECT dp.id as photo_id
      FROM dog_photos dp
      JOIN dogs d ON dp.dog_id = d.id
      WHERE d.breed_id = ${breed.breed_id}
      ORDER BY dp.created_at
    `)) as { photo_id: string }[];

    // Update each photo, cycling through the breed images
    for (let i = 0; i < photos.length; i++) {
      const imageUrl = images[i % images.length];
      await db.execute(sql`
        UPDATE dog_photos SET url = ${imageUrl} WHERE id = ${photos[i].photo_id}
      `);
    }

    console.log(`  Updated ${photos.length} photos`);
    totalUpdated += photos.length;

    // Small delay to be polite to the API
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone! Updated ${totalUpdated} photos, skipped ${totalSkipped}`);
  process.exit(0);
}

main().catch(console.error);
