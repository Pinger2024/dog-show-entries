import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { feedback } from '../src/server/db/schema/feedback';
import { eq } from 'drizzle-orm';

const id = process.argv[2];
if (!id) { console.error('Usage: read-feedback.ts <id-or-subject-fragment>'); process.exit(1); }

(async () => {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);
  const rows = await db.select().from(feedback).where(eq(feedback.id, id));
  if (!rows[0]) { console.log('not found'); await client.end(); return; }
  const r = rows[0];
  console.log('--- subject ---'); console.log(r.subject);
  console.log('--- from ---'); console.log(r.fromEmail);
  console.log('--- created ---'); console.log(r.createdAt.toISOString());
  console.log('--- status ---'); console.log(r.status);
  console.log('--- body ---');
  console.log(r.textBody ?? r.htmlBody ?? '(empty)');
  await client.end();
})();
