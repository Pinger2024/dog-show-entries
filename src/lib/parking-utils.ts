/**
 * SQL ILIKE-style substring patterns used as a coarse DB-level pre-filter
 * when scanning for parking sundry items across many orders (see the
 * week-before cron branch in `src/app/api/cron/route.ts`). ILIKE has no
 * word-boundary support, so a name like "Sparking Wine" would still pass
 * this filter — callers MUST re-check every candidate with
 * `isParkingSundry()` (the authoritative, word-boundary-safe matcher) before
 * ever treating an order as a genuine parking-pass purchase. Never trust
 * this pattern alone to decide whether to send/render a pass.
 */
export const PARKING_NAME_PATTERNS = ['%parking%', '%car%pass%'] as const;

/**
 * Word-boundary, case-insensitive check for whether a sundry item name
 * refers to a parking pass — the ONE authoritative matcher (client-side
 * equivalent of `PARKING_NAME_PATTERNS`, but correct where ILIKE isn't).
 * "Sparking Wine" contains the substring "parking" but must NOT match —
 * clubs are free to sell an actual sparkling wine sundry alongside a
 * parking pass without the two being confused.
 */
export function isParkingSundry(name: string): boolean {
  return /\bparking\b/i.test(name) || /\bcar\s*pass\b/i.test(name);
}
