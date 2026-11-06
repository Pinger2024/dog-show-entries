/**
 * Classification heading shown above the breed cards on a show detail page.
 *
 * Junior Handling appears as its own bucket alongside real breeds, but it
 * isn't a breed — so the heading counts only real breeds and appends
 * "+ Junior Handling" when present, keeping the count factually correct
 * even on shows like BAGSD that have one breed plus Junior Handling.
 */
export function buildClassificationHeading(
  realBreedCount: number,
  hasJuniorHandling: boolean,
): string {
  if (realBreedCount === 0 && hasJuniorHandling) return 'Junior Handling';
  if (realBreedCount === 1 && !hasJuniorHandling) return 'Classification';
  const breedPart = realBreedCount === 1 ? '1 Breed' : `${realBreedCount} Breeds`;
  return hasJuniorHandling ? `${breedPart} + Junior Handling` : breedPart;
}
