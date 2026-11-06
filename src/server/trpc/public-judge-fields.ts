/**
 * Which judge and judge-assignment fields may leave the server to anyone.
 *
 * `shows.getById` is public and also feeds the club's own secretary screens,
 * which need the judge's contact details. So it loads full rows and, for any
 * viewer who is not a member of the show's club (or an admin), passes them
 * through `redactJudgeAssignmentForPublic` before returning.
 *
 * Bug hunt 2026-09-22: the public payload carried every column, including the
 * results-approval token — the only credential `/api/results-approval/<token>`
 * checks, enough to read unpublished placings and approve them as the judge —
 * and the judge's personal email and phone.
 *
 * Every column of `judges` and `judge_assignments` is listed below as PUBLIC
 * or PRIVATE; `public-judge-fields.test.ts` fails when a new column is added
 * without a decision. Private fields are set to null rather than deleted, so
 * the payload keeps one type for public and club viewers alike.
 */

/** Judge columns anyone may see (the public show page shows the RKC number). */
export const PUBLIC_JUDGE_FIELDS = [
  'id',
  'name',
  'kcNumber',
  'jepLevel',
  'bio',
  'photoUrl',
  'kennelClubAffix',
  'createdAt',
  'updatedAt',
] as const;

/** Judge columns only the club (active members) and admins may see. */
export const PRIVATE_JUDGE_FIELDS = ['contactEmail', 'contactPhone', 'kcJudgeId'] as const;

/** Judge-assignment columns anyone may see. */
export const PUBLIC_JUDGE_ASSIGNMENT_FIELDS = [
  'id',
  'showId',
  'judgeId',
  'breedId',
  'breedGroupId',
  'judgeRoleId',
  'ringId',
  'sex',
  'isSpecialAwardsClassesJudge',
  'subjectToRkcApproval',
  'createdAt',
  'updatedAt',
] as const;

/** Results-approval state: the token is a credential; the rest is club business. */
export const PRIVATE_JUDGE_ASSIGNMENT_FIELDS = [
  'approvalToken',
  'approvalStatus',
  'approvalSentAt',
  'approvedAt',
  'approvalNote',
] as const;

function nullOut<T extends object>(row: T, fields: readonly string[]): T {
  const out = { ...row } as Record<string, unknown>;
  for (const f of fields) if (f in out) out[f] = null;
  return out as T;
}

/** A judge row as a non-member may see it. */
export function redactJudgeForPublic<T extends object>(judge: T): T {
  return nullOut(judge, PRIVATE_JUDGE_FIELDS);
}

/** A judge assignment (with its joined judge, if any) as a non-member may see it. */
export function redactJudgeAssignmentForPublic<T extends { judge?: object | null }>(ja: T): T {
  const out = nullOut(ja, PRIVATE_JUDGE_ASSIGNMENT_FIELDS);
  return out.judge ? { ...out, judge: redactJudgeForPublic(out.judge) } : out;
}
