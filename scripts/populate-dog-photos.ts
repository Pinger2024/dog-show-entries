import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import * as s from '@/server/db/schema/index.js';
import { v4 as uuid } from 'uuid';

const SHOW_ID = '0021ef83-e25c-4dfa-9528-076becc95c69'; // Burnbrae Spring Show Bonanza

// Breed-themed placeholder images using picsum with deterministic seeds
// These give high-quality landscape/nature/animal photos — good enough for demo
function placeholderUrl(seed: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/400/400`;
}

async function main() {
  if (!db) { console.log('No db'); return; }

  // Get confirmed entries with their dogs and breeds
  const showEntries = await db.query.entries.findMany({
    where: and(
      eq(s.entries.showId, SHOW_ID),
      eq(s.entries.status, 'confirmed'),
      isNull(s.entries.deletedAt),
      isNotNull(s.entries.dogId)
    ),
    with: {
      dog: {
        with: { breed: true },
      },
    },
  });

  console.log(`Found ${showEntries.length} confirmed entries with dogs`);

  // Deduplicate by dogId (a dog can have multiple class entries)
  const seenDogs = new Set<string>();
  const uniqueDogs: typeof showEntries = [];
  for (const entry of showEntries) {
    if (!entry.dogId || seenDogs.has(entry.dogId)) continue;
    seenDogs.add(entry.dogId);
    uniqueDogs.push(entry);
  }

  console.log(`${uniqueDogs.length} unique dogs`);

  // Check which dogs already have photos
  const existingPhotos = await db.query.dogPhotos.findMany({
    columns: { dogId: true },
  });
  const dogsWithPhotos = new Set(existingPhotos.map((p) => p.dogId));

  let created = 0;
  let skipped = 0;

  for (const entry of uniqueDogs) {
    if (!entry.dogId) continue;
    if (dogsWithPhotos.has(entry.dogId)) {
      skipped++;
      continue;
    }

    const breedName = entry.dog?.breed?.name ?? 'dog';
    const dogName = entry.dog?.registeredName ?? 'Unknown';
    const seed = `${breedName}-${entry.dogId.slice(0, 8)}`;

    await db.insert(s.dogPhotos).values({
      id: uuid(),
      dogId: entry.dogId,
      storageKey: `placeholder/dogs/${entry.dogId}.jpg`, // Not a real R2 key
      url: placeholderUrl(seed),
      isPrimary: true,
      sortOrder: 0,
    });

    created++;
  }

  console.log(`✓ Created ${created} dog photo records (${skipped} dogs already had photos)`);

  // Show breed distribution
  const breedCounts = new Map<string, number>();
  for (const entry of uniqueDogs) {
    const breed = entry.dog?.breed?.name ?? 'Unknown';
    breedCounts.set(breed, (breedCounts.get(breed) ?? 0) + 1);
  }
  console.log('\nBreed distribution (dogs with photos):');
  const sorted = [...breedCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [breed, count] of sorted.slice(0, 10)) {
    console.log(`  ${breed}: ${count}`);
  }
}

main().catch(console.error);
