/**
 * The status to *display* for a show, derived from its close date.
 *
 * Show statuses advance via the daily cron (entries_open → entries_closed →
 * in_progress → completed). That cron only runs once a day, so a show whose
 * entries have closed by date can still carry `status='entries_open'` for hours
 * — which made the dashboard show a stale "Open" badge (Mandy, 2026-06-19).
 *
 * Anything that shows the status to a user should derive it from the timestamp,
 * so "Entries Closed" appears the instant the deadline passes — no cron lag and
 * no cost. This is display-only: new-entry enforcement (`orders.checkout`,
 * `entries.create`, `secretary.createManualEntry`) already keys off the close
 * date, not the stored status, and the cron still owns the real DB transition
 * (and the later in_progress/completed moves). This is the ONE owner for "what
 * status should a show DISPLAY as" — every badge/label site must call this
 * instead of comparing `entryCloseDate` to `now` inline.
 *
 * Boundary: at the exact close instant this still reports `entries_open`
 * (strict `<`, matching `orders.checkout`/`entries.create`, which reject new
 * entries only once `entryCloseDate` is strictly in the past, and the public
 * shows-list card, which used `< Date.now()` for "closed" too) — so the badge
 * never shows "closed" a moment before checkout would actually refuse.
 */
export function effectiveShowStatus(
  show: { status: string; entryCloseDate: string | Date | null | undefined },
  now: Date = new Date(),
): string {
  if (
    show.status === 'entries_open' &&
    show.entryCloseDate &&
    new Date(show.entryCloseDate).getTime() < now.getTime()
  ) {
    return 'entries_closed';
  }
  return show.status;
}
