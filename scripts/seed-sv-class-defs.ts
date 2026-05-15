import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { classDefinitions } from '../src/server/db/schema';
import { eq } from 'drizzle-orm';

const SV_CLASSES = [
  { name: 'Baby Puppy',     minAgeMonths: 2,  maxAgeMonths: 4,    sortOrder: 500 },
  { name: 'SV Minor Puppy', minAgeMonths: 4,  maxAgeMonths: 6,    sortOrder: 511 },
  { name: 'SV Puppy',       minAgeMonths: 6,  maxAgeMonths: 9,    sortOrder: 521 },
  { name: 'SV Junior',      minAgeMonths: 9,  maxAgeMonths: 18,   sortOrder: 531 },
  { name: 'SV Yearling',    minAgeMonths: 18, maxAgeMonths: 24,   sortOrder: 541 },
  { name: 'Adult',          minAgeMonths: 24, maxAgeMonths: null, sortOrder: 550 },
  { name: 'Working',        minAgeMonths: 24, maxAgeMonths: null, sortOrder: 560 },
] as const;

(async () => {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);
  let added = 0;
  let skipped = 0;

  for (const cls of SV_CLASSES) {
    const existing = await db
      .select({ id: classDefinitions.id })
      .from(classDefinitions)
      .where(eq(classDefinitions.name, cls.name))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(classDefinitions).values({
      name: cls.name,
      type: 'sv_age',
      minAgeMonths: cls.minAgeMonths,
      maxAgeMonths: cls.maxAgeMonths ?? null,
      sortOrder: cls.sortOrder,
      description: `WUSV/SV ${cls.name} class`,
    });
    added++;
    console.log(`Added: ${cls.name}`);
  }

  console.log(`\nDone: +${added} added, ${skipped} already present`);
  await client.end();
})();
