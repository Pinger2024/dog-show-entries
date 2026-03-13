import 'dotenv/config';
import { db } from '../src/server/db';
import { feedback } from '../src/server/db/schema';
import { desc } from 'drizzle-orm';

async function main() {
  const items = await db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(5);
  for (const item of items) {
    console.log(`--- ${item.subject} ---`);
    console.log(`ID: ${item.id}`);
    console.log(`Email ID: ${(item as any).emailId || 'N/A'}`);
    console.log(`Keys:`, Object.keys(item));
    console.log();
  }
}
main().then(() => process.exit(0));
