/**
 * Cleanup script — removes breeds from the DB that aren't in the Crufts 2025 list.
 * Only deletes breeds with no references (dogs, showClasses, judgeAssignments).
 * Run with: npx tsx scripts/cleanup-breeds.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';
import { breedsByGroup } from './seed-all-breeds';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

// Derive the valid breed set from the seed script (single source of truth)
const cruftsBreeds = new Set(Object.values(breedsByGroup).flat());

async function main() {
  console.log('Checking for breeds not in Crufts 2025 list...\n');

  const allBreeds = await db.query.breeds.findMany({
    with: { group: true },
  });

  const toCheck = allBreeds.filter((b) => !cruftsBreeds.has(b.name));

  if (toCheck.length === 0) {
    console.log('All breeds match the Crufts 2025 list. Nothing to clean up.');
    await client.end();
    return;
  }

  console.log(`Found ${toCheck.length} breed(s) not in Crufts 2025 list:\n`);
  for (const b of toCheck) {
    console.log(`  - ${b.name} (${b.group?.name ?? 'unknown group'})`);
  }
  console.log('');

  // Batch-check all references in 3 parallel queries instead of N+1
  const breedIds = toCheck.map((b) => b.id);

  const [referencedByDogs, referencedByClasses, referencedByAssignments] = await Promise.all([
    db.query.dogs.findMany({
      where: inArray(schema.dogs.breedId, breedIds),
      columns: { breedId: true },
    }),
    db.query.showClasses.findMany({
      where: inArray(schema.showClasses.breedId, breedIds),
      columns: { breedId: true },
    }),
    db.query.judgeAssignments.findMany({
      where: inArray(schema.judgeAssignments.breedId, breedIds),
      columns: { breedId: true },
    }),
  ]);

  const referencedIds = new Set([
    ...referencedByDogs.map((r) => r.breedId),
    ...referencedByClasses.map((r) => r.breedId),
    ...referencedByAssignments.map((r) => r.breedId),
  ]);

  const toDelete = toCheck.filter((b) => !referencedIds.has(b.id));
  const kept = toCheck.filter((b) => referencedIds.has(b.id));

  // Batch delete all unreferenced breeds
  if (toDelete.length > 0) {
    await db.delete(schema.breeds).where(
      inArray(schema.breeds.id, toDelete.map((b) => b.id))
    );
  }

  console.log('Results:');
  if (toDelete.length > 0) {
    console.log(`\n  ✓ Deleted ${toDelete.length} unreferenced breed(s):`);
    for (const b of toDelete) {
      console.log(`    - ${b.name}`);
    }
  }
  if (kept.length > 0) {
    console.log(`\n  ⚠ Kept ${kept.length} breed(s) (have references):`);
    for (const b of kept) {
      console.log(`    - ${b.name}`);
    }
  }

  console.log('');
  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
