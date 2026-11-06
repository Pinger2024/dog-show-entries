/**
 * ONE owner (CLAUDE.md, "One owner per rule") for "does this entry count" —
 * whether an entry counts towards a class listing / printed document / results
 * screen at all.
 *
 * The rule: an entry counts only if it is CONFIRMED and NOT soft-deleted.
 * Before 2026-09-18 this was hand-typed as
 * `ec.entry.status === 'confirmed' && !ec.entry.deletedAt` (and close variants)
 * independently in the judges' book, the results-approval page, prize cards,
 * the ring board, the results/steward routers and the document renderers —
 * ~9 identical copies with no cross-check. All were behaviourally identical,
 * but a rule written down twice is a rule that can silently drift (e.g. one
 * copy learning about a new 'transferred' status while the others don't), and
 * when it drifts here a printed document disagrees with the results screen.
 *
 * NOT part of this rule: per-class ABSENCE. `entry_classes.absent` is a
 * separate, authoritative flag (Mandy, 2026-08-12) — an entry can be "live"
 * here and still be absent from one particular class while present in
 * another. Callers that need to exclude absentees filter on `.absent`
 * themselves, in addition to calling {@link isLiveEntry}.
 *
 * SQL/drizzle callers: this function is for in-memory / already-fetched data.
 * A `where` clause that filters at the query layer (`eq(entries.status,
 * 'confirmed')` + `isNull(entries.deletedAt)`) is a different mechanism and
 * is expected to keep using drizzle operators directly — but it MUST express
 * this same rule. If the rule ever changes, update the doc comment here and
 * audit every such `where` clause too.
 */
export function isLiveEntry(
  entry: { status: string; deletedAt: Date | string | null | undefined } | null | undefined
): boolean {
  if (!entry) return false;
  return entry.status === 'confirmed' && !entry.deletedAt;
}

/**
 * Entry statuses meaning the dog has LEFT the show — withdrawn by the
 * exhibitor, or cancelled (a refund). 'transferred' is not here: the dog moved
 * class, it did not leave. The one list for "is this dog still at the show",
 * read by the regional once-per-dog rule (`dogAlreadyOnRegional`) and the
 * multi-dog pricing's held places (`heldPlaceConditions`).
 */
export const LEFT_SHOW_STATUSES = ['cancelled', 'withdrawn'] as const;
