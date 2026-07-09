import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { shows, judgeAssignments } from '@/server/db/schema';
import { awardFilter } from '@/lib/top-awards';
import type { AchievementType } from '@/lib/placements';

/**
 * Derive the judge who awarded a top award (CC, Best Dog/Bitch, BOB, …) at a
 * SINGLE-BREED show, from the show's breed-level judge assignments — so the
 * award credits the right judge toward the Champion "3 CCs under 3 DIFFERENT
 * judges" rule (Mandy 2026-07-09). The recording UIs don't know the judge, but
 * it's deterministic from `judge_assignments` for single-breed shows.
 *
 * A sex-specific award (Best Bitch / Bitch CC / …) resolves to the judge covering
 * that sex — or the both-sexes breed judge (one person judging dogs AND bitches,
 * as at BAGSD). A non-sex award (Best of Breed / Best in Show) resolves to the
 * breed judge. We return a judgeId only when it's UNAMBIGUOUS (exactly one
 * candidate judge); otherwise null (e.g. separate dog/bitch judges make BOB
 * ambiguous, or no judge is assigned yet). Panel judges (judgeRoleId set) are
 * excluded. Only single-breed shows derive — multi-breed per-breed attribution
 * is future work.
 */
export async function deriveTopAwardJudge(
  db: Database,
  showId: string,
  achievementType: AchievementType,
): Promise<string | null> {
  const show = await db.query.shows.findFirst({
    where: eq(shows.id, showId),
    columns: { breedId: true, showScope: true },
  });
  if (!show?.breedId || show.showScope !== 'single_breed') return null;

  const assignments = await db.query.judgeAssignments.findMany({
    where: and(
      eq(judgeAssignments.showId, showId),
      eq(judgeAssignments.breedId, show.breedId),
      isNull(judgeAssignments.judgeRoleId),
    ),
    columns: { judgeId: true, sex: true },
  });
  if (assignments.length === 0) return null;

  const sex = awardFilter(achievementType).sex; // 'dog' | 'bitch' | null
  // Sex-specific: the judge for that sex, or a both-sexes (sex null) judge.
  // Non-sex award: any breed-level judge (a both-sexes single-breed show has one).
  const relevant = sex
    ? assignments.filter((a) => a.sex === sex || a.sex == null)
    : assignments;
  const judgeIds = new Set(relevant.map((a) => a.judgeId));
  return judgeIds.size === 1 ? [...judgeIds][0]! : null;
}
