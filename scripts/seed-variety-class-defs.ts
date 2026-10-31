/**
 * Seed the four RKC variety class definitions for multi-breed shows.
 * These are used when a secretary adds AVNSC, AVIBR, Variety Class, or Rare Breeds
 * to their show. Idempotent — skips rows that already exist by name.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { classDefinitions } from '../src/server/db/schema/class-definitions';

const VARIETY_DEFS = [
  {
    name: 'Any Variety Not Separately Classified',
    type: 'special' as const,
    sortOrder: 310,
    description:
      'For breeds not separately classified at this show. Exhibits must be registered on the Breed Register or Activity Register of The Royal Kennel Club. Cannot be entered by dogs on the Imported Breed Register.',
  },
  {
    name: 'Any Variety Imported Breed Register',
    type: 'special' as const,
    sortOrder: 320,
    description:
      'For breeds confined to the Imported Breeds Register and only when an Interim Breed Standard has been published by The Royal Kennel Club.',
  },
  {
    name: 'Variety Class',
    type: 'special' as const,
    sortOrder: 330,
    description:
      'A class in which more than one breed or variety of a breed with a breed standard can compete. Also applies to Stakes Classes.',
  },
  {
    name: 'Rare Breeds',
    type: 'special' as const,
    sortOrder: 340,
    description:
      'For breeds designated as Rare Breeds by The Royal Kennel Club.',
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const ssl = !/localhost|127\.0\.0\.1/.test(url);
  const client = postgres(url, { prepare: false, ssl });
  const db = drizzle(client);

  let added = 0;
  let skipped = 0;

  for (const def of VARIETY_DEFS) {
    const [existing] = await db
      .select({ id: classDefinitions.id })
      .from(classDefinitions)
      .where(eq(classDefinitions.name, def.name))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(classDefinitions).values(def);
    console.log(`  + Created: ${def.name}`);
    added++;
  }

  console.log(`\nVariety class definitions: +${added} added, ${skipped} already present`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
