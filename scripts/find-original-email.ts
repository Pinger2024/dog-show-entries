import { db } from '../src/server/db';
import { feedback } from '../src/server/db/schema';
import { ilike, desc } from 'drizzle-orm';

async function main() {
  if (!db) { console.log('No DB'); process.exit(1); }
  
  // Find the original "12 bigger feature items" email - it was sent FROM Remi, 
  // so it would appear as a quoted reply in Amanda/Michael's responses
  // Let's get the full HTML body of Michael's first reply which contains the full quoted email
  const results = await db.select({
    id: feedback.id,
    subject: feedback.subject,
    htmlBody: feedback.htmlBody,
    status: feedback.status,
    createdAt: feedback.createdAt,
    fromEmail: feedback.fromEmail,
  }).from(feedback)
  .where(ilike(feedback.subject, '%12 bigger feature%'))
  .orderBy(desc(feedback.createdAt))
  .limit(5);
  
  for (const r of results) {
    // Extract the quoted original email from the HTML body
    const html = r.htmlBody || '';
    console.log(`\n=== ${r.subject} ===`);
    console.log(`From: ${r.fromEmail} | ${r.createdAt}`);
    console.log(`ID: ${r.id}`);
    console.log(`HTML body length: ${html.length}`);
    // Extract text content from HTML (rough)
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    console.log(text.substring(0, 5000));
  }
  process.exit(0);
}
main();
