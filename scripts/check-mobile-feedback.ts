import 'dotenv/config';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';

async function main() {
  if (db === null) return;
  const fb = await db.query.feedback.findFirst({
    where: eq(schema.feedback.id, 'ed7802f7-ae71-4b32-83eb-d105acdcba97'),
  });
  if (fb === undefined) { console.log('not found'); return; }
  const html = fb.htmlBody ?? '';
  const imgCount = (html.match(/<img/g) || []).length;
  console.log('Has HTML:', html.length > 0);
  console.log('Inline images:', imgCount);
  if (imgCount > 0) {
    const srcs = [...html.matchAll(/src="([^"]{0,100})/g)].map(m => m[1]);
    console.log('Image srcs:', srcs);
  }
  console.log('Text body:', fb.textBody?.substring(0, 800));
}
main();
