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

/** DB class-definition names from Yearling up, where health data is required. */
export const SV_HEALTH_FROM_CLASSES = new Set([
  'SV Yearling',
  'Adult',
  'Working',
]);
