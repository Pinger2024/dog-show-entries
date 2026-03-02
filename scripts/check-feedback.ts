import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { feedback } from '../src/server/db/schema/feedback';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  const items = await db.select({
    id: feedback.id,
    subject: feedback.subject,
    fromEmail: feedback.fromEmail,
    textBody: feedback.textBody,
    createdAt: feedback.createdAt,
  }).from(feedback).where(eq(feedback.status, 'pending'));

  if (items.length === 0) {
    console.log('No pending feedback.');
  } else {
    console.log(`${items.length} pending:\n`);
    for (const item of items) {
      console.log(`--- ${item.subject} (${item.createdAt}) ---`);
      console.log(item.textBody?.slice(0, 800) ?? '(no text body)');
      console.log(`ID: ${item.id}\n`);
    }
  }

  await client.end();
}

main();
