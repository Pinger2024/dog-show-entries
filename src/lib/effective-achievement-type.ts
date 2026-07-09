import type { AchievementType } from './placements';

/**
 * At a UK **single-breed championship** show, the Best Dog and Best Bitch ARE
 * the Dog CC and Bitch CC winners (and the reserves are the Reserve CCs) — the
 * Challenge Certificate is what makes them best of their sex. Some breed clubs
 * (e.g. BAGSD) configure their award list as "Best Dog / Best Bitch" rather than
 * "CC", so those wins get recorded as `best_dog` / `best_bitch` achievements and
 * would otherwise never count toward a dog's Champion title (3 CCs) — Mandy
 * confirmed 2026-07-09 that they must.
 *
 * This maps such best-of-sex awards to their CC equivalent **for a dog's career
 * record + title tracking only**. It does NOT change the show's own results
 * pages (those keep the club's award names, and the recorded achievement type is
 * unchanged) — it's a read-time reinterpretation.
 *
 * Scope is deliberately narrow: only `championship` + `single_breed` shows,
 * where CCs are unambiguously on offer for the breed. General/group championship
 * shows allocate CCs per breed per year, which we don't track, so their
 * best-of-sex awards pass through unchanged. Anything that isn't a mapped
 * best-of-sex type — or a show that isn't a single-breed champ — is returned
 * as-is. Achievements with no show context (self-reported externals) pass
 * through too.
 */
const BEST_TO_CC: Partial<Record<AchievementType, AchievementType>> = {
  best_dog: 'dog_cc',
  best_bitch: 'bitch_cc',
  reserve_best_dog: 'reserve_dog_cc',
  reserve_best_bitch: 'reserve_bitch_cc',
};

/** True when a show awards CCs such that Best Dog/Bitch = the CC. */
export function isCcShow(
  showType: string | null | undefined,
  showScope: string | null | undefined,
): boolean {
  return showType === 'championship' && showScope === 'single_breed';
}

/**
 * The achievement type to COUNT/DISPLAY a dog's award as on its career record.
 * On a single-breed championship show, Best Dog/Bitch (+ reserves) become the
 * CC/RCC; otherwise the type is unchanged.
 */
export function effectiveCcType(
  type: string,
  showType: string | null | undefined,
  showScope: string | null | undefined,
): string {
  if (isCcShow(showType, showScope)) {
    return BEST_TO_CC[type as AchievementType] ?? type;
  }
  return type;
}
