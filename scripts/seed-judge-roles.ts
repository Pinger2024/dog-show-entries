/**
 * Seed the RKC-stock judge_roles taxonomy. Idempotent — re-running adds
 * any missing rows but won't duplicate. Safe to run against test or prod.
 *
 * The list is taken from the multi-breed RKC specimen schedules (Feb 2026
 * edition) and matches the sub-judge roles seen across Driffield, Manchester,
 * City of Birmingham, Leeds, National Dog Show, National Terrier, and LKA
 * 2025 schedules (per the 2026-05-07 benchmarking).
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { judgeRoles } from '../src/server/db/schema/judge-roles';

const STOCK_ROLES: Array<{
  name: string;
  shortLabel: string;
  sortOrder: number;
  isGroupLevel: boolean;
}> = [
  // Group-level (appear on per-group banner)
  { name: 'Group Judge', shortLabel: 'Group', sortOrder: 10, isGroupLevel: true },
  { name: 'Puppy Group Judge', shortLabel: 'Puppy Group', sortOrder: 20, isGroupLevel: true },
  { name: 'Veteran Group Judge', shortLabel: 'Veteran Group', sortOrder: 30, isGroupLevel: true },
  { name: 'Breeders Group Judge', shortLabel: 'Breeders Group', sortOrder: 40, isGroupLevel: true },
  { name: 'Special Beginners Group Judge', shortLabel: 'SB Group', sortOrder: 50, isGroupLevel: true },
  { name: 'Junior Group Judge', shortLabel: 'Junior Group', sortOrder: 60, isGroupLevel: true },
  // Show-level (appear only on the BIS & Group Judges panel page, not
  // duplicated under any specific group)
  { name: 'Best in Show Judge', shortLabel: 'BIS', sortOrder: 100, isGroupLevel: false },
  { name: 'Best Puppy in Show Judge', shortLabel: 'BPIS', sortOrder: 110, isGroupLevel: false },
  { name: 'Best Veteran in Show Judge', shortLabel: 'BVIS', sortOrder: 120, isGroupLevel: false },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const useSsl = !/localhost|127\.0\.0\.1/.test(url);
  const client = postgres(url, { prepare: false, ssl: useSsl });
  const db = drizzle(client);

  let added = 0;
  let skipped = 0;
  for (const role of STOCK_ROLES) {
    const [existing] = await db
      .select({ id: judgeRoles.id })
      .from(judgeRoles)
      .where(eq(judgeRoles.name, role.name))
      .limit(1);
    if (existing) {
      skipped++;
      continue;
    }
    await db.insert(judgeRoles).values({
      name: role.name,
      shortLabel: role.shortLabel,
      sortOrder: role.sortOrder,
      isCustom: false,
      isGroupLevel: role.isGroupLevel,
    });
    added++;
  }
  console.log(`Seeded RKC stock judge roles: +${added} added, ${skipped} already present`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
