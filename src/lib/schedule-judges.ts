import type { ScheduleJudge } from '@/components/schedule/shared/types';

/** One judge's assignments, aggregated across all their rows for a show. */
export interface JudgeAggregate {
  name: string;
  breeds: Set<string>;
  sexes: Set<string>;
  /** Any assignment with no sex (a "both sexes" breed row sets this too). */
  hasNullSexAssignment: boolean;
  /** Has a no-breed AND no-sex assignment — the signature of a Junior Handling
   *  assignment (JH classes FK to neither breed nor sex). */
  hasJhAssignment: boolean;
  subjectToRkcApproval: boolean;
}

const approvalSuffix = (subjectToRkcApproval: boolean) =>
  subjectToRkcApproval ? ' (subject to RKC approval)' : '';

/** Minimal shape of a judge-assignment row that {@link aggregateJudgeAssignments}
 *  reads. The catalogue and schedule DB queries each return a wider row; this
 *  captures only the fields the aggregation needs. */
export interface JudgeAssignmentRow {
  judge?: { id?: string | null; name?: string | null } | null;
  breed?: { name?: string | null } | null;
  sex?: string | null;
  isSpecialAwardsClassesJudge?: boolean | null;
  subjectToRkcApproval?: boolean | null;
  judgeRoleId?: string | null;
}

/**
 * Aggregate raw judge-assignment rows into the per-judge map + Special Awards
 * list that {@link buildScheduleJudges} consumes. This is the INPUT half of the
 * judge pipeline; pairing it with buildScheduleJudges keeps the catalogue's two
 * render paths (HTTP route + print pipeline) — and the schedule — in lockstep
 * instead of each re-implementing the same loop (Michael 2026-06-19).
 */
export function aggregateJudgeAssignments(
  rows: Iterable<JudgeAssignmentRow>,
): {
  entries: Map<string, JudgeAggregate>;
  specialAwardsJudges: Array<{ name: string; subjectToRkcApproval: boolean }>;
} {
  const entries = new Map<string, JudgeAggregate>();
  const specialAwardsJudges: Array<{ name: string; subjectToRkcApproval: boolean }> = [];
  for (const ja of rows) {
    if (!ja.judge?.id || !ja.judge?.name) continue;
    const subjectToRkcApproval = ja.subjectToRkcApproval === true;
    if (ja.isSpecialAwardsClassesJudge) {
      specialAwardsJudges.push({ name: ja.judge.name, subjectToRkcApproval });
      continue;
    }
    if (ja.judgeRoleId) continue; // panel judges handled elsewhere
    const key = ja.judge.id;
    const isJhAssignment = !ja.breed?.name && !ja.sex;
    const existing = entries.get(key);
    if (existing) {
      if (ja.breed?.name) existing.breeds.add(ja.breed.name);
      if (ja.sex) existing.sexes.add(ja.sex);
      else existing.hasNullSexAssignment = true;
      if (isJhAssignment) existing.hasJhAssignment = true;
      if (subjectToRkcApproval) existing.subjectToRkcApproval = true;
    } else {
      entries.set(key, {
        name: ja.judge.name,
        breeds: new Set(ja.breed?.name ? [ja.breed.name] : []),
        sexes: new Set(ja.sex ? [ja.sex] : []),
        hasNullSexAssignment: !ja.sex,
        hasJhAssignment: isJhAssignment,
        subjectToRkcApproval,
      });
    }
  }
  return { entries, specialAwardsJudges };
}

/**
 * Resolve aggregated judge assignments into the schedule's `ScheduleJudge`
 * list, with the `role` string the schedule/catalogue components filter on to
 * route each judge to the right block (breed sections, Junior Handling,
 * Special Awards). Pure + testable — the DB aggregation stays in
 * generateSchedulePdf.
 *
 * The key subtlety (Mandy 2026-06-14): a judge who does the Junior Handling
 * AND breed classes gets a breed role (e.g. "Dogs & Bitches"), which would
 * hide them from the JH block — it filters on `role === 'Junior Handling'` and
 * would otherwise show "Judge: TBC". So such a judge is ALSO emitted as a
 * separate 'Junior Handling' entry, mirroring how Special Awards judges are
 * appended. The dedicated-JH case (a judge who does ONLY JH) is handled by the
 * `isJH` branch and is not double-counted.
 */
