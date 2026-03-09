import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, asc } from 'drizzle-orm';
import { backlog } from '../src/server/db/schema/backlog';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  const statusFilter = process.argv[2] as
    | 'awaiting_feedback'
    | 'planned'
    | 'in_progress'
    | 'completed'
    | 'dismissed'
    | undefined;

  const where = statusFilter ? eq(backlog.status, statusFilter) : undefined;

  const items = await db
    .select({
      id: backlog.id,
      featureNumber: backlog.featureNumber,
      title: backlog.title,
      status: backlog.status,
      priority: backlog.priority,
      questions: backlog.questions,
      latestResponse: backlog.latestResponse,
      notes: backlog.notes,
    })
    .from(backlog)
    .where(where)
    .orderBy(asc(backlog.featureNumber));

  if (items.length === 0) {
    console.log(statusFilter ? `No ${statusFilter} backlog items.` : 'No backlog items.');
  } else {
    console.log(`${items.length} backlog items${statusFilter ? ` (${statusFilter})` : ''}:\n`);
    for (const item of items) {
      const priorityEmoji = item.priority === 'high' ? '🔥' : item.priority === 'medium' ? '🎯' : '📋';
      console.log(`${priorityEmoji} #${item.featureNumber} — ${item.title} [${item.status}]`);
      if (item.questions) console.log(`   Questions: ${item.questions.slice(0, 200)}...`);
      if (item.latestResponse) console.log(`   Response: ${item.latestResponse.slice(0, 200)}...`);
      if (item.notes) console.log(`   Notes: ${item.notes}`);
      console.log(`   ID: ${item.id}\n`);
    }
  }

  await client.end();
}

main();
