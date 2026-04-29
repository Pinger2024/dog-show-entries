export const showTypeLabels: Record<string, string> = {
  companion: 'Companion',
  primary: 'Primary',
  limited: 'Limited',
  open: 'Open',
  premier_open: 'Premier Open',
  championship: 'Championship',
};

/** Generic show names auto-generated from the show type alone
 *  (e.g. when the secretary leaves the Show Name field blank and we
 *  fall back to the type label). If one of these exact strings is
 *  the show's title, it's worth prefixing the host club's name in
 *  listings so secretaries can tell two "Open Show"s apart. */
const GENERIC_SHOW_TITLES = new Set(
  Object.values(showTypeLabels).map((label) => `${label} Show`),
);

/** Title to display for a show in a listing / badge / banner.
 *  Custom user-entered names render as-is; generic type-only names
 *  get the host organisation's name prepended. */
export function displayShowTitle(
  name: string,
  organisationName?: string | null,
): string {
  if (!organisationName) return name;
  if (!GENERIC_SHOW_TITLES.has(name.trim())) return name;
  return `${organisationName} ${name}`;
}
