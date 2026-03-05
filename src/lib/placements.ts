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

export const placementColors: Record<number, string> = {
  1: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  2: 'bg-gray-100 text-gray-700 border-gray-200',
  3: 'bg-amber-100 text-amber-800 border-amber-200',
  4: 'bg-blue-50 text-blue-700 border-blue-200',
  5: 'bg-purple-50 text-purple-700 border-purple-200',
  6: 'bg-teal-50 text-teal-700 border-teal-200',
  7: 'bg-slate-50 text-slate-600 border-slate-200',
};
