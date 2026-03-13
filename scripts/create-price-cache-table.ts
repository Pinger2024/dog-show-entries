/**
 * Create the print_price_cache table directly via SQL.
 * Used when drizzle-kit push gets stuck on interactive prompts.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const dbUrl = process.env.DATABASE_URL || '';
console.log('Connecting to:', dbUrl.replace(/:[^:@]*@/, ':***@'));
const client = postgres(dbUrl, { max: 1, idle_timeout: 10, connect_timeout: 15, ssl: true });
const db = drizzle(client);

async function main() {
  // Check if table exists
  const [check] = await db.execute(
    sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'print_price_cache')`
  );

  if (check?.exists) {
    console.log('print_price_cache table already exists');
    await client.end();
    return;
  }

  console.log('Creating print_price_cache table...');

  await db.execute(sql`
    CREATE TABLE print_price_cache (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      tradeprint_product_name TEXT NOT NULL,
      service_level TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      total_price_pence INTEGER NOT NULL,
      specs JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX print_price_cache_product_idx
    ON print_price_cache (tradeprint_product_name, service_level)
  `);

  await db.execute(sql`
    CREATE INDEX print_price_cache_lookup_idx
    ON print_price_cache (tradeprint_product_name, service_level, quantity)
  `);

  console.log('print_price_cache table created with indexes');
  await client.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
