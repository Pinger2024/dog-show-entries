/**
 * One-off script to set canonical KC sortOrder on existing classDefinitions.
 * Run with: npx tsx scripts/fix-class-sort-order.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

// Canonical KC class ordering — sortOrder is per-type
const sortOrders: Record<string, number> = {
  // Age classes: youngest first
  'Minor Puppy': 1,
  'Puppy': 2,
  'Junior': 3,
  'Yearling': 4,
  'Veteran': 5,
  'Special Long Coat Puppy': 6,
  'Special Long Coat Junior': 7,
  'Special Long Coat Yearling': 8,
  // Achievement classes: least restrictive → most open
  'Maiden': 1,
  'Novice': 2,
  'Undergraduate': 3,
  'Graduate': 4,
  'Post Graduate': 5,
  'Mid Limit': 6,
  'Limit': 7,
  'Open': 8,
  'Special Long Coat Open': 9,
  // Special
  'Good Citizen Dog Scheme': 1,
  'Special Beginners': 2,
  // Junior Handler
  'Junior Handler (6-11)': 1,
  'Junior Handler (12-16)': 2,
  'Junior Handler (17-24)': 3,
};

async function main() {
  console.log('Updating class definition sort orders...\n');

  const allDefs = await db.query.classDefinitions.findMany();

  let updated = 0;
  for (const def of allDefs) {
    const order = sortOrders[def.name];
    if (order !== undefined && def.sortOrder !== order) {
      await db
        .update(schema.classDefinitions)
        .set({ sortOrder: order })
        .where(eq(schema.classDefinitions.id, def.id));
      console.log(`  ✓ ${def.name}: sortOrder = ${order}`);
      updated++;
    } else if (order === undefined) {
      console.log(`  ⚠ ${def.name}: no canonical sort order defined, skipping`);
    }
  }

  console.log(`\nDone. Updated ${updated} class definitions.\n`);
  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
