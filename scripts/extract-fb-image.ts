import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { feedback } from '../src/server/db/schema/feedback';
import * as fs from 'fs';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  const items = await db.select().from(feedback).where(eq(feedback.id, 'acbb329e-4881-4aa6-90dc-4df41e3f0940'));
  const fb = items[0];
  if (!fb || !fb.htmlBody) { console.log('Not found'); await client.end(); return; }

  // Extract base64 image
  const match = fb.htmlBody.match(/src="data:image\/png;base64,([^"]+)"/);
  if (match) {
    const buf = Buffer.from(match[1], 'base64');
    fs.writeFileSync('/tmp/feedback-screenshot.png', buf);
    console.log('Saved to /tmp/feedback-screenshot.png', buf.length, 'bytes');
  } else {
    console.log('No image found');
  }
  await client.end();
}

main();
