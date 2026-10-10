/**
 * ONE owner for "Limited show eligibility" (RKC 2026 rule): a dog that has
 * won a CC, or has 5+ Reserve CCs under DIFFERENT judges, may not enter a
 * Limited show.
 *
 * By the co-founder's ruling of 2026-07-09, a single-breed championship
 * Best Dog/Best Bitch (+ reserve) COUNTS as the CC (+ RCC) it is — see
 * `effectiveCcType` / `isCcShow` in `src/lib/effective-achievement-type.ts`.
 * An achievement's raw `type` must never be compared against a hardcoded CC
 * list on its own; it must go through `effectiveCcType` with the
 * achievement's own show's `showType`/`showScope` first.
 *
 * Every path that can let a dog into a Limited show MUST call
 * `getLimitedShowEligibility` and refuse the entry when `ineligible` is
 * true. Do not hand-roll the achievement query: a second copy of it is a
 * second rule, and the two will disagree (found 2026-09-18: `orders.checkout`
 * queried `achievements.type` against a hardcoded list with no
 * `effectiveCcType` mapping, so a dog whose only "CC" was a single-breed
 * championship Best Dog was warned on the enter page but not blocked at
 * checkout).
 *
 * Scope note: this only covers paths that can enter a dog into a Limited
 * show today (`dogs.checkLimitedShowEligibility` — the enter page's warning
 * — and `orders.checkout`). It is deliberately NOT wired into
 * `entries.create` or `secretary.createManualEntry` — those two paths'
 * entry-gate consolidation is owned by a separate in-flight branch; adding
 * this check to them here would risk colliding with that work.
 */
import { eq } from 'drizzle-orm';
import type { db as Database } from '@/server/db';
import { achievements } from '@/server/db/schema';
import { isCcType, isRccType } from '@/lib/placements';
import { effectiveCcType } from '@/lib/effective-achievement-type';

export interface LimitedShowEligibility {
  hasCC: boolean;
  ccCount: number;
  rccDistinctJudgeCount: number;
  rccTotal: number;
  ineligible: boolean;
  reason: string | null;
}

export async function getLimitedShowEligibility(
  database: typeof Database,
  dogId: string,
): Promise<LimitedShowEligibility> {
  // Count CCs / RCCs, treating a single-breed championship Best Dog/Bitch
  // (+ reserve) as the CC (+ RCC) it is (Mandy 2026-07-09). Fetch with show
  // type/scope so the mapping can apply.
  const limitedAchs = await database.query.achievements.findMany({
    where: eq(achievements.dogId, dogId),
    with: { show: { columns: { showType: true, showScope: true } } },
  });
  const limEffType = (a: (typeof limitedAchs)[number]) =>
    effectiveCcType(a.type, a.show?.showType, a.show?.showScope);
  const ccCount = limitedAchs.filter((a) => isCcType(limEffType(a))).length;

  // Count RCCs with distinct judges.
  const rccRows = limitedAchs.filter((a) => isRccType(limEffType(a)));
  // Count distinct judges (null judgeId counts as one)
  const distinctJudges = new Set(rccRows.map((r) => r.judgeId ?? 'unknown'));
  const rccDistinctJudgeCount = distinctJudges.size;

  return {
    hasCC: ccCount > 0,
    ccCount,
    rccDistinctJudgeCount,
    rccTotal: rccRows.length,
    ineligible: ccCount > 0 || rccDistinctJudgeCount >= 5,
    reason: ccCount > 0
      ? 'This dog has won a CC and is ineligible for Limited shows'
      : rccDistinctJudgeCount >= 5
        ? 'This dog has 5+ RCCs under different judges and is ineligible for Limited shows (2026 rule)'
        : null,
  };
}
