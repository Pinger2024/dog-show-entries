import { eq } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { shows, judgeAssignments } from '@/server/db/schema';
import { awardFilter } from '@/lib/top-awards';
import type { AchievementType } from '@/lib/placements';

/** Minimal show shape the derivation needs. */
export type ShowForJudgeDerivation = {
  breedId: string | null;
  showScope: string | null;
};

/** Minimal judge_assignments row shape the derivation needs. */
export type JudgeAssignmentForDerivation = {
  judgeId: string;
  sex: string | null;
  breedId: string | null;
  breedGroupId: string | null;
  judgeRoleId: string | null;
  isSpecialAwardsClassesJudge: boolean;
};

/**
 * Derive the judge who awarded a top award (CC, Best Dog/Bitch, BOB, …) at a
 * SINGLE-BREED show, from the show's breed-level judge assignments — so the
 * award credits the right judge toward the Champion "3 CCs under 3 DIFFERENT
 * judges" rule (Mandy 2026-07-09). The recording UIs don't know the judge, but
 * it's deterministic from `judge_assignments` for single-breed shows.
 *
 * Pure — plain data in, judgeId|null out — so it's testable without a
 * database. `deriveTopAwardJudge` below is the thin DB-fetching wrapper.
 *
 * A "breed-level" assignment here is one with no judgeRoleId (not a panel
 * judge), no breedGroupId (not a multi-breed group judge), and not the
 * Special Awards Classes judge — AND whose breedId is either the show's own
 * breed OR null. The null case matters: a single-breed show's OWN classes
 * don't carry a breedId per show_class (the breed is implicit at the SHOW
 * level — see add-judge-wizard.tsx's showBreedSexCombos, which builds each
 * combo's breedId from `sc.breed?.id ?? null`), so assigning that show's
 * breed judge via the Judge Wizard legitimately inserts breedId=NULL too
 * (confirmed against prod: GSD Club of Scotland 30 Aug 2026 — 3/3
 * assignments breed-null; Clyde Valley — 0/3 with breed set, same pattern).
 * Requiring an exact breedId match therefore missed the judge on EVERY
 * single-breed show whose classes don't tag a breed, not just Scotland.
 *
 * A sex-specific award (Best Bitch / Bitch CC / …) resolves to the judge
 * covering that sex — or a both-sexes judge (one person judging dogs AND
 * bitches, as at BAGSD). A non-sex award (Best of Breed / Best in Show)
 * resolves to any breed-level judge. Returns a judgeId only when it's
 * UNAMBIGUOUS (exactly one candidate judge); otherwise null (e.g. separate
 * dog/bitch judges make BOB ambiguous, or no judge is assigned yet). Only
 * single-breed shows derive — multi-breed per-breed attribution is future
 * work.
 */
export function deriveTopAwardJudgeFromAssignments(
  show: ShowForJudgeDerivation,
  assignments: JudgeAssignmentForDerivation[],
  achievementType: AchievementType,
): string | null {
  if (!show.breedId || show.showScope !== 'single_breed') return null;

  const breedLevel = assignments.filter(
    (a) =>
      (a.breedId === show.breedId || a.breedId === null) &&
      a.judgeRoleId == null &&
      a.breedGroupId == null &&
      !a.isSpecialAwardsClassesJudge,
  );
  if (breedLevel.length === 0) return null;

  const sex = awardFilter(achievementType).sex; // 'dog' | 'bitch' | null
  // Sex-specific: the judge for that sex, or a both-sexes (sex null) judge.
  // Non-sex award: any breed-level judge (a both-sexes single-breed show has one).
  const relevant = sex
    ? breedLevel.filter((a) => a.sex === sex || a.sex == null)
    : breedLevel;
  const judgeIds = new Set(relevant.map((a) => a.judgeId));
  return judgeIds.size === 1 ? [...judgeIds][0]! : null;
}

export async function deriveTopAwardJudge(
  db: Database,
  showId: string,
  achievementType: AchievementType,
): Promise<string | null> {
  const show = await db.query.shows.findFirst({
    where: eq(shows.id, showId),
    columns: { breedId: true, showScope: true },
  });
  if (!show) return null;

  const assignments = await db.query.judgeAssignments.findMany({
    where: eq(judgeAssignments.showId, showId),
    columns: {
      judgeId: true,
      sex: true,
      breedId: true,
      breedGroupId: true,
      judgeRoleId: true,
      isSpecialAwardsClassesJudge: true,
    },
  });

  return deriveTopAwardJudgeFromAssignments(show, assignments, achievementType);
}
