/**
 * Re-sort the latest show's show_classes by their classDefinition's sortOrder.
 * This sets show_classes.sort_order = class_definitions.sort_order for every
 * class in the most recently created show, and re-assigns class numbers
 * ordered by: sex (dog first, bitch second, null last) then sortOrder.
 *
 * Run with: npx tsx scripts/fix-show-class-ordering.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, desc } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function main() {
  // Find the latest show (most recently created)
  const latestShow = await db.query.shows.findFirst({
    orderBy: [desc(schema.shows.createdAt)],
  });

  if (!latestShow) {
    console.log('No shows found.');
    await client.end();
    return;
  }

  console.log(`Latest show: "${latestShow.name}" (${latestShow.id})`);
  console.log(`Status: ${latestShow.status}, Created: ${latestShow.createdAt}\n`);

  // Fetch all show classes with their class definitions
  const showClasses = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, latestShow.id),
    with: { classDefinition: true },
  });

  console.log(`Found ${showClasses.length} show classes.\n`);

  // Update sort_order from class_definitions.sort_order
  let updated = 0;
  for (const sc of showClasses) {
    const defSort = sc.classDefinition?.sortOrder ?? 0;
    if (sc.sortOrder !== defSort) {
      await db
        .update(schema.showClasses)
        .set({ sortOrder: defSort, updatedAt: new Date() })
        .where(eq(schema.showClasses.id, sc.id));
      console.log(
        `  Updated "${sc.classDefinition?.name}" (${sc.sex ?? 'open'}): sortOrder ${sc.sortOrder} -> ${defSort}`
      );
      updated++;
    }
  }

  console.log(`\nUpdated ${updated} sort orders.\n`);

  // Now re-assign class numbers: ordered by sex (dog=1, bitch=2, null=3) then sortOrder
  const sexPriority: Record<string, number> = { dog: 1, bitch: 2 };

  // Re-fetch after sort order updates
  const refreshed = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, latestShow.id),
    with: { classDefinition: true },
  });

  const sorted = [...refreshed].sort((a, b) => {
    const aSex = sexPriority[a.sex ?? ''] ?? 3;
    const bSex = sexPriority[b.sex ?? ''] ?? 3;
    if (aSex !== bSex) return aSex - bSex;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  let renumbered = 0;
  for (let i = 0; i < sorted.length; i++) {
    const newNumber = i + 1;
    const sc = sorted[i];
    if (sc.classNumber !== newNumber) {
      await db
        .update(schema.showClasses)
        .set({ classNumber: newNumber, updatedAt: new Date() })
        .where(eq(schema.showClasses.id, sc.id));
      console.log(
        `  Renumbered "${sc.classDefinition?.name}" (${sc.sex ?? 'open'}): #${sc.classNumber} -> #${newNumber}`
      );
      renumbered++;
    }
  }

  console.log(`\nRenumbered ${renumbered} classes.`);
  console.log('\nFinal class order:');
  for (let i = 0; i < sorted.length; i++) {
    const sc = sorted[i];
    console.log(
      `  ${i + 1}. ${sc.classDefinition?.name} (${sc.sex ?? 'open'}) [sortOrder: ${sc.sortOrder}]`
    );
  }

  console.log('\nDone.');
  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
