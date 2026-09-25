import type { CatalogueEntry } from '@/components/catalogue/catalogue-types';

/**
 * Redact the home address of every owner on entries whose exhibitor opted out
 * of catalogue publication (`withholdFromPublication`).
 *
 * The PDF render components already substitute "address withheld" for these
 * entries, but the catalogue JSON data export (`?output=json`) returned the raw
 * home address. That export is reachable with exhibitor-level access on show
 * day, so a withheld owner's home address would leak to anyone holding an
 * entry. This closes the leak in the data layer.
 *
 * Mirrors the published behavior exactly (see `formatOwnerKC`): the owner NAME
 * is still shown, only the ADDRESS is suppressed. Returns a new array; the
 * input is not mutated.
 */
export function redactWithheldOwnerAddresses(
  entries: CatalogueEntry[]
): CatalogueEntry[] {
  return entries.map((entry) =>
    entry.withholdFromPublication
      ? { ...entry, owners: entry.owners.map((o) => ({ ...o, address: null })) }
      : entry
  );
}
