import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import { feedback } from '../src/server/db/schema/feedback';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  const action = process.argv[2];
  const ids = process.argv.slice(4);
  const notes = process.argv[3];

  if (action === 'complete') {
    await db.update(feedback)
      .set({ status: 'completed', notes, updatedAt: new Date() })
      .where(inArray(feedback.id, ids));
    console.log(`Marked ${ids.length} items as completed`);
  } else if (action === 'dismiss') {
    await db.update(feedback)
      .set({ status: 'dismissed', notes, updatedAt: new Date() })
      .where(inArray(feedback.id, ids));
    console.log(`Dismissed ${ids.length} items`);
  } else if (action === 'progress') {
    await db.update(feedback)
      .set({ status: 'in_progress', notes, updatedAt: new Date() })
      .where(inArray(feedback.id, ids));
    console.log(`Marked ${ids.length} items as in_progress`);
  }

  await client.end();
}

main();
