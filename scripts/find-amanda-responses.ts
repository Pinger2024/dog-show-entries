import { db } from '../src/server/db';
import { feedback } from '../src/server/db/schema';
import { ilike, or, desc } from 'drizzle-orm';

async function main() {
  if (!db) { console.log('No DB'); process.exit(1); }
  const results = await db.select({
    id: feedback.id,
    subject: feedback.subject,
    textBody: feedback.textBody,
    status: feedback.status,
    createdAt: feedback.createdAt,
    fromEmail: feedback.fromEmail,
  }).from(feedback)
  .where(
    or(
      ilike(feedback.fromEmail, '%hundark%'),
      ilike(feedback.fromEmail, '%mandy%')
    )
  )
  .orderBy(desc(feedback.createdAt))
  .limit(30);
  
  for (const r of results) {
    const body = (r.textBody || '').substring(0, 1000);
    console.log(`\n=== [${r.status}] ${r.subject} ===`);
    console.log(`From: ${r.fromEmail} | ${r.createdAt}`);
    console.log(`ID: ${r.id}`);
    console.log(body);
  }
  process.exit(0);
}
main();
