/**
 * One owner for "may this viewer see this result / award yet".
 *
 * Results and achievements are keyed in on show day and released later
 * (results.publishedAt / achievements.publishedAt). Until then only people
 * who may see them early — the dog's own owners on dog views; the steward /
 * secretary on show views — see them. Everyone else sees nothing.
 *
 * Bug hunt 2026-09-22: dogs.getShowResults (any logged-in user, any dog id)
 * had no gate at all, so a rival could read show-day placings and critiques
 * before they were published. The rule was hand-written in each dog view.
 */
export function isVisibleToViewer(
  row: { publishedAt: Date | string | null } | null | undefined,
  viewerMaySeeUnpublished: boolean,
): boolean {
  if (!row) return false;
  return viewerMaySeeUnpublished || row.publishedAt != null;
}
