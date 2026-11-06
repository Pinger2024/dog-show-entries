import { isSpecialAwardClass } from './class-labels';

/**
 * Per-class judge resolution — shared by the Judge's Book and Prize Cards
 * PDFs (moved out of the judges-book route 2026-07-30 so Prize Cards could
 * import it without importing a route file; judges-book/[showId]/route.ts
 * re-exports these names so its existing imports/tests keep working
 * unchanged).
 */

/** Minimal shape of a judge-assignment row {@link resolveJudgeForClass} reads —
 *  a subset of what `db.query.judgeAssignments.findMany` returns. */
export type JudgeAssignmentInput = {
  judge?: { id?: string | null; name?: string | null } | null;
  breedId?: string | null;
  sex?: string | null;
  ring?: { number?: number | null } | null;
  isSpecialAwardsClassesJudge?: boolean | null;
};

/** Minimal shape of a show-class row {@link resolveJudgeForClass}'s returned
 *  resolver reads — a subset of what `db.query.showClasses.findMany` returns. */
export type JudgeForClassInput = {
  id: string;
  classNumber: number | null;
  breedId?: string | null;
  sex?: string | null;
  classDefinition?: { type?: string | null; name?: string | null } | null;
};

export type JudgeRef = { id: string; name: string; ring: number | null };

/**
 * Map judges to classes by WHAT THEY JUDGE, not just breed. A single-breed
 * show has breed_id = null on its classes, so a flat breed→judge map collided
 * the Junior Handling judge (no breed, no sex) with the breed judge — Andrew
 * (JH) was showing on the breed/dog classes instead of Helen (Mandy
 * 2026-06-19). Resolution order per class: JH → SAC → exact (breed,sex) pair
 * → breed → sex → fallback.
 *
 * SAC classes (Special Award Class — Junior / PG / Open) have a dedicated
 * judge flagged on the assignment with isSpecialAwardsClassesJudge. Their
 * show_classes carry the breed_id of a single-breed show, so a flat
 * breed→judge map collides them with the breed judge — the SAC judge was
 * printing as the breed judge instead (Mandy, South Western 9 Aug 2026).
 * Captured separately and checked before the breed fallback, same pattern as
 * prize-cards/route.ts and pdf-generation.ts.
 *
 * EXACT (breed, sex) PAIR TIER (Michael, 2026-07-30): an assignment with
 * BOTH breedId AND sex set identifies one precise judge for that breed×sex
 * combination — e.g. a dog judge and a distinct bitch judge on the same
 * breed. Without this tier, both-set assignments only populated the flat
 * judgeByBreed map, so a same-breed dog assignment and bitch assignment
 * overwrote each other there ("last write wins") and every class on a
 * single-breed show (which all carry that breed_id) silently resolved to
 * whichever assignment was processed last, regardless of its own sex.
 * Caught by an independent artefact check (pdftotext against a real
 * rendered prize-cards PDF) — South Western has this exact both-set shape
 * today but it happened to mask the bug because both rows share one judge
 * (Hugh De Zutter). Both-set assignments ALSO still populate
 * judgeByBreed/judgeBySex below (unchanged fallback coverage for any class
 * that matches only one dimension), so this tier is additive — it never
 * changes the result for a breed-only or sex-only assignment shape.
 *
 * Pure + exported so this per-class resolution is directly testable without
 * rendering the PDF or hitting the DB.
 */
export function resolveJudgeForClass(
  judgeAssignments: JudgeAssignmentInput[],
): (sc: JudgeForClassInput) => JudgeRef | null {
  let jhJudge: JudgeRef | null = null;
  let sacJudge: JudgeRef | null = null;
  const judgeBySex = new Map<string, JudgeRef>();
  const judgeByBreed = new Map<string, JudgeRef>();
  const judgeByBreedAndSex = new Map<string, JudgeRef>();
  let breedFallback: JudgeRef | null = null;
  for (const ja of judgeAssignments) {
    if (!ja.judge?.id || !ja.judge?.name) continue;
    const ref: JudgeRef = { id: ja.judge.id, name: ja.judge.name, ring: ja.ring?.number ?? null };
    if (ja.isSpecialAwardsClassesJudge) {
      sacJudge = ref; // SAC judges sign the SAC block only
      continue;
    }
    if (!ja.breedId && !ja.sex) {
      jhJudge = ref; // no breed AND no sex = the Junior Handling judge
      continue;
    }
    if (ja.breedId && ja.sex) judgeByBreedAndSex.set(`${ja.breedId}|${ja.sex}`, ref);
    if (ja.breedId) judgeByBreed.set(ja.breedId, ref);
    if (ja.sex) judgeBySex.set(ja.sex, ref);
    breedFallback ??= ref;
  }
  return (sc: JudgeForClassInput): JudgeRef | null => {
    if (sc.classDefinition?.type === 'junior_handler') return jhJudge;
    if (isSpecialAwardClass(sc)) return sacJudge;
    if (sc.breedId && sc.sex) {
      const exact = judgeByBreedAndSex.get(`${sc.breedId}|${sc.sex}`);
      if (exact) return exact;
    }
    if (sc.breedId && judgeByBreed.has(sc.breedId)) return judgeByBreed.get(sc.breedId)!;
    if (sc.sex && judgeBySex.has(sc.sex)) return judgeBySex.get(sc.sex)!;
    return (sc.breedId ? judgeByBreed.get(sc.breedId) ?? null : null) ?? breedFallback;
  };
}
