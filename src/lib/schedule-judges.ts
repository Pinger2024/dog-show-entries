import type { ScheduleJudge } from '@/components/schedule/shared/types';

/** One judge's assignments, aggregated across all their rows for a show. */
export interface JudgeAggregate {
  name: string;
  /** The judge's RKC kennel affix, printed after their name. */
  affix: string | null;
  breeds: Set<string>;
  /** Ids of the same breeds — to tell a Junior-Handling-only breed row from a
   *  breed-class one (see {@link JudgeRoleContext}). */
  breedIds: Set<string>;
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

/**
 * How a judge is named on every printed document: "Name (Affix)", then
 * " (subject to RKC approval)" while that is pending. ONE owner — the
 * catalogue once printed bare names while the schedule printed affixes
 * (Mandy, 3 Nov 2026: Sami Baggstrom's "Sensen Mann" missing).
 */
export function judgeDisplayName(judge: {
  name: string;
  affix?: string | null;
  subjectToRkcApproval?: boolean | null;
}): string {
  const base = judge.affix ? `${judge.name} (${judge.affix})` : judge.name;
  return `${base}${approvalSuffix(judge.subjectToRkcApproval === true)}`;
}

/** What a judge's role is judged against: the show's classes. */
export interface JudgeRoleContext {
  hasJuniorHandlerClasses: boolean;
  /** Breed ids that appear on Junior Handling classes. */
  juniorClassBreedIds?: ReadonlySet<string>;
  /** Breed ids that appear on breed (non-JH) classes. */
  breedClassBreedIds?: ReadonlySet<string>;
}

/** Minimal shape of a judge-assignment row that {@link aggregateJudgeAssignments}
 *  reads. The catalogue and schedule DB queries each return a wider row; this
 *  captures only the fields the aggregation needs. */
export interface JudgeAssignmentRow {
  judge?: { id?: string | null; name?: string | null; kennelClubAffix?: string | null } | null;
  breed?: { id?: string | null; name?: string | null } | null;
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
  specialAwardsJudges: Array<{ name: string; affix: string | null; subjectToRkcApproval: boolean }>;
} {
  const entries = new Map<string, JudgeAggregate>();
  const specialAwardsJudges: Array<{ name: string; affix: string | null; subjectToRkcApproval: boolean }> = [];
  for (const ja of rows) {
    if (!ja.judge?.id || !ja.judge?.name) continue;
    const subjectToRkcApproval = ja.subjectToRkcApproval === true;
    if (ja.isSpecialAwardsClassesJudge) {
      specialAwardsJudges.push({ name: ja.judge.name, affix: ja.judge.kennelClubAffix ?? null, subjectToRkcApproval });
      continue;
    }
    if (ja.judgeRoleId) continue; // panel judges handled elsewhere
    const key = ja.judge.id;
    const isJhAssignment = !ja.breed?.name && !ja.sex;
    const existing = entries.get(key);
    if (existing) {
      if (ja.breed?.name) existing.breeds.add(ja.breed.name);
      if (ja.breed?.id) existing.breedIds.add(ja.breed.id);
      if (ja.sex) existing.sexes.add(ja.sex);
      else existing.hasNullSexAssignment = true;
      if (isJhAssignment) existing.hasJhAssignment = true;
      if (subjectToRkcApproval) existing.subjectToRkcApproval = true;
    } else {
      entries.set(key, {
        name: ja.judge.name,
        affix: ja.judge.kennelClubAffix ?? null,
        breeds: new Set(ja.breed?.name ? [ja.breed.name] : []),
        breedIds: new Set(ja.breed?.id ? [ja.breed.id] : []),
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
  specialAwardsJudges: Array<{ name: string; affix?: string | null; subjectToRkcApproval: boolean }>,
  context: JudgeRoleContext,
): ScheduleJudge[] {
  const entries = [...judgeEntries];
  const { hasJuniorHandlerClasses } = context;

  // Who is a Junior Handling judge — the schedule route's rule, which is the
  // one that gets it right: no Dogs/Bitches assignment, and either a no-sex
  // assignment at a show with Junior Handling classes (on a single-breed
  // show the breed judges are assigned by sex, so a no-sex row there IS the
  // Junior Handling one — even when it also names the breed, as Lynne
  // Harvey's did at Winter Spectacular, Mandy 3 Nov 2026), or breeds that
  // appear only on Junior Handling classes.
  const isJuniorOnly = (j: JudgeAggregate): boolean => {
    const onlyJhBreeds =
      j.breedIds.size > 0 &&
      [...j.breedIds].every(
        (id) => context.juniorClassBreedIds?.has(id) === true && context.breedClassBreedIds?.has(id) !== true,
      );
    const nullSexInJhShow = hasJuniorHandlerClasses && j.hasNullSexAssignment && j.sexes.size === 0;
    return onlyJhBreeds || nullSexInJhShow;
  };

  const breedJudges: ScheduleJudge[] = [];
  const jhJudges: ScheduleJudge[] = [];
  for (const j of entries) {
    const jhOnly = isJuniorOnly(j);
    const role = jhOnly
      ? 'Junior Handling'
      : j.sexes.has('dog') && j.sexes.has('bitch')
        ? 'Dogs & Bitches'
        : j.sexes.has('dog')
          ? 'Dogs'
          : j.sexes.has('bitch')
            ? 'Bitches'
            : null;
    const namePart = judgeDisplayName(j);
    const judge: ScheduleJudge = {
      name: j.name,
      affix: j.affix,
      breeds: Array.from(j.breeds),
      sex: j.sexes.size === 1 ? (Array.from(j.sexes)[0] as 'dog' | 'bitch') : null,
      // role MUST be set so the schedule can route this judge to the right
      // section — a Junior Handling judge belongs in the JH block, not the
      // breed-classification list (mirrors how SAC judges are handled).
      role: role ?? undefined,
      displayLabel: role ? `${role} — ${namePart}` : namePart,
    };
    (jhOnly ? jhJudges : breedJudges).push(judge);
  }

  // Order (Mandy, 3 Nov 2026: "the first judge should be Sami"): the breed
  // judge(s) first, then Special Awards, then Junior Handling — the show's
  // running order. Alphabetical within each. Every consumer of this list
  // relies on it: the first label used to be whichever judge sorted first by
  // name, and a Junior Handling judge printed as the breed judge (Mandy
  // 2026-09-04, and again 3 Nov).
  const byName = (a: ScheduleJudge, b: ScheduleJudge) => a.name.localeCompare(b.name);
  const judges: ScheduleJudge[] = breedJudges.sort(byName);

  // Special Awards Classes judges — the explicit role label lets the
  // dedicated SAC block find them even when they also judge breeds.
  for (const sac of specialAwardsJudges) {
    judges.push({
      name: sac.name,
      affix: sac.affix ?? null,
      breeds: [],
      sex: null,
      role: 'Special Awards Classes',
      displayLabel: `Special Awards Classes — ${judgeDisplayName(sac)}`,
    });
  }

  judges.push(...jhJudges.sort(byName));

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
        affix: j.affix,
        breeds: [],
        sex: null,
        role: 'Junior Handling',
        displayLabel: `Junior Handling — ${judgeDisplayName(j)}`,
      });
    }
  }

  return judges;
}

/**
 * The judges as one list per person, in the order buildScheduleJudges gives
 * (breed → Special Awards → Junior Handling): the bare `name` keys bios and
 * photos, `displayName` is what prints (affix, "subject to RKC approval"),
 * `roles` are every role they hold ("Dogs & Bitches", "Junior Handling").
 * Renderers read this rather than splitting display labels — a label's name
 * part carries the affix, so it never matched the bio's key.
 */
export function judgeListForCatalogue(
  judges: readonly ScheduleJudge[],
): Array<{ name: string; displayName: string; roles: string[] }> {
  const byName = new Map<string, { name: string; displayName: string; roles: string[] }>();
  for (const j of judges) {
    const label = j.displayLabel ?? j.name;
    const displayName = j.role && label.startsWith(`${j.role} — `) ? label.slice(j.role.length + 3) : label;
    const entry = byName.get(j.name) ?? { name: j.name, displayName, roles: [] };
    if (j.role && !entry.roles.includes(j.role)) entry.roles.push(j.role);
    byName.set(j.name, entry);
  }
  return [...byName.values()];
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
