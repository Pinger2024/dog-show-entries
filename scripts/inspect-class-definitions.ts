/**
 * Dump all class definitions so we can see which ones have short
 * or missing descriptions.
 */
import 'dotenv/config';
import { db } from '@/server/db/index.js';
import * as s from '@/server/db/schema/index.js';
import { asc } from 'drizzle-orm';

async function main() {
  if (!db) throw new Error('no db');
  const defs = await db.query.classDefinitions.findMany({
    orderBy: [asc(s.classDefinitions.name)],
  });
  for (const d of defs) {
    console.log(`──── ${d.name} ────`);
    console.log(`  ${d.description ?? '(no description)'}`);
    console.log();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
