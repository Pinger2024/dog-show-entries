import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { feedback } from '../src/server/db/schema/feedback';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  const ids = process.argv.slice(2);
  for (const id of ids) {
    await db
      .update(feedback)
      .set({ status: 'completed', notes: 'Fixed and deployed' })
      .where(eq(feedback.id, id));
    console.log(`Marked ${id} as completed`);
  }

  await client.end();
}

main();
