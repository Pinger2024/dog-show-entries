/** The seven KC breed groups used for club registration. */
export const BREED_GROUPS = [
  'Gundog',
  'Hound',
  'Pastoral',
  'Terrier',
  'Toy',
  'Utility',
  'Working',
] as const;

export type BreedGroup = (typeof BREED_GROUPS)[number];
