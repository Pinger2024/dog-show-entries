/**
 * When Remi sends a judge the critique link by itself (Mandy, 30 Sept 2026):
 *   "maybe 2 weeks after judging to give them time to write them"
 *   "Breed only" — breed-class judges, not Junior Handling or Special Awards
 *   "Yes send a reminder 4 weeks later" — 4 weeks after the link, if nothing
 *   has come back (she confirmed: North Eastern 11 Oct → link 25 Oct,
 *   reminder 22 Nov).
 *
 * ONE owner for these dates: the hourly job sends on them
 * (services/critique-invites.ts) and the secretary's Critiques page shows
 * them ("Remi will send this on 25 Oct"). Dates are Europe/London calendar
 * days, YYYY-MM-DD.
 */
import { todayInLondon } from '@/lib/date-utils';

export const CRITIQUE_INVITE_DAYS_AFTER_SHOW = 14;
export const CRITIQUE_REMINDER_DAYS_AFTER_INVITE = 28;

/** Never write to a judge about an old show: the automatic send began on 30
 *  Sept 2026, and anything older than this is the secretary's to chase by
 *  hand. Also gives the hourly job room to catch up after a missed run. */
export const CRITIQUE_AUTO_SEND_WINDOW_DAYS = 46;

/** Same room for the reminder: sent on its day, or up to two weeks late if a
 *  run was missed — never months later. */
export const CRITIQUE_REMINDER_WINDOW_DAYS = 14;

/** `date` (YYYY-MM-DD) plus `days` calendar days. */
export function addCalendarDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The day the judge's critique link goes out: two weeks after the show's
 *  last day. */
export function critiqueInviteDate(showEndDate: string): string {
  return addCalendarDays(showEndDate, CRITIQUE_INVITE_DAYS_AFTER_SHOW);
}

/** Is today a day the link should go out (on its day, or catching up)? */
export function isCritiqueInviteDue(showEndDate: string, today: string): boolean {
  const from = critiqueInviteDate(showEndDate);
  return today >= from && today <= addCalendarDays(from, CRITIQUE_AUTO_SEND_WINDOW_DAYS);
}

/** The day of the one reminder: four weeks after the link went out. */
export function critiqueReminderDate(invitedOn: string): string {
  return addCalendarDays(invitedOn, CRITIQUE_REMINDER_DAYS_AFTER_INVITE);
}

export function isCritiqueReminderDue(invitedOn: string, today: string): boolean {
  const from = critiqueReminderDate(invitedOn);
  return today >= from && today <= addCalendarDays(from, CRITIQUE_REMINDER_WINDOW_DAYS);
}

/**
 * The date to show the secretary for a link Remi hasn't sent yet: the send
 * date, or today if that has passed and the next hourly run will catch up —
 * or null once the show is too old for Remi to send it at all (never promise
 * a date that won't happen).
 */
export function upcomingAutoInviteDate(showEndDate: string, today: string = todayInLondon()): string | null {
  const on = critiqueInviteDate(showEndDate);
  if (today < on) return on;
  return isCritiqueInviteDue(showEndDate, today) ? today : null;
}
