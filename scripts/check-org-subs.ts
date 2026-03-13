import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  const orgs = await db.execute(sql`SELECT id, name, subscription_status, plan_id FROM organisations`);
  console.log(JSON.stringify(orgs, null, 2));
  process.exit(0);
}
main().catch(console.error);
