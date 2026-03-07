/**
 * One-off script to add Junior Handler class definitions to the production database.
 * Run with: npx tsx scripts/add-junior-handler-classes.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function main() {
  console.log('Adding Junior Handler class definitions...\n');

  const result = await db
    .insert(schema.classDefinitions)
    .values([
      {
        name: 'Junior Handler (6-11)',
        type: 'junior_handler' as const,
        sortOrder: 1,
        minAgeMonths: 72,
        maxAgeMonths: 143,
        description:
          'For handlers aged 6-11 years on the day of the show. Judged on handling skill, not the dog.',
      },
      {
        name: 'Junior Handler (12-16)',
        type: 'junior_handler' as const,
        sortOrder: 2,
        minAgeMonths: 144,
        maxAgeMonths: 203,
        description:
          'For handlers aged 12-16 years on the day of the show. Judged on handling skill, not the dog.',
      },
      {
        name: 'Junior Handler (17-24)',
        type: 'junior_handler' as const,
        sortOrder: 3,
        minAgeMonths: 204,
        maxAgeMonths: 299,
        description:
          'For handlers aged 17-24 years on the day of the show. Judged on handling skill, not the dog.',
      },
    ])
    .onConflictDoNothing()
    .returning();

  if (result.length > 0) {
    console.log(`Added ${result.length} Junior Handler class definitions:`);
    for (const cd of result) {
      console.log(`  - ${cd.name} (${cd.id})`);
    }
  } else {
    console.log('Junior Handler class definitions already exist, nothing to do.');
  }

  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
