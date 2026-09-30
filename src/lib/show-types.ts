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
const REGIONAL_TYPE_LABEL = 'Regional';

export function displayShowTypeLabel(
  showType: string,
  showRuleset?: string | null,
): string {
  if (showRuleset === 'wusv') return REGIONAL_TYPE_LABEL;
  return showTypeLabels[showType] ?? showType;
}

/** Generic show names made of the show type alone — "Open Show",
 *  "Championship Show", and "Regional Show" (Midland's 2026 regional is
 *  called exactly that). Compared ignoring capitals and spacing. */
const GENERIC_SHOW_TITLES = new Set(
  [...Object.values(showTypeLabels), REGIONAL_TYPE_LABEL].map((label) => `${label} Show`.toLowerCase()),
);

/** Does this name only say what TYPE of show it is, not whose? A trailing
 *  year doesn't change that ("Regional Show 2026"). */
export function isGenericShowName(name: string): boolean {
  const bare = name.trim().replace(/\s+/g, ' ').replace(/ \d{4}$/, '').toLowerCase();
  return GENERIC_SHOW_TITLES.has(bare);
}

/** Title to display for a show in a listing / badge / banner, and on the
 *  judge's half of a grading card. Custom names render as-is; a generic
 *  type-only name gets the host club's name in front, so two "Open Show"s
 *  can be told apart. Mandy, 30 Sept 2026, on the grading card: "where they
 *  have only stated regional show as the show name, the club name is added to
 *  the front of that". */
export function displayShowTitle(
  name: string,
  organisationName?: string | null,
): string {
  if (!organisationName) return name;
  if (!isGenericShowName(name)) return name;
  return `${organisationName} ${name}`;
}

/**
 * The club's name together with the show's name, never repeating words —
 * for the heading of a grading card, which must say whose show it is (the
 * judge's Show line on the same card uses `displayShowTitle`: Mandy found the
 * full name "a bit wordy" there, 30 Sept pm). Mandy,
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
