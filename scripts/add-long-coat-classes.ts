/**
 * One-off script to add Long Coat GSD class definitions to the production database.
 * Run with: npx tsx scripts/add-long-coat-classes.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function main() {
  console.log('Adding Long Coat GSD class definitions...\n');

  const result = await db
    .insert(schema.classDefinitions)
    .values([
      {
        name: 'Long Coat Open',
        type: 'achievement' as const,
        description:
          'For Long Coat German Shepherd Dogs eligible for entry at the show. No restrictions.',
      },
      {
        name: 'Long Coat Puppy',
        type: 'age' as const,
        minAgeMonths: 6,
        maxAgeMonths: 12,
        description:
          'For Long Coat German Shepherd Dogs of 6 and not exceeding 12 calendar months of age on the first day of the show.',
      },
    ])
    .onConflictDoNothing()
    .returning();

  if (result.length > 0) {
    console.log(`✓ Added ${result.length} class definitions:`);
    for (const cd of result) {
      console.log(`  - ${cd.name} (${cd.id})`);
    }
  } else {
    console.log('⏭ Class definitions already exist, nothing to do.');
  }

  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
