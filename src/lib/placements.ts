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
