export const showTypeLabels: Record<string, string> = {
  companion: 'Companion',
  primary: 'Primary',
  limited: 'Limited',
  open: 'Open',
  premier_open: 'Premier Open',
  championship: 'Championship',
};

/** SV/WUSV regionals are stored as `championship` showType under the
 *  hood (the underlying judging IS championship-class), but they
 *  belong to a different show hierarchy (Regional → National →
 *  Sieger). Amanda 2026-05-24: render the badge as "Regional" instead
 *  of "Championship" whenever the show is on the WUSV ruleset. */
export function displayShowTypeLabel(
  showType: string,
  showRuleset?: string | null,
): string {
  if (showRuleset === 'wusv') return 'Regional';
  return showTypeLabels[showType] ?? showType;
}

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

/**
 * The club's name together with the show's name, never repeating words —
 * for documents that must say whose show it is (the grading cards). Mandy,
 * 30 Sept 2026: Midland's show is just "Regional Show", so print the club too,
 * "but not duplicate the name so if midlands Gsd group added midlands to the
 * show name I wouldn't want it showing as midlands Gsd group and midlands
 * regional show". She approved:
 *   "Midlands Region GSD Group" + "Regional Show" → "Midlands Region GSD Group Regional Show"
 *   "North East GSD Regional Group" + the same    → "North East GSD Regional Group"
 *   "Midlands GSD Group" + "Midlands Regional Show" → "Midlands GSD Group Regional Show"
 *
 * A show name that already holds the whole club name prints as it is.
 * Otherwise the show name's LEADING words that already appear in the club
 * name are dropped (only leading ones — "Festival of Champions" keeps its
 * "of"), and the rest follows the club name.
 *
 * Listings use `displayShowTitle` instead (club only in front of a generic
 * type-only name) — a different job, not a second copy of this.
 */
export function showNameWithClub(showName: string, clubName: string | null | undefined): string {
  const show = showName.trim();
  const club = (clubName ?? '').trim();
  if (!club) return show;
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ');
  if (norm(show).includes(norm(club))) return show;
  const clubWords = new Set(norm(club).split(' '));
  const words = show.split(/\s+/);
  let i = 0;
  while (i < words.length && clubWords.has(words[i]!.toLowerCase())) i++;
  const rest = words.slice(i).join(' ');
  return rest ? `${club} ${rest}` : club;
}
