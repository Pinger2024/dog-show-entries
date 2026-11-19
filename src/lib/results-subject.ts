import { getPlacementLabel, achievementLabels } from '@/lib/placements';

type SubjectEntry = {
  dogId?: string | null;
  dog?: { registeredName?: string | null } | null;
  entryClasses: { result?: { placement?: number | null } | null }[];
};
type SubjectAchievement = { dogId: string; type: string };

/**
 * Build the celebratory results-email subject line, naming the dog that
 * actually achieved the best result. Awards (CC/BIS/…) outrank placements.
 *
 * Previously the subject always used entries[0]'s dog name even when a
 * different dog won the award or took the best placement, so an exhibitor with
 * several dogs got a subject crediting the wrong one (bug hunt #24/#25).
 */
export function buildResultsSubject(
  entries: SubjectEntry[],
  showAchievements: SubjectAchievement[],
  showName: string
): string {
  // Awards: first award, paired with the dog that actually holds it.
  const awardHits = entries.flatMap((e) =>
    showAchievements
      .filter((a) => a.dogId === e.dogId)
      .map((a) => ({ dogName: e.dog?.registeredName ?? '', label: achievementLabels[a.type] ?? a.type }))
  );
  if (awardHits.length > 0) {
    return `${awardHits[0]!.dogName} — ${awardHits[0]!.label}! 🏆 ${showName}`;
  }

  // Placements: the best (lowest) placement and the dog that earned it.
  let best: { dogName: string; placement: number } | null = null;
  for (const e of entries) {
    for (const ec of e.entryClasses) {
      const p = ec.result?.placement ?? null;
      if (p != null && (best === null || p < best.placement)) {
        best = { dogName: e.dog?.registeredName ?? '', placement: p };
      }
    }
  }
  if (best && best.placement <= 3) {
    return `${best.dogName} placed ${getPlacementLabel(best.placement)}! 🏆 ${showName}`;
  }

  return `Your Results — ${showName}`;
}
