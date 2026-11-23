/**
 * The SV/WUSV classes that demand the health triad (hip, elbow, DNA): SV
 * Yearling and up. Junior does NOT (Amanda 2026-07-18 — it's Yearling
 * onwards, not Junior).
 *
 * The rest of what a regional entry needs — and whether any of it applies to
 * a given entry — is decided in one place, `entryRequirements`
 * (lib/entry-requirements.ts). This file used to hold a second copy of that
 * rule (svEntryMissingRequirements) which the server ran instead of the
 * wizard's; removed 29 Sept 2026.
 */
import { formatLondonShortDate } from './date-utils';

/** DB class-definition names from Yearling up, where health data is required. */
export const SV_HEALTH_FROM_CLASSES = new Set([
  'SV Yearling',
  'Adult',
  'Working',
]);

/**
 * Character assessment (WB) is required to enter these classes when the dog
 * was born on or after SV_WB_BORN_ON_OR_AFTER (Mandy 2026-10-09, confirming the
 * BRG rule from secretary Shirley Hutchinson: from 1/1/27, dogs born on or
 * after 1/1/2025 entering Adult need WB — and Working too, same date, as the
 * regional schedule already prints). WB can only be sat at 9-13 months, so
 * older dogs are exempt.
 */
export const SV_WB_REQUIRED_CLASSES: readonly string[] = ['Adult', 'Working'];

/** Date-only (YYYY-MM-DD) birth date from which SV_WB_REQUIRED_CLASSES apply. */
export const SV_WB_BORN_ON_OR_AFTER = '2025-01-01';

/** The rule above in words, for the owner beside the WB tick — built from the
 *  same two constants so the sentence can't drift from what entry enforces:
 *  "WB is needed to enter Adult for dogs born on or after 1 January 2025." */
export function svWbRequirementSentence(): string {
  const classes = SV_WB_REQUIRED_CLASSES.join(' or ');
  return `WB is needed to enter ${classes} for dogs born on or after ${formatLondonShortDate(SV_WB_BORN_ON_OR_AFTER)}.`;
}
