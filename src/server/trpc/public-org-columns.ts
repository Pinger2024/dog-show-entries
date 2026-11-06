/**
 * Columns of `organisations` that are safe to include in public and
 * exhibitor-facing payloads (show pages, entries, orders, live results).
 *
 * Payout bank details (account name / sort code / account number) and
 * Stripe identifiers must only ever leave the server through
 * secretary/admin-scoped procedures such as `secretary.getPayoutDetails`.
 * Never use `organisation: true` in a public or exhibitor-facing query —
 * use `organisation: { columns: publicOrgColumns }` instead.
 */
export const publicOrgColumns = {
  id: true,
  name: true,
  kcRegNumber: true,
  type: true,
  breedId: true,
  contactEmail: true,
  contactPhone: true,
  website: true,
  showRuleset: true,
  logoUrl: true,
  logoColorPrimary: true,
  logoColorSecondary: true,
  logoMonochrome: true,
} as const;
