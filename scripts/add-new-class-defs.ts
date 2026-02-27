/**
 * One-off script to add Undergraduate, Mid Limit, and Good Citizen Dog Scheme
 * class definitions to the production database.
 * Run with: npx tsx scripts/add-new-class-defs.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function main() {
  console.log('Adding new class definitions...\n');

  const result = await db
    .insert(schema.classDefinitions)
    .values([
      {
        name: 'Undergraduate',
        type: 'achievement' as const,
        maxWins: 2,
        description:
          'For dogs which have not won a CC or 3 or more first prizes at Championship Shows in Undergraduate, Graduate, Post Graduate, Mid Limit, Limit, or Open.',
      },
      {
        name: 'Mid Limit',
        type: 'achievement' as const,
        maxWins: 4,
        description:
          'For dogs which have not won a CC or 3 or more first prizes in Mid Limit, Limit, or Open at Championship Shows.',
      },
      {
        name: 'Good Citizen Dog Scheme',
        type: 'special' as const,
        description:
          'For dogs that have passed any level of the Kennel Club Good Citizen Dog Scheme.',
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
