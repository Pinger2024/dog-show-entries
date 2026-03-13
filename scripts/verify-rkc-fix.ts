import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  // Check for any remaining "KC" (without "RKC") in checklist items
  const remaining = await db.execute(
    sql`SELECT id, title FROM show_checklist_items WHERE title LIKE '%KC%' AND title NOT LIKE '%RKC%' LIMIT 20`
  );
  console.log('Items still containing KC (not RKC):', remaining.length);
  for (const r of remaining) {
    console.log(`  - ${(r as any).title}`);
  }

  // Show all RKC items to confirm
  const rkc = await db.execute(
    sql`SELECT id, title FROM show_checklist_items WHERE title LIKE '%RKC%' LIMIT 20`
  );
  console.log('\nItems with RKC:', rkc.length);
  for (const r of rkc) {
    console.log(`  - ${(r as any).title}`);
  }

  process.exit(0);
}

main().catch(console.error);
