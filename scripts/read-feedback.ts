import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { feedback } from '../src/server/db/schema/feedback';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  const [item] = await db.select({
    textBody: feedback.textBody,
  }).from(feedback).where(eq(feedback.id, process.argv[2]));

  console.log(item?.textBody ?? '(empty)');
  await client.end();
}

main();
