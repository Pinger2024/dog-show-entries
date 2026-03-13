export const KC_PLACEMENTS = [
  { value: 1, label: '1st', shortLabel: '1st' },
  { value: 2, label: '2nd', shortLabel: '2nd' },
  { value: 3, label: '3rd', shortLabel: '3rd' },
  { value: 4, label: 'Reserve', shortLabel: 'Res' },
  { value: 5, label: 'VHC', shortLabel: 'VHC' },
  { value: 6, label: 'HC', shortLabel: 'HC' },
  { value: 7, label: 'Commended', shortLabel: 'C' },
] as const;

export const SPECIAL_AWARDS = [
  'Best of Breed',
  'Best Opposite Sex',
  'Best Puppy in Breed',
  'Best Veteran in Breed',
  'Best in Show',
  'Reserve Best in Show',
  'Best Puppy in Show',
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
 * Returns available RKC placements based on show scope.
 * All-breed (general/group): 1st–HC (6 places)
 * Breed (single_breed): 1st–Commended (all 7)
 */
export function getPlacementsForScope(
  showScope: 'single_breed' | 'group' | 'general'
) {
  if (showScope === 'single_breed') {
    return KC_PLACEMENTS; // all 7
  }
  return KC_PLACEMENTS.filter((p) => p.value <= 6); // 1st–HC, no Commended
}

export const achievementLabels: Record<string, string> = {
  best_in_show: 'Best in Show',
  reserve_best_in_show: 'Reserve Best in Show',
  best_puppy_in_show: 'Best Puppy in Show',
  best_of_breed: 'Best of Breed',
  best_puppy_in_breed: 'Best Puppy in Breed',
  best_veteran_in_breed: 'Best Veteran in Breed',
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
  6: 'bg-teal-50 text-teal-700 border-teal-200',
  7: 'bg-slate-50 text-slate-600 border-slate-200',
};
