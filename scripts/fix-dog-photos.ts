import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import * as s from '@/server/db/schema/index.js';

const SHOW_ID = '0021ef83-e25c-4dfa-9528-076becc95c69'; // Burnbrae

async function main() {
  if (!db) { console.log('No db'); return; }

  // Fetch real dog images from Dog CEO API
  console.log('Fetching real dog images from dog.ceo...');
  const res = await fetch('https://dog.ceo/api/breeds/image/random/20');
  const data = await res.json() as { message: string[]; status: string };

  if (data.status !== 'success' || !data.message.length) {
    console.error('Failed to fetch dog images');
    return;
  }

  const dogImageUrls = data.message;
  console.log(`Got ${dogImageUrls.length} real dog images`);

  // Get all entries for the show to find dogIds
  const showEntries = await db.query.entries.findMany({
    where: and(
      eq(s.entries.showId, SHOW_ID),
      eq(s.entries.status, 'confirmed'),
      isNull(s.entries.deletedAt),
      isNotNull(s.entries.dogId)
    ),
    columns: { dogId: true },
  });

  const uniqueDogIds = [...new Set(showEntries.map(e => e.dogId).filter(Boolean))] as string[];
  console.log(`Updating ${uniqueDogIds.length} dog photo records...`);

  let updated = 0;
  for (let i = 0; i < uniqueDogIds.length; i++) {
    const imageUrl = dogImageUrls[i % dogImageUrls.length];

    await db
      .update(s.dogPhotos)
      .set({ url: imageUrl })
      .where(eq(s.dogPhotos.dogId, uniqueDogIds[i]));

    updated++;
  }

  console.log(`✓ Updated ${updated} dog photos with real dog images (cycling through ${dogImageUrls.length} photos)`);
}

main().catch(console.error);
