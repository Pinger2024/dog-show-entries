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
 * no cost. This is display-only: new-entry enforcement already keys off the
 * close date, not the stored status, and the cron still owns the real DB
 * transition (and the later in_progress/completed moves).
 */
export function effectiveShowStatus(
  status: string,
  entryCloseDate: string | Date | null | undefined,
): string {
  if (
    status === 'entries_open' &&
    entryCloseDate &&
    new Date(entryCloseDate).getTime() <= Date.now()
  ) {
    return 'entries_closed';
  }
  return status;
}
