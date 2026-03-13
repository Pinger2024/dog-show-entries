import { db } from '../src/server/db';
import { feedback } from '../src/server/db/schema';
import { ilike, or, desc, sql } from 'drizzle-orm';

async function main() {
  if (!db) { console.log('No DB'); process.exit(1); }
  
  // Find the original questions email and all numbered responses
  const results = await db.select({
    id: feedback.id,
    subject: feedback.subject,
    textBody: feedback.textBody,
    htmlBody: feedback.htmlBody,
    status: feedback.status,
    createdAt: feedback.createdAt,
    fromEmail: feedback.fromEmail,
  }).from(feedback)
  .where(
    or(
      ilike(feedback.subject, '%input%12%'),
      ilike(feedback.subject, '%input%feature%'),
      ilike(feedback.subject, '%Need your input%'),
      ilike(feedback.subject, '%Got your answers%'),
      ilike(feedback.textBody, '%#15%'),
      ilike(feedback.textBody, '%#21%'),
      ilike(feedback.textBody, '%#2%steward%'),
      ilike(feedback.textBody, '%#3%'),
      ilike(feedback.textBody, '%#4%'),
      ilike(feedback.textBody, '%#5%'),
      ilike(feedback.textBody, '%#7%'),
      ilike(feedback.textBody, '%#8%'),
      ilike(feedback.textBody, '%#9%'),
      ilike(feedback.textBody, '%#10%'),
      ilike(feedback.textBody, '%#12%'),
      ilike(feedback.textBody, '%#13%'),
      ilike(feedback.textBody, '%#16%'),
      ilike(feedback.textBody, '%#17%'),
      ilike(feedback.textBody, '%#18%'),
      ilike(feedback.textBody, '%#19%'),
      ilike(feedback.textBody, '%#20%')
    )
  )
  .orderBy(desc(feedback.createdAt))
  .limit(20);
  
  for (const r of results) {
    const body = (r.textBody || '').substring(0, 2000);
    console.log(`\n========================================`);
    console.log(`[${r.status}] ${r.subject}`);
    console.log(`From: ${r.fromEmail} | ${r.createdAt}`);
    console.log(`ID: ${r.id}`);
    console.log(`----------------------------------------`);
    console.log(body);
  }
  process.exit(0);
}
main();
