// Placements cap at 5 (VHC) — research across 14 non-GSD single-breed
// championship schedules (Higham Press / Have A Dog Day, Apr 2026) showed
// zero shows carding past VHC. Some shows only card the podium (RKC
// minimum is 3). Nothing in the sample used HC or Commended, so the
// dropdown, prize cards, and catalogue display all cap at 5.
export const KC_PLACEMENTS = [
  { value: 1, label: '1st', shortLabel: '1st' },
  { value: 2, label: '2nd', shortLabel: '2nd' },
  { value: 3, label: '3rd', shortLabel: '3rd' },
  { value: 4, label: 'Reserve', shortLabel: 'Res' },
  { value: 5, label: 'VHC', shortLabel: 'VHC' },
] as const;

/**
 * Single source of truth for achievement type identifiers.
 * This array is the canonical ordering used by:
 *   - `achievementTypeEnum` in src/server/db/schema/enums.ts (pgEnum)
 *   - recordAchievement/removeAchievement z.enum in secretary.ts and steward.ts
 *   - local AchievementType unions in the secretary/steward results pages
 *
 * Add a new award type HERE and it flows to all consumers automatically.
 * Order must match the postgres enum order — to add a new value, append to
 * the end AND run an `ALTER TYPE achievement_type ADD VALUE` migration.
 */
export const ACHIEVEMENT_TYPES = [
  'cc',
  'reserve_cc',
  'best_of_breed',
  'best_in_show',
  'reserve_best_in_show',
  'best_puppy_in_breed',
  'best_puppy_in_show',
  'best_veteran_in_breed',
  // Best Veteran Group/Show progression — new for 2026 per RKC F(1).27
  'best_veteran_in_group',
  'best_veteran_in_show',
  'reserve_best_veteran_in_show',
  'group_placement',
  'class_placement',
  'junior_warrant',
  'stud_book',
  // Championship & breed-specific awards
  'dog_cc',
  'reserve_dog_cc',
  'bitch_cc',
  'reserve_bitch_cc',
  'best_puppy_dog',
  'best_puppy_bitch',
  'best_long_coat_dog',
  'best_long_coat_bitch',
  'best_long_coat_in_show',
] as const;

export type AchievementType = typeof ACHIEVEMENT_TYPES[number];

/**
 * All achievement types that represent a Challenge Certificate.
 * At UK championship shows, CCs are awarded separately to the best dog
 * and best bitch, so the sex-specific variants (`dog_cc`, `bitch_cc`)
 * are what's actually recorded in practice. The generic `cc` exists for
 * data imported from sources that don't distinguish by sex.
 *
 * Any code counting "how many CCs does this dog have?" must filter
 * against this constant, not just `=== 'cc'`.
 */
export const CC_ACHIEVEMENT_TYPES = [
  'cc',
  'dog_cc',
  'bitch_cc',
] as const satisfies readonly AchievementType[];

/**
 * All achievement types that represent a Reserve Challenge Certificate.
 * Same rationale as `CC_ACHIEVEMENT_TYPES`.
 */
export const RCC_ACHIEVEMENT_TYPES = [
  'reserve_cc',
  'reserve_dog_cc',
  'reserve_bitch_cc',
] as const satisfies readonly AchievementType[];

export function isCcType(type: string): boolean {
  return (CC_ACHIEVEMENT_TYPES as readonly string[]).includes(type);
}

export function isRccType(type: string): boolean {
  return (RCC_ACHIEVEMENT_TYPES as readonly string[]).includes(type);
}

export const SPECIAL_AWARDS = [
  'Best of Breed',
  'Best Opposite Sex',
  'Best Puppy in Breed',
  'Best Veteran in Breed',
  'Best in Show',
  'Reserve Best in Show',
  'Best Puppy in Show',
  // Best Veteran Group/Show progression — new for 2026 per RKC F(1).27
  'Best Veteran in Group',
  'Best Veteran in Show',
  'Reserve Best Veteran in Show',
] as const;

export function getPlacementLabel(value: number): string {
  return KC_PLACEMENTS.find((p) => p.value === value)?.label ?? `${value}th`;
}

export function getPlacementShortLabel(value: number): string {
  return (
    KC_PLACEMENTS.find((p) => p.value === value)?.shortLabel ?? `${value}th`
  );
}

/**
 * Returns available RKC placements. Kept as a function (vs. a direct
 * export of KC_PLACEMENTS) so call sites don't need to change if the
 * breed/group distinction ever comes back.
 */
export function getPlacementsForScope(
  _showScope: 'single_breed' | 'group' | 'general'
) {
  return KC_PLACEMENTS;
}

export const achievementLabels: Record<string, string> = {
  best_in_show: 'Best in Show',
  reserve_best_in_show: 'Reserve Best in Show',
  best_puppy_in_show: 'Best Puppy in Show',
  best_veteran_in_show: 'Best Veteran in Show',
  reserve_best_veteran_in_show: 'Reserve Best Veteran in Show',
  best_of_breed: 'Best of Breed',
  best_puppy_in_breed: 'Best Puppy in Breed',
  best_veteran_in_breed: 'Best Veteran in Breed',
  best_veteran_in_group: 'Best Veteran in Group',
  dog_cc: 'Dog CC',
  reserve_dog_cc: 'Reserve Dog CC',
  bitch_cc: 'Bitch CC',
  reserve_bitch_cc: 'Reserve Bitch CC',
  best_puppy_dog: 'Best Puppy Dog',
  best_puppy_bitch: 'Best Puppy Bitch',
  best_long_coat_dog: 'Best Long Coat Dog',
  best_long_coat_bitch: 'Best Long Coat Bitch',
  best_long_coat_in_show: 'Best Long Coat in Show',
  cc: 'CC',
  reserve_cc: 'Reserve CC',
};

export const placementColors: Record<number, string> = {
  1: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  2: 'bg-gray-100 text-gray-700 border-gray-200',
  3: 'bg-amber-100 text-amber-800 border-amber-200',
  4: 'bg-blue-50 text-blue-700 border-blue-200',
  5: 'bg-purple-50 text-purple-700 border-purple-200',
};
