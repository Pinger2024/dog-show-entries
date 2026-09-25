/**
 * Backfill the awarding judge onto existing top-award achievements that have no
 * judge recorded, derived from each single-breed show's judge assignments — the
 * same logic recordAchievement now uses at write time. Needed so historical CCs
 * (e.g. BAGSD's Best Dog/Bitch) count toward the Champion "3 different judges"
 * rule. See src/server/services/derive-award-judge.ts.
 *
 * DRY RUN by default — prints what it WOULD set. Pass --apply to write.
 *   DATABASE_URL=... npx tsx scripts/backfill-award-judges.ts          # dry run
 *   DATABASE_URL=... npx tsx scripts/backfill-award-judges.ts --apply  # write
 */
import 'dotenv/config';
import { eq, isNull, inArray } from 'drizzle-orm';
import { db } from '../src/server/db';
import { achievements, judges } from '../src/server/db/schema';
import { deriveTopAwardJudge } from '../src/server/services/derive-award-judge';
import type { AchievementType } from '../src/lib/placements';

async function main() {
  const apply = process.argv.includes('--apply');

  const rows = await db.query.achievements.findMany({
    where: isNull(achievements.judgeId),
    with: {
      show: { columns: { name: true, showScope: true, breedId: true } },
      dog: { columns: { registeredName: true } },
    },
  });

  console.log(`${rows.length} achievement(s) with no judge recorded.\n`);

  const updates: { id: string; judgeId: string; label: string }[] = [];
  const skipped: string[] = [];

  for (const a of rows) {
    const label = `${a.dog?.registeredName ?? a.dogId} — ${a.type} @ ${a.show?.name ?? a.showId}`;
    const judgeId = await deriveTopAwardJudge(db, a.showId, a.type as AchievementType);
    if (judgeId) updates.push({ id: a.id, judgeId, label });
    else skipped.push(label);
  }

  // Resolve judge names for a readable report.
  const judgeIds = [...new Set(updates.map((u) => u.judgeId))];
  const judgeRows = judgeIds.length
    ? await db.select({ id: judges.id, name: judges.name }).from(judges).where(inArray(judges.id, judgeIds))
    : [];
  const judgeName = new Map(judgeRows.map((j) => [j.id, j.name]));

  console.log(`── Would set judge (${updates.length}) ──`);
  for (const u of updates) console.log(`  ✓ ${u.label}  →  ${judgeName.get(u.judgeId) ?? u.judgeId}`);
  console.log(`\n── Skipped: not single-breed / no assignment / ambiguous (${skipped.length}) ──`);
  for (const s of skipped) console.log(`  · ${s}`);

  if (!apply) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to update ${updates.length} row(s).`);
    return;
  }

  for (const u of updates) {
    await db.update(achievements).set({ judgeId: u.judgeId }).where(eq(achievements.id, u.id));
  }
  console.log(`\nAPPLIED — set judge on ${updates.length} achievement(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
