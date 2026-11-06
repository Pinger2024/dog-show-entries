/**
 * The awards a regional show offers, as its schedule and catalogue print them.
 * ONE owner (CLAUDE.md "One owner per rule"): the secretary's own words from
 * the schedule settings (`scheduleData.awardsDescription`), or — when that box
 * is blank — the regional default the schedule has always printed.
 *
 * Mandy, 3 Nov 2026 (Winter Spectacular): the catalogue printed four fixed
 * lines of its own ("Medals for 2nd & 3rd place"…) while the schedule printed
 * what she had typed ("Rosettes to third place"…).
 */
export const REGIONAL_AWARDS_DEFAULT =
  'Trophies for 1st · Medals 1st–3rd · GSDL-BRG Grading Cards for all classes.';

/** The awards text as one paragraph (the schedule's At-a-glance page). */
export function regionalAwardsText(awardsDescription: string | null | undefined): string {
  return awardsDescription?.trim() || REGIONAL_AWARDS_DEFAULT;
}

/** The same text as a list, one award per line (the catalogue's "Awards on
 *  offer"): the secretary's line breaks, or the default's " · " separators. */
export function regionalAwardsLines(awardsDescription: string | null | undefined): string[] {
  return regionalAwardsText(awardsDescription)
    .split(/\n+|\s+·\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}
