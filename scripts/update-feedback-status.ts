import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/server/db/schema/index.js';

const client = postgres(process.env.DATABASE_URL as string);
const db = drizzle(client, { schema });

async function main() {
  const ids = [
    'fad2eaf0-40c9-48e7-894a-8604788db4a3', // PDF upload, duplicates, class ordering
    '97cee4cf-27e1-49a9-9c1b-2a179b5797cb', // KC reg, add another dog, sundry items
    'ba6bf16a-eaa6-44f6-a7ad-17127f6c0d7c', // Catalogue formats, financial reports, My Shows
  ];

  for (const id of ids) {
    await db
      .update(schema.feedback)
      .set({
        status: 'completed',
        notes: 'Fixed in commit 7f46faa: PDF upload proxy, steward visibility, duplicate classes dedup + unique constraint, KC reg optional label, My Shows redirect. Feature requests (catalogue formats, financial reports, sundry items, class reordering, add another dog flow) noted for future.',
      })
      .where(eq(schema.feedback.id, id));
    console.log(`Updated ${id} → completed`);
  }

  await client.end();
}

main();
