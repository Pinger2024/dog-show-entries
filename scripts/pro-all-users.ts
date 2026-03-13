import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  await db.execute(sql`
    UPDATE users
    SET pro_subscription_status = 'active',
        pro_current_period_end = NOW() + INTERVAL '1 year'
    WHERE pro_subscription_status != 'active'
       OR pro_current_period_end IS NULL
  `);

  const count = await db.execute(sql`SELECT COUNT(*) as total FROM users WHERE pro_subscription_status = 'active'`);
  console.log(`All users set to Pro. Total pro users: ${(count as unknown as Array<{total: string}>)[0]?.total}`);
  process.exit(0);
}

main().catch(console.error);
