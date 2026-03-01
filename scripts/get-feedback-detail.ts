import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/server/db/schema/index.js';

const client = postgres(process.env.DATABASE_URL as string);
const db = drizzle(client, { schema });

async function main() {
  const id = process.argv[2];
  if (!id) { console.error('Usage: npx tsx scripts/get-feedback-detail.ts <id>'); process.exit(1); }

  const item = await db.query.feedback.findFirst({
    where: eq(schema.feedback.id, id),
  });

  if (!item) { console.log('Not found'); await client.end(); return; }

  console.log(`Subject: ${item.subject}`);
  console.log(`From: ${item.fromName || item.fromEmail}`);
  console.log(`Status: ${item.status}`);
  console.log(`Date: ${item.createdAt.toISOString()}`);
  console.log(`\n--- Body ---\n`);
  console.log(item.textBody || item.htmlBody || '(no body)');

  await client.end();
}

main();
