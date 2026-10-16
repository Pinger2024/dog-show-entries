/**
 * Show statuses the public is allowed to see and filter by.
 *
 * draft and cancelled are deliberately absent: a club's unannounced draft
 * shows (including secretary contact details) must never be enumerable by
 * other clubs or the public. This single source drives BOTH the
 * `shows.list` input enum (server) and the Browse Shows filter dropdown
 * (client) — change it here and both stay in step.
 */
export const PUBLIC_SHOW_STATUSES = [
  'published',
  'entries_open',
  'entries_closed',
  'in_progress',
  'completed',
] as const;

export type PublicShowStatus = (typeof PUBLIC_SHOW_STATUSES)[number];
