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
  // Found 2026-07-27 auditing South Western's 13-award list: these had no
  // recordable type at all (printed in the catalogue, unrecordable in
  // results), and the SV short-form aliases pointed nowhere despite the
  // canonical type already existing.
  'best long coat adult': 'best_long_coat_adult',
  'best long coat puppy': 'best_long_coat_puppy',
  'best baby puppy': 'best_baby_puppy',
  'most promising dog': 'most_promising_young_dog',
  'most promising bitch': 'most_promising_young_bitch',
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
  /** Restrict to baby-puppy age band — deliberately DISJOINT from `puppy`
   *  (buildPlacementIndex excludes baby puppies from `inPuppyClass`), so
   *  Best Baby Puppy and Best Puppy in Show never share a candidate pool. */
  babyPuppy: boolean;
};

const DOG_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_dog', 'reserve_best_dog', 'dog_cc', 'reserve_dog_cc', 'best_puppy_dog', 'best_long_coat_dog',
]);
const BITCH_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_bitch', 'reserve_best_bitch', 'bitch_cc', 'reserve_bitch_cc', 'best_puppy_bitch', 'best_long_coat_bitch',
]);
const PUPPY_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_puppy_in_breed', 'best_puppy_in_show', 'best_puppy_dog', 'best_puppy_bitch', 'best_long_coat_puppy',
]);
const VETERAN_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_veteran_in_breed', 'best_veteran_in_show', 'best_veteran_in_group', 'reserve_best_veteran_in_show',
]);
const LONG_COAT_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_long_coat_dog', 'best_long_coat_bitch', 'best_long_coat_in_show', 'best_long_coat_adult', 'best_long_coat_puppy',
]);
const BABY_PUPPY_AWARDS: ReadonlySet<AchievementType> = new Set([
  'best_baby_puppy',
]);

export function awardFilter(type: AchievementType): AwardFilter {
  return {
    sex: DOG_AWARDS.has(type) ? 'dog' : BITCH_AWARDS.has(type) ? 'bitch' : null,
    puppy: PUPPY_AWARDS.has(type),
    veteran: VETERAN_AWARDS.has(type),
    longCoat: LONG_COAT_AWARDS.has(type),
    babyPuppy: BABY_PUPPY_AWARDS.has(type),
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

// ── Eligibility engine (#98 — the RKC "beaten" rule) ────────────────────────
// Shared by the steward ringside page AND the secretary results page so the two
// surfaces provably agree (per the project rule: edit the helper, never inline
// per-path). A dog is eligible for a "Best [category]" award unless it was
// beaten by another dog *in the same category* (sex / age band) in a class they
// both ran in — winning a class is NOT required (a puppy that came 4th in Junior
// behind ADULTS is still eligible; adults aren't puppies). Reserve awards keep
// the runners-up — a reserve IS, by definition, a beaten dog.

/** A dog's class placements: {classKey, placement} with 1 = best. */
export type DogPlacements = { key: string; placement: number }[];

export type PlacementIndex = {
  /** dogId → its placements across all classes. */
  placements: Map<string, DogPlacements>;
  /** dogIds that ran in any puppy (not baby-puppy) class. */
  inPuppyClass: Set<string>;
  /** dogIds that ran in any veteran class. */
  inVeteranClass: Set<string>;
  /** dogIds that ran in any BABY puppy class — deliberately disjoint from
   *  `inPuppyClass` (see the className check below), so Best Baby Puppy and
   *  Best Puppy in Show never share a candidate pool. */
  inBabyPuppyClass: Set<string>;
};

/**
 * Minimal class shape the index needs: a unique `key`, the human `className`
 * (used to infer the puppy / veteran age band), and the placed results.
 */
export type IndexClass = {
  key: string;
  className: string;
  results: { dogId: string | null; placement: number | null }[];
};

/**
 * Build the placement index the beaten-rule engine runs on. Age-band membership
 * is inferred from the class name — "puppy" (but not "baby" puppy) → puppy band,
 * "veteran" → veteran band — so both surfaces classify ages identically from the
 * one place.
 */
export function buildPlacementIndex(classes: IndexClass[]): PlacementIndex {
  const placements = new Map<string, DogPlacements>();
  const inPuppyClass = new Set<string>();
  const inVeteranClass = new Set<string>();
  const inBabyPuppyClass = new Set<string>();
  for (const cls of classes) {
    const n = cls.className.toLowerCase();
    const isBabyPuppy = n.includes('puppy') && n.includes('baby');
    const isPuppy = n.includes('puppy') && !isBabyPuppy;
    const isVeteran = n.includes('veteran');
    for (const r of cls.results) {
      if (!r.dogId) continue;
      if (isPuppy) inPuppyClass.add(r.dogId);
      if (isVeteran) inVeteranClass.add(r.dogId);
      if (isBabyPuppy) inBabyPuppyClass.add(r.dogId);
      if (r.placement != null) {
        let arr = placements.get(r.dogId);
        if (!arr) {
          arr = [];
          placements.set(r.dogId, arr);
        }
        arr.push({ key: cls.key, placement: r.placement });
      }
    }
  }
  return { placements, inPuppyClass, inVeteranClass, inBabyPuppyClass };
}

/** Reserve awards keep the beaten dogs (the reserve is itself a runner-up), so
 *  they skip the beaten-rule filter. */
export const RESERVE_TYPES: ReadonlySet<AchievementType> = new Set<AchievementType>([
  'reserve_best_dog', 'reserve_best_bitch', 'reserve_dog_cc', 'reserve_bitch_cc',
  'reserve_best_in_show', 'reserve_cc', 'reserve_best_veteran_in_show',
]);

export function isReserveAward(type: AchievementType): boolean {
  return RESERVE_TYPES.has(type);
}

/** True if some OTHER dog in `poolIds` placed above `xId` in a class they both
 *  ran — i.e. `xId` was beaten by an in-category rival. */
export function beatenByRival(
  xId: string,
  poolIds: string[],
  placements: Map<string, DogPlacements>,
): boolean {
  const xp = placements.get(xId) ?? [];
  return poolIds.some((yId) => {
    if (yId === xId) return false;
    const yp = placements.get(yId) ?? [];
    return xp.some((xc) => {
      const yc = yp.find((c) => c.key === xc.key);
      return yc != null && yc.placement < xc.placement;
    });
  });
}

/**
 * The dogs eligible to be recorded for `award`, under the RKC beaten rule.
 * `dogs` is the candidate set (each carrying an id + sex); only dogs that
 * actually placed are considered. Filters to the award's sex / puppy / veteran
 * band, then — for non-reserve awards — drops any dog beaten by an in-category
 * rival. (Long-coat awards aren't coat-filtered yet: we don't carry coat on the
 * candidate. Fine for the single-breed shows this serves today.)
 */
export function eligibleCandidates<T extends { dogId: string; sex: string | null }>(
  award: TopAward,
  dogs: T[],
  index: PlacementIndex,
): T[] {
  let pool = dogs.filter((d) => index.placements.has(d.dogId));
  if (award.filter.sex) pool = pool.filter((d) => d.sex === award.filter.sex);
  if (award.filter.puppy) pool = pool.filter((d) => index.inPuppyClass.has(d.dogId));
  if (award.filter.veteran) pool = pool.filter((d) => index.inVeteranClass.has(d.dogId));
  if (award.filter.babyPuppy) pool = pool.filter((d) => index.inBabyPuppyClass.has(d.dogId));
  if (isReserveAward(award.type)) return pool;
  const poolIds = pool.map((d) => d.dogId);
  return pool.filter((d) => !beatenByRival(d.dogId, poolIds, index.placements));
}
