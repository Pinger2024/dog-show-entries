import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { feedback } from '../src/server/db/schema/feedback';

async function main() {
  const id = process.argv[2] || '32eaed95-329c-41ef-8148-024235ea7369';
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  const items = await db.select().from(feedback).where(eq(feedback.id, id));
  const fb = items[0];
  if (!fb) { console.log('Not found'); await client.end(); return; }

  console.log('Source:', fb.source);
  console.log('From:', fb.fromName, '<' + fb.fromEmail + '>');
  console.log('Subject:', fb.subject);
  console.log('ResendEmailId:', fb.resendEmailId);
  console.log('\nBody:\n', fb.body?.substring(0, 1000));
  console.log('\nHTML body:\n', fb.htmlBody?.substring(0, 2000));
  await client.end();
}

main();
