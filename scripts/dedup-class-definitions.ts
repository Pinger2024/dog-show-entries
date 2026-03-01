import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
  console.log('🔍 Finding duplicate class definitions...\n');

  // Find all names with more than one row
  const dupes = await db.execute<{
    name: string;
    cnt: number;
    ids: string[];
  }>(sql`
    SELECT name, COUNT(*)::int as cnt, array_agg(id ORDER BY created_at) as ids
    FROM class_definitions
    GROUP BY name
    HAVING COUNT(*) > 1
    ORDER BY name
  `);

  if (dupes.length === 0) {
    console.log('✅ No duplicates found!');
    await client.end();
    return;
  }

  console.log(`Found ${dupes.length} duplicated class names:\n`);

  for (const row of dupes) {
    const ids = row.ids;
    const keepId = ids[0]; // Keep the oldest (first created)
    const removeIds = ids.slice(1);

    console.log(`  "${row.name}" — ${ids.length} copies`);
    console.log(`    Keep:   ${keepId}`);
    console.log(`    Remove: ${removeIds.join(', ')}`);

    // Check references for each ID
    for (const id of ids) {
      const refs = await db.execute<{ cnt: number }>(sql`
        SELECT COUNT(*)::int as cnt FROM show_classes WHERE class_definition_id = ${id}
      `);
      console.log(`    ${id} → ${refs[0].cnt} show_classes refs`);
    }

    // Migrate show_classes references from duplicates to the canonical ID
    for (const removeId of removeIds) {
      const updated = await db.execute(sql`
        UPDATE show_classes
        SET class_definition_id = ${keepId}
        WHERE class_definition_id = ${removeId}
      `);
      console.log(`    Migrated show_classes from ${removeId} → ${keepId}`);
    }

    // Delete the duplicate rows
    for (const removeId of removeIds) {
      await db.execute(sql`
        DELETE FROM class_definitions WHERE id = ${removeId}
      `);
      console.log(`    Deleted duplicate ${removeId}`);
    }

    console.log('');
  }

  // Verify no more duplicates
  const remaining = await db.execute<{ name: string; cnt: number }>(sql`
    SELECT name, COUNT(*)::int as cnt
    FROM class_definitions
    GROUP BY name
    HAVING COUNT(*) > 1
  `);

  if (remaining.length === 0) {
    console.log('✅ All duplicates resolved!');
  } else {
    console.error('❌ Still have duplicates:', remaining);
  }

  // Show final count
  const total = await db.execute<{ cnt: number }>(sql`
    SELECT COUNT(*)::int as cnt FROM class_definitions
  `);
  console.log(`\nTotal class definitions: ${total[0].cnt}`);

  await client.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
