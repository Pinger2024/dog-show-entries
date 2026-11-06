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
 * Scope is deliberately narrow: only RKC `championship` + `single_breed` shows,
 * where CCs are unambiguously on offer for the breed. NOT an SV regional
 * (`showRuleset: 'wusv'`): regionals are held under GSDL/WUSV rules, award no
 * CCs, yet are stored with show_type 'championship' — so a regional Best Bitch
 * once counted as a CC on a dog's record, in its class choices and against
 * Limited-show eligibility (Arnis Meijers' support request, 3 Nov 2026; Mandy
 * agreed). That is why the rule takes the whole show, ruleset included. General/group championship
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

/** The show an achievement was won at, as far as the CC rule needs it. */
export interface CcShowKind {
  showType: string | null | undefined;
  showScope: string | null | undefined;
  /** 'wusv' = an SV regional (GSDL/WUSV rules): never a CC. */
  showRuleset: string | null | undefined;
}

/** True when a show awards CCs such that Best Dog/Bitch = the CC. */
export function isCcShow(show: CcShowKind | null | undefined): boolean {
  return (
    !!show &&
    show.showRuleset !== 'wusv' &&
    show.showType === 'championship' &&
    show.showScope === 'single_breed'
  );
}

/**
 * The achievement type to COUNT/DISPLAY a dog's award as on its career record.
 * On an RKC single-breed championship show, Best Dog/Bitch (+ reserves) become
 * the CC/RCC; otherwise the type is unchanged.
 */
export function effectiveCcType(type: string, show: CcShowKind | null | undefined): string {
  if (isCcShow(show)) {
    return BEST_TO_CC[type as AchievementType] ?? type;
  }
  return type;
}