export function buildScheduleJudges(
  judgeEntries: Iterable<JudgeAggregate>,
  specialAwardsJudges: Array<{ name: string; subjectToRkcApproval: boolean }>,
  hasJuniorHandlerClasses: boolean,
): ScheduleJudge[] {
  const entries = [...judgeEntries];

  const judges: ScheduleJudge[] = entries.map((j) => {
    const breedArr = Array.from(j.breeds);
    const isJH =
      breedArr.length === 0 &&
      j.sexes.size === 0 &&
      j.hasNullSexAssignment &&
      hasJuniorHandlerClasses;
    const role = isJH
      ? 'Junior Handling'
      : j.sexes.has('dog') && j.sexes.has('bitch')
        ? 'Dogs & Bitches'
        : j.sexes.has('dog')
          ? 'Dogs'
          : j.sexes.has('bitch')
            ? 'Bitches'
            : null;
    const namePart = `${j.name}${approvalSuffix(j.subjectToRkcApproval)}`;
    return {
      name: j.name,
      breeds: breedArr,
      sex: j.sexes.size === 1 ? (Array.from(j.sexes)[0] as 'dog' | 'bitch') : null,
      // role MUST be set so the schedule can route this judge to the right
      // section — a Junior Handling judge belongs in the JH block, not the
      // breed-classification list (mirrors how SAC judges are handled).
      role: role ?? undefined,
      displayLabel: role ? `${role} — ${namePart}` : namePart,
    };
  });

  // Breed-role judges first, alphabetical by name; Junior-Handling-only
  // judges after, also alphabetical. Every consumer of this list (the
  // schedule route, the catalogue snapshot, the print pipeline) relies on
  // this ordering — without it, whichever judge's assignment row happened
  // to be inserted first could print as the "breed judge" on the SV cover
  // (Mandy 2026-09-04). SAC and "also does JH" entries are appended below
  // with their existing semantics unchanged.
  judges.sort((a, b) => {
    const aJh = a.role === 'Junior Handling';
    const bJh = b.role === 'Junior Handling';
    if (aJh !== bJh) return aJh ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  // Special Awards Classes judges — appended with the explicit role label so
  // the dedicated SAC block can find them even when they also judge breeds.
  for (const sac of specialAwardsJudges) {
    judges.push({
      name: sac.name,
      breeds: [],
      sex: null,
      role: 'Special Awards Classes',
      displayLabel: `Special Awards Classes — ${sac.name}${approvalSuffix(sac.subjectToRkcApproval)}`,
    });
  }

  // Junior Handling judges who ALSO judge breeds (got a breed role above) —
  // surface them as an additional JH entry so the JH block stops showing TBC.
  if (hasJuniorHandlerClasses) {
    const alreadyJh = new Set(
      judges.filter((j) => j.role === 'Junior Handling').map((j) => j.name),
    );
    for (const j of entries) {
      if (!j.hasJhAssignment || alreadyJh.has(j.name)) continue;
      judges.push({
        name: j.name,
        breeds: [],
        sex: null,
        role: 'Junior Handling',
        displayLabel: `Junior Handling — ${j.name}${approvalSuffix(j.subjectToRkcApproval)}`,
      });
    }
  }

  return judges;
}

const JH_ROLE_PREFIX = 'Junior Handling — ';
const SAC_ROLE_PREFIX = 'Special Awards Classes — ';
const BREED_ROLE_PREFIXES = ['Dogs & Bitches — ', 'Dogs — ', 'Bitches — '];

/**
 * Pick the breed judge(s) to print on the SV/WUSV catalogue cover from the
 * already-built `judgeDisplayList` labels (see {@link buildScheduleJudges}).
 * The cover used to print `coverJudges[0]` — whichever judge's assignment
 * row was inserted first — which surfaced the Junior Handling judge when
 * their row happened to come first (Mandy 2026-09-04, Midlands Region GSD
 * Group). This selects explicitly by role instead:
 *
 * - No breed judge found → `['Judge TBC']`.
 * - Exactly one → the judge's NAME only (role prefix stripped, any
 *   "(subject to RKC approval)" suffix kept).
 * - More than one → one label per line, keeping the role prefix so the
 *   reader can tell Dogs from Bitches.
 *
 * Pure and label-based (not shape-based) so it never needs a new field on
 * the catalogue snapshot — the snapshot hash is the identity of a stored
 * catalogue and a shape change would force already-printed catalogues to
 * re-render.
 */
export function pickSvCoverJudges(labels: readonly string[]): string[] {
  const breedLabels = labels.filter(
    (label) => !label.startsWith(JH_ROLE_PREFIX) && !label.startsWith(SAC_ROLE_PREFIX),
  );
  if (breedLabels.length === 0) return ['Judge TBC'];
  if (breedLabels.length === 1) {
    const label = breedLabels[0];
    const prefix = BREED_ROLE_PREFIXES.find((p) => label.startsWith(p));
    return [prefix ? label.slice(prefix.length) : label];
  }
  return breedLabels;
}
