/**
 * ONE owner for "is every judging requirement on this show covered by an
 * assigned judge?"
 *
 * Before this, `getJudgeCoverage` (drives the Judge Coverage dashboard) and
 * `getChecklistAutoDetect` (drives the `judges_assigned` checklist tick) each
 * answered this question with their own re-derivation, and they disagreed:
 * `getJudgeCoverage` puts Special-Award-Classes judges in their own lane
 * (`isSpecialAwardsClassesJudge`) and prefers exact breed+sex assignments
 * over breed=null/sex=null catch-alls; `getChecklistAutoDetect`'s comment
 * even said "Use the same coverage logic as getJudgeCoverage" while
 * re-implementing it with no SAC lane and with ANY breedId===null assignment
 * matching ANY breed. So a show whose only assignment was a
 * Special-Award-Classes-only judge (breed null, sex null) ticked "Judges
 * assigned" on the checklist while the coverage dashboard still showed the
 * breed classes uncovered.
 *
 * This function is the moved-verbatim body of the old `getJudgeCoverage` —
 * same queries, same lanes, same exact-over-catch-all matching preference —
 * plus `allCovered`. Every caller that needs to know "is this show's judging
 * fully covered" (the dashboard, the checklist, anything future) must go
 * through this. Do not hand-roll a second copy — see CLAUDE.md "One owner
 * per rule".
 */
import { eq } from 'drizzle-orm';
import type { db as Database } from '@/server/db';
import { shows, showClasses, judgeAssignments } from '@/server/db/schema';

export type JudgeCoverageItem = {
  breedId: string | null;
  breedName: string | null;
  label: string;
  sex: string | null;
  classCount: number;
  isSpecialAwards: boolean;
  covered: boolean;
  judges: { judgeId: string; judgeName: string; assignmentId: string }[];
  judgeName: string | null;
  judgeId: string | null;
};

export type JudgeCoverageResult = {
  coverage: JudgeCoverageItem[];
  coveredCount: number;
  totalCount: number;
  /**
   * True when every judging requirement on the show is covered — i.e. the
   * same condition the Judge Coverage dashboard uses to show its "all
   * covered" state (`judge-coverage-dashboard.tsx`: `coveredCount ===
   * totalCount`). We additionally require `totalCount > 0`: a show with no
   * classes yet has nothing to be "covered", and the old checklist
   * derivation already treated that as not-yet-covered
   * (`requiredCombos.size > 0` as its starting value) — so this preserves
   * that precondition rather than silently flipping a classless show's
   * checklist tick to true.
   */
  allCovered: boolean;
};

export async function computeJudgeCoverage(
  db: typeof Database,
  showId: string,
): Promise<JudgeCoverageResult> {
  // Get the show (for single-breed name) and all classes + assignments in parallel
  const [show, classes, assignmentRows] = await Promise.all([
    db.query.shows.findFirst({
      where: eq(shows.id, showId),
      columns: { showScope: true },
    }),
    db.query.showClasses.findMany({
      where: eq(showClasses.showId, showId),
      with: { breed: true, classDefinition: true },
    }),
    db.query.judgeAssignments.findMany({
      where: eq(judgeAssignments.showId, showId),
      with: { judge: true, breed: true },
    }),
  ]);
  const assignments = assignmentRows;

  // Build unique requirements from classes. Split by:
  //   1. breedId + sex (the original axes)
  //   2. AND whether the class is a Special Award Class — those need
  //      a separate "Special Awards Classes" judge per Amanda's spec
  //      2026-05-14, and must never be lumped with the breed's
  //      regular null-sex classes (e.g. Veteran).
  const requirementsMap = new Map<string, {
    breedId: string | null;
    breedName: string | null;
    label: string;
    sex: string | null;
    classCount: number;
    isSpecialAwards: boolean;
  }>();

  const isSpecialAwardClass = (sc: typeof classes[number]) =>
    sc.classDefinition?.name?.startsWith('Special Award Class') ?? false;

  for (const sc of classes) {
    const sac = isSpecialAwardClass(sc);
    const key = sac
      ? `sac:${sc.breedId ?? 'all'}`
      : `${sc.breedId ?? 'all'}:${sc.sex ?? 'both'}`;
    const existing = requirementsMap.get(key);
    if (existing) {
      existing.classCount++;
    } else {
      // For breed-less classes: use breed name, class name (JH), or scope-aware fallback
      const isJuniorHandling = sc.classDefinition?.type === 'junior_handler';
      const label = sac
        ? (sc.breed?.name ? `${sc.breed.name} — Special Awards Classes` : 'Special Awards Classes')
        : (sc.breed?.name
            ?? (isJuniorHandling ? 'Junior Handling'
              : show?.showScope === 'single_breed' ? 'Breed Classes' : 'All Breeds'));
      requirementsMap.set(key, {
        breedId: sc.breedId,
        breedName: sc.breed?.name ?? null,
        label,
        sex: sac ? null : sc.sex,
        classCount: 1,
        isSpecialAwards: sac,
      });
    }
  }

  // Check which requirements are covered by assignments
  const coverage: JudgeCoverageItem[] = Array.from(requirementsMap.values()).map((req) => {
    // SAC assignments and "regular breed-judge" assignments live in
    // different lanes — keep them apart so a SAC assignment doesn't
    // appear to cover Junior Handling and vice versa.
    const lanedAssignments = req.isSpecialAwards
      ? assignments.filter((a) => a.isSpecialAwardsClassesJudge)
      : assignments.filter((a) => !a.isSpecialAwardsClassesJudge);

    // Find ALL matching assignments. breed=null or sex=null on an
    // assignment is treated as a catch-all — "any breed" / "any sex".
    const matching = lanedAssignments.filter((a) => {
      const breedMatch = req.breedId
        ? a.breedId === req.breedId || a.breedId === null
        : a.breedId === null;
      const sexMatch = req.sex === null
        ? a.sex === null
        : (a.sex === null || a.sex === req.sex);
      return breedMatch && sexMatch;
    });

    // Prefer assignments that match BOTH breed and sex exactly over
    // catch-all matches. Without this, a null-breed null-sex assignment
    // (e.g. Junior Handling) wrongly claims coverage of a breed-
    // specific mixed-sex class like Veteran — they have the same
    // shape in the DB. Exact breed + exact sex wins; catch-alls
    // only appear when nothing more specific exists.
    const exact = matching.filter(
      (a) =>
        a.sex === req.sex &&
        (req.breedId ? a.breedId === req.breedId : a.breedId === null),
    );
    const best = exact.length > 0 ? exact : matching;

    // Deduplicate by judge
    const seen = new Set<string>();
    const judges: { judgeId: string; judgeName: string; assignmentId: string }[] = [];
    for (const a of best) {
      if (!seen.has(a.judgeId)) {
        seen.add(a.judgeId);
        judges.push({ judgeId: a.judgeId, judgeName: a.judge.name, assignmentId: a.id });
      }
    }

    return {
      breedId: req.breedId,
      breedName: req.breedName,
      label: req.label,
      sex: req.sex,
      classCount: req.classCount,
      isSpecialAwards: req.isSpecialAwards,
      covered: judges.length > 0,
      judges,
      // Keep flat fields for backwards compat
      judgeName: judges[0]?.judgeName ?? null,
      judgeId: judges[0]?.judgeId ?? null,
    };
  });

  const coveredCount = coverage.filter((c) => c.covered).length;
  const totalCount = coverage.length;

  return {
    coverage,
    coveredCount,
    totalCount,
    allCovered: totalCount > 0 && coveredCount === totalCount,
  };
}
