import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { backlog } from '../src/server/db/schema/backlog';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: npx tsx scripts/update-backlog.ts <feature-number> <status> [response]');
    console.log('Statuses: awaiting_feedback, planned, in_progress, completed, dismissed');
    process.exit(1);
  }

  const featureNumber = parseInt(args[0], 10);
  const status = args[1] as 'awaiting_feedback' | 'planned' | 'in_progress' | 'completed' | 'dismissed';
  const response = args.slice(2).join(' ') || undefined;

  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  const values: Record<string, unknown> = { status };
  if (response) values.latestResponse = response;

  const [updated] = await db
    .update(backlog)
    .set(values)
    .where(eq(backlog.featureNumber, featureNumber))
    .returning({ id: backlog.id, title: backlog.title });

  if (updated) {
    console.log(`Updated #${featureNumber} (${updated.title}) → ${status}`);
    if (response) console.log(`Response saved: ${response.slice(0, 200)}`);
  } else {
    console.log(`Feature #${featureNumber} not found in backlog.`);
  }

  await client.end();
}

main();
