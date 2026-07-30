/**
 * Top Awards (#98) — drive the recordable show-level awards off each show's
 * OWN configured Best Awards list (scheduleData.bestAwards, resolved via
 * buildBestAwards) rather than a hard-coded set. Different show types award
 * different things — a championship breed club like BAGSD gives Best Dog/Bitch
 * + reserves + Best Puppy in Show + Best Long Coat in Show, while another show
 * gives CCs — so the recording UI must follow the show's actual award list.
 *
 * This maps a configured award NAME to the canonical achievement TYPE (so it
 * stores in the achievements table and flows to the results page, public
 * results and dog profiles), plus the candidate-filtering metadata for that
 * award (which sex / puppy / veteran / long-coat winners are eligible).
 */
import { type AchievementType } from './placements';
import { buildBestAwards } from './best-awards';

// Configured award display name (lower-cased, trimmed) → achievement type.
// Covers the whole RKC award vocabulary across show types: Best Dog/Bitch
// (+ reserve), CCs (+ reserve), Best of Breed, puppy / veteran / long-coat,
// and the show-level "in Show" awards.
const NAME_TO_TYPE: Record<string, AchievementType> = {
  'best in show': 'best_in_show',
  'reserve best in show': 'reserve_best_in_show',
  'res best in show': 'reserve_best_in_show',
  'best of breed': 'best_of_breed',
  'best dog': 'best_dog',
  'best bitch': 'best_bitch',
  'reserve best dog': 'reserve_best_dog',
  'res best dog': 'reserve_best_dog',
  'reserve best bitch': 'reserve_best_bitch',
  'res best bitch': 'reserve_best_bitch',
  'dog cc': 'dog_cc',
  'dog challenge certificate': 'dog_cc',
  'reserve dog cc': 'reserve_dog_cc',
  'res dog cc': 'reserve_dog_cc',
  'reserve dog challenge certificate': 'reserve_dog_cc',
  'bitch cc': 'bitch_cc',
  'bitch challenge certificate': 'bitch_cc',
  'reserve bitch cc': 'reserve_bitch_cc',
  'res bitch cc': 'reserve_bitch_cc',
  'reserve bitch challenge certificate': 'reserve_bitch_cc',
  'best puppy dog': 'best_puppy_dog',
  'best puppy bitch': 'best_puppy_bitch',
  'best puppy in breed': 'best_puppy_in_breed',
  'best puppy in show': 'best_puppy_in_show',
  'best veteran': 'best_veteran_in_show',
  'best veteran in breed': 'best_veteran_in_breed',
  'best veteran in show': 'best_veteran_in_show',
  'reserve best veteran in show': 'reserve_best_veteran_in_show',
  'best long coat dog': 'best_long_coat_dog',
  'best long coat bitch': 'best_long_coat_bitch',
  'best long coat in show': 'best_long_coat_in_show',
  cc: 'cc',
  'reserve cc': 'reserve_cc',
};

export function awardNameToType(name: string): AchievementType | null {
  return NAME_TO_TYPE[name.trim().toLowerCase()] ?? null;
}

/** Candidate-filtering metadata for an award type. */
export type AwardFilter = {
  /** Restrict to one sex, or null for either. */
  sex: 'dog' | 'bitch' | null;
  /** Restrict to dogs under 12 months on show day. */
  puppy: boolean;
  /** Restrict to veteran-age dogs. */
  veteran: boolean;
  /** Restrict to the long-coat coat variety. */
  longCoat: boolean;
};

const DOG_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_dog', 'reserve_best_dog', 'dog_cc', 'reserve_dog_cc', 'best_puppy_dog', 'best_long_coat_dog',
]);
const BITCH_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_bitch', 'reserve_best_bitch', 'bitch_cc', 'reserve_bitch_cc', 'best_puppy_bitch', 'best_long_coat_bitch',
]);
const PUPPY_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_puppy_in_breed', 'best_puppy_in_show', 'best_puppy_dog', 'best_puppy_bitch',
]);
const VETERAN_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_veteran_in_breed', 'best_veteran_in_show', 'best_veteran_in_group', 'reserve_best_veteran_in_show',
]);
const LONG_COAT_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_long_coat_dog', 'best_long_coat_bitch', 'best_long_coat_in_show',
]);

export function awardFilter(type: AchievementType): AwardFilter {
  return {
    sex: DOG_AWARDS.has(type) ? 'dog' : BITCH_AWARDS.has(type) ? 'bitch' : null,
    puppy: PUPPY_AWARDS.has(type),
    veteran: VETERAN_AWARDS.has(type),
    longCoat: LONG_COAT_AWARDS.has(type),
  };
}

export type TopAward = {
  /** The display name exactly as configured for the show. */
  name: string;
  type: AchievementType;
  filter: AwardFilter;
};

/**
 * Resolve the ordered list of recordable Top Awards for a show, from its own
 * configured Best Awards (show-type defaults + the secretary's custom list).
 * Awards whose name we don't have a recordable type for yet (bespoke trophies)
 * are dropped — they still print in the judges' book, they're just not
 * recorded here.
 */
export function resolveTopAwards(
  showType: string | null | undefined,
  customAwards: string[] = [],
): TopAward[] {
  // Mirror the sponsors page (the source of truth the secretary sees): use the
  // show's STORED award list verbatim when set — a club like BAGSD configures
  // "Best Dog/Bitch + reserves", and we must NOT run that through
  // buildBestAwards, whose CC_SUPERSEDES rule would swap them for CCs. Only when
  // nothing is configured do we fall back to the show-type defaults.
  const names = customAwards.length > 0 ? customAwards : buildBestAwards(showType, []);
  const out: TopAward[] = [];
  const seen = new Set<AchievementType>();
  for (const name of names) {
    const type = awardNameToType(name);
    if (!type || seen.has(type)) continue;
    seen.add(type);
    out.push({ name, type, filter: awardFilter(type) });
  }
  return out;
}
