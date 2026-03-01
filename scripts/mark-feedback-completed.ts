import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/server/db/schema/index.js';

const client = postgres(process.env.DATABASE_URL as string);
const db = drizzle(client, { schema });

async function main() {
  const id = process.argv[2];
  const status = process.argv[3] || 'completed';
  const notes = process.argv[4] || '';
  if (!id) { console.error('Usage: npx tsx scripts/mark-feedback-completed.ts <id> [status] [notes]'); process.exit(1); }
  await db.update(schema.feedback).set({ status, notes: notes || undefined }).where(eq(schema.feedback.id, id));
  console.log(`Updated ${id} → ${status}`);
  await client.end();
}

main();
