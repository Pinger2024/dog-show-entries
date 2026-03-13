import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL as string);
const db = drizzle(client);

async function main() {
  const id = process.argv[2];
  if (!id) { console.log('Usage: npx tsx scripts/check-backlog-detail.ts <feature_number>'); process.exit(1); }
  const rows = await db.execute(
    sql`SELECT feature_number, title, status, description, questions, latest_response, created_at, updated_at FROM backlog WHERE feature_number = ${Number(id)}`
  );
  for (const r of rows) {
    console.log('Created:', r.created_at);
    console.log('Updated:', r.updated_at);
    console.log('Title:', r.title);
    console.log('Status:', r.status);
    console.log('\n--- DESCRIPTION ---');
    console.log(r.description);
    console.log('\n--- QUESTIONS ---');
    console.log(r.questions);
    console.log('\n--- RESPONSE ---');
    console.log(r.latest_response);
  }
  await client.end();
}

main();
