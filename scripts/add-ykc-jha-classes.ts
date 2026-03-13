/**
 * Add YKC and JHA handling class definitions to production database.
 * Safe to re-run — uses ON CONFLICT DO NOTHING on the name column.
 * Run with: npx tsx scripts/add-ykc-jha-classes.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function main() {
  console.log('Adding YKC & JHA handling class definitions...\n');

  const result = await db
    .insert(schema.classDefinitions)
    .values([
      // YKC Handling (official RKC route — 3 age groups, Crufts qualifier)
      {
        name: 'YKC Handling (6-11)',
        type: 'junior_handler' as const,
        sortOrder: 10,
        minAgeMonths: 72,
        maxAgeMonths: 144,
        description: 'Young Kennel Club handling. YKC membership required. Crufts qualifier.',
      },
      {
        name: 'YKC Handling (12-17)',
        type: 'junior_handler' as const,
        sortOrder: 11,
        minAgeMonths: 144,
        maxAgeMonths: 216,
        description: 'Young Kennel Club handling. YKC membership required. Crufts qualifier.',
      },
      {
        name: 'YKC Handling (18-24)',
        type: 'junior_handler' as const,
        sortOrder: 12,
        minAgeMonths: 216,
        maxAgeMonths: 300,
        description: 'Young Kennel Club handling. YKC membership required. Crufts qualifier.',
      },
      // JHA Handling (independent organisation — 2 age groups)
      {
        name: 'JHA Handling (6-11)',
        type: 'junior_handler' as const,
        sortOrder: 20,
        minAgeMonths: 72,
        maxAgeMonths: 144,
        description: 'Junior Handling Association. JHA membership required.',
      },
      {
        name: 'JHA Handling (12-16)',
        type: 'junior_handler' as const,
        sortOrder: 21,
        minAgeMonths: 144,
        maxAgeMonths: 204,
        description: 'Junior Handling Association. JHA membership required.',
      },
    ])
    .onConflictDoNothing()
    .returning();

  if (result.length > 0) {
    console.log(`Added ${result.length} handling class definitions:`);
    for (const cd of result) {
      console.log(`  - ${cd.name} (${cd.id})`);
    }
  } else {
    console.log('All handling class definitions already exist, nothing to do.');
  }

  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
