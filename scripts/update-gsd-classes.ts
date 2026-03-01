/**
 * One-off script to rename Long Coat GSD classes to "Special Long Coat" and
 * add two new class definitions (Special Long Coat Junior, Special Long Coat Yearling).
 * Run with: npx tsx scripts/update-gsd-classes.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/server/db/schema/index.js';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function main() {
  console.log('Updating GSD Long Coat class definitions...\n');

  // ── Rename existing classes ──────────────────────────────
  const allDefs = await db.query.classDefinitions.findMany();
  const defMap = Object.fromEntries(allDefs.map((d) => [d.name, d]));

  // Rename "Long Coat Open" → "Special Long Coat Open"
  if (defMap['Long Coat Open']) {
    await db
      .update(schema.classDefinitions)
      .set({ name: 'Special Long Coat Open', sortOrder: 9 })
      .where(eq(schema.classDefinitions.id, defMap['Long Coat Open'].id));
    console.log('  ✓ Renamed "Long Coat Open" → "Special Long Coat Open"');
  } else if (defMap['Special Long Coat Open']) {
    console.log('  ⏭ "Special Long Coat Open" already exists');
  }

  // Rename "Long Coat Puppy" → "Special Long Coat Puppy"
  if (defMap['Long Coat Puppy']) {
    await db
      .update(schema.classDefinitions)
      .set({ name: 'Special Long Coat Puppy', sortOrder: 6 })
      .where(eq(schema.classDefinitions.id, defMap['Long Coat Puppy'].id));
    console.log('  ✓ Renamed "Long Coat Puppy" → "Special Long Coat Puppy"');
  } else if (defMap['Special Long Coat Puppy']) {
    console.log('  ⏭ "Special Long Coat Puppy" already exists');
  }

  // ── Add new class definitions ────────────────────────────
  const newDefs = await db
    .insert(schema.classDefinitions)
    .values([
      {
        name: 'Special Long Coat Junior',
        type: 'age' as const,
        sortOrder: 7,
        minAgeMonths: 6,
        maxAgeMonths: 18,
        description: 'For Long Coat dogs aged 6-18 months',
      },
      {
        name: 'Special Long Coat Yearling',
        type: 'age' as const,
        sortOrder: 8,
        minAgeMonths: 12,
        maxAgeMonths: 24,
        description: 'For Long Coat dogs aged 12-24 months',
      },
    ])
    .onConflictDoNothing()
    .returning();

  if (newDefs.length > 0) {
    console.log(`\n  ✓ Added ${newDefs.length} new class definitions:`);
    for (const cd of newDefs) {
      console.log(`    - ${cd.name} (${cd.id})`);
    }
  } else {
    console.log('\n  ⏭ New class definitions already exist, nothing to add.');
  }

  console.log('\nDone.\n');
  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
