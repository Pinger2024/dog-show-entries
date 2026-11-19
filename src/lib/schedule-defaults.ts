/**
 * Where a new show's schedule starts from: the club's earlier shows.
 *
 * Everything comes from the club's latest show (officers, directions,
 * catering, prize money…), because those change over time. The awards wording
 * and the list of awards come from the club's last show of the SAME type,
 * because a championship show's specials differ from an open show's
 * (Mandy, Telegram 8329 / 8334, 19 Nov 2026: South Western wanted new wording
 * on an open show and to keep the championship wording for future
 * championship shows; "the awards wording, and the list of awards given not
 * the prize money as that's defo always subject to change").
 *
 * One owner (CLAUDE.md): which fields follow the show type, what "the same
 * type" means, and how the two sources combine all live here.
 */
import type { ScheduleData } from '@/server/db/schema/shows';
import { displayShowTypeTitle } from '@/lib/show-types';

/** The schedule fields a new show takes from the club's last show of the same type. */
export const SHOW_TYPE_SCHEDULE_FIELDS = ['awardsDescription', 'bestAwards'] as const satisfies readonly (keyof ScheduleData)[];

export interface ScheduleKind {
  showType: string;
  showRuleset: string;
}

/**
 * Two shows are the same type when both the show type and the ruleset match.
 * A regional is stored as `showType: 'championship'` with `showRuleset:
 * 'wusv'`, and its awards are nothing like an RKC championship show's.
 */
export function sameScheduleKind(a: ScheduleKind, b: ScheduleKind): boolean {
  return a.showType === b.showType && a.showRuleset === b.showRuleset;
}

/**
 * Which earlier shows a new show's schedule starts from. `othersNewestFirst`
 * is the club's other shows that have a schedule, most recently created
 * first. Returns null when there are none.
 */
export function pickScheduleSources<T extends ScheduleKind>(
  current: ScheduleKind,
  othersNewestFirst: readonly T[],
): { latest: T; sameType: T | null } | null {
  const latest = othersNewestFirst[0];
  if (!latest) return null;
  return { latest, sameType: othersNewestFirst.find((s) => sameScheduleKind(s, current)) ?? null };
}

/**
 * A new show's starting schedule.
 *
 * `latest` is the club's most recent other show with a schedule; `sameType`
 * is its most recent other show of the same type with a schedule, or null
 * when the club has never run that type (then everything comes from
 * `latest`, as it always did). The same-type show's values are taken as they
 * are, even when it left a box empty: another type's specials never leak in.
 */
export function previousScheduleDefaults(latest: ScheduleData, sameType: ScheduleData | null): ScheduleData {
  if (!sameType) return { ...latest };
  const merged: ScheduleData = { ...latest };
  for (const field of SHOW_TYPE_SCHEDULE_FIELDS) {
    if (sameType[field] === undefined) delete merged[field];
    else (merged as Record<string, unknown>)[field] = sameType[field];
  }
  return merged;
}

/**
 * The note above a schedule that was pre-filled from earlier shows. Names the
 * show it came from, and the show the awards came from when that is a
 * different one, so the secretary knows why the awards differ from her last
 * show's.
 */
export function scheduleDefaultsNote(input: {
  latestShowName: string;
  awardsFromShowName: string | null;
  showType: string;
  showRuleset: string;
}): string {
  const from = `Pre-filled from your last show, ${input.latestShowName.trim()}.`;
  const awards = input.awardsFromShowName
    ? ` The awards wording and the list of awards come from your last ${displayShowTypeTitle(input.showType, input.showRuleset)}, ${input.awardsFromShowName.trim()}.`
    : '';
  return `${from}${awards} Review each section and save when ready.`;
}
