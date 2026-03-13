import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  if (!db) { console.log('No db'); return; }

  console.log('Adding image columns...');

  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS banner_image_url text`);
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS banner_image_storage_key text`);
  console.log('✓ shows: banner_image_url, banner_image_storage_key');

  await db.execute(sql`ALTER TABLE venues ADD COLUMN IF NOT EXISTS image_url text`);
  await db.execute(sql`ALTER TABLE venues ADD COLUMN IF NOT EXISTS image_storage_key text`);
  console.log('✓ venues: image_url, image_storage_key');

  await db.execute(sql`ALTER TABLE results ADD COLUMN IF NOT EXISTS winner_photo_url text`);
  await db.execute(sql`ALTER TABLE results ADD COLUMN IF NOT EXISTS winner_photo_storage_key text`);
  console.log('✓ results: winner_photo_url, winner_photo_storage_key');

  console.log('\nDone! All image columns added.');
}

main().catch(console.error);
