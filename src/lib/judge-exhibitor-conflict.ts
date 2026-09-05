/**
 * Judge-vs-exhibitor conflict rule.
 *
 * RKC rule (confirmed by Amanda, 2026-06-01): a judge may not exhibit dogs in
 * the classes they judge. BUT a Junior Handling judge assesses the HANDLER, not
 * the dog — so a JH-only judge MAY exhibit dogs in breed classes at the same
 * show. The entry/checkout block must therefore fire only when the name-matched
 * judge has at least one assignment that is NOT pure Junior Handling
 * (i.e. a breed, group, or Special Awards Classes assignment).
 *
 * "Pure Junior Handling" assignment shape mirrors `isJhShape` in
 * judge-section.tsx: no breed, no sex, no group, no judge role, and not the
 * Special Awards Classes judge. (judge-section can omit the role/group checks
 * because it skips group assignments earlier; this helper sees every row, so it
 * checks them explicitly.)
 */
export type JudgeConflictAssignment = {
  breedId: string | null;
  sex: string | null;
  judgeRoleId: string | null;
  breedGroupId: string | null;
  isSpecialAwardsClassesJudge: boolean;
  judge: { name: string | null } | null;
};

/** True when an assignment is a Junior-Handling-only assignment (no conflict). */
export function isJuniorHandlingOnlyAssignment(a: JudgeConflictAssignment): boolean {
  return (
    !a.isSpecialAwardsClassesJudge &&
    a.breedId === null &&
    a.sex === null &&
    a.judgeRoleId === null &&
    a.breedGroupId === null
  );
}

/**
 * True if `exhibitorName` matches an assigned judge who judges something other
 * than Junior Handling — a genuine exhibit-while-judging conflict. Returns
 * false for Junior-Handling-only judges (they're allowed to enter) and when the
 * name is empty.
 */
export function hasJudgingConflict(
  assignments: JudgeConflictAssignment[],
  exhibitorName: string | null | undefined,
): boolean {
  const name = exhibitorName?.toLowerCase().trim();
  if (!name) return false;
  return assignments.some(
    (a) =>
      a.judge?.name?.toLowerCase().trim() === name &&
      !isJuniorHandlingOnlyAssignment(a),
  );
}
