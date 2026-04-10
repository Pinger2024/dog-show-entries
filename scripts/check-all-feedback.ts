import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { desc, gte } from 'drizzle-orm';
import { feedback } from '../src/server/db/schema/feedback';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const items = await db.select({
    id: feedback.id,
    subject: feedback.subject,
    fromEmail: feedback.fromEmail,
    status: feedback.status,
    source: feedback.source,
    createdAt: feedback.createdAt,
  })
    .from(feedback)
    .where(gte(feedback.createdAt, since))
    .orderBy(desc(feedback.createdAt));

  console.log(`Found ${items.length} feedback items in last 24h:\n`);
  for (const item of items) {
    console.log(`[${item.status}] ${item.source} | ${item.createdAt.toISOString()} | ${item.fromEmail}`);
    console.log(`  ${item.subject}`);
    console.log(`  ID: ${item.id}\n`);
  }

  await client.end();
}

main();
