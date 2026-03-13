import 'dotenv/config';
import { db } from '../src/server/db';
import { feedback } from '../src/server/db/schema';
import { desc, like } from 'drizzle-orm';

async function main() {
  const items = await db.select({
    id: feedback.id,
    resendEmailId: feedback.resendEmailId,
    subject: feedback.subject,
  }).from(feedback).where(like(feedback.subject, '%numbers%')).orderBy(desc(feedback.createdAt));
  
  for (const item of items) {
    console.log(`${item.resendEmailId} — ${item.subject} (${item.id})`);
  }
}
main().then(() => process.exit(0));
