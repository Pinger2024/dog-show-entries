import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema/index.js';
import { desc } from 'drizzle-orm';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client, { schema });

  const items = await db
    .select()
    .from(schema.feedback)
    .orderBy(desc(schema.feedback.createdAt));

  for (const f of items) {
    console.log(
      `[${f.status.toUpperCase()}] ${f.createdAt.toISOString().split('T')[0]} — ${f.subject ?? '(no subject)'}`
    );
    console.log(`  From: ${f.fromName || f.fromEmail}`);
    console.log(`  ID: ${f.id}`);
    if (f.textBody) {
      console.log(`  Body: ${f.textBody.slice(0, 300).replace(/\n/g, ' ')}`);
    }
    console.log('');
  }

  if (items.length === 0) {
    console.log('No feedback items.');
  }

  await client.end();
}

main();
