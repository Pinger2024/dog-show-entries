import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  // Add the three new 2026 Best Veteran award types
  // Postgres requires ADD VALUE IF NOT EXISTS to be idempotent
  await client`ALTER TYPE achievement_type ADD VALUE IF NOT EXISTS 'best_veteran_in_group'`;
  await client`ALTER TYPE achievement_type ADD VALUE IF NOT EXISTS 'best_veteran_in_show'`;
  await client`ALTER TYPE achievement_type ADD VALUE IF NOT EXISTS 'reserve_best_veteran_in_show'`;
  console.log('✓ Added best_veteran_in_group, best_veteran_in_show, reserve_best_veteran_in_show to achievement_type');
  await client.end();
}
main();
