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
  *
 * EXCEPTION — do NOT use this where the question is "has the close TRANSITION
 * actually run?" rather than "what should this read as?". The hourly cron
 * (api/cron/route.ts) re-sorts + locks catalogue numbers and schedules the
 * catalogue render when it flips the status; until then the catalogue is not
 * final. The secretary catalogue page's "won't be generated until entries
 * close" banner therefore reads the RAW `status` on purpose.
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

/**
 * ONE owner for "is this show still accepting NEW MONEY against an entry" —
 * new entries, class changes, and (2026-09-21) extras purchased after entry.
 *
 * Before this, `orders.checkout` and `entries.create` each carried their own
 * copy of `status === 'entries_open' && entryCloseDate not passed`, and
 * `priceEntryClassChange` (the class-change top-up owner) carried only HALF
 * of it — it checked `status !== 'entries_open'` but never the close date at
 * all, so a class-change top-up (and now an extras purchase) could still be
 * bought on a show whose `entryCloseDate` had passed but whose daily-cron
 * status hadn't caught up yet (the same lag `effectiveShowStatus` exists to
 * paper over for display). That is a rule written down twice — three times,
 * with one copy missing a check — per CLAUDE.md "One owner per rule".
 *
 * Rule: `status === 'entries_open'` AND (`entryCloseDate` unset OR not yet
 * passed). Strict `<` on the close date, matching `effectiveShowStatus` and
 * every existing inline check this replaces, so the boundary instant behaves
 * identically everywhere.
 *
 * `secretary.createManualEntry` deliberately allows a WIDER set of statuses
 * for postal/manual entries (see its own comment) — do NOT route it through
 * this function; that breadth is intentional, not a second copy of this rule.
 */
export function entryWindowOpen(
  show: { status: string; entryCloseDate: string | Date | null | undefined },
  now: Date = new Date(),
): boolean {
  if (show.status !== 'entries_open') return false;
  if (show.entryCloseDate && new Date(show.entryCloseDate).getTime() < now.getTime()) {
    return false;
  }
  return true;
}
