/**
 * Judge-contract offer link rules.
 *
 * ONE owner (CLAUDE.md "One owner per rule") for "has this judge-contract
 * offer link expired" — previously copied verbatim between the GET and POST
 * handlers of `src/app/api/judge-contract/[token]/route.ts`. A contract with
 * no `tokenExpiresAt` (legacy rows, or a contract created before the
 * expiry field existed) never expires.
 *
 * NOT the same rule as other tokens' expiry — each has its own field and its
 * own comparison, deliberately not merged here:
 *  - `invitations.expiresAt` (`src/server/trpc/routers/invitations.ts`)
 *  - `secretaryApplications`' 30-day link (`secretary-applications.ts`)
 *  - `passwordResetTokens` (`src/server/db/schema/password-reset-tokens.ts`)
 */
export function isContractOfferExpired(
  contract: { tokenExpiresAt: Date | null },
  now: Date = new Date()
): boolean {
  // Strict `>` boundary preserved from the original inline check: the exact
  // expiry instant itself still counts as valid.
  return contract.tokenExpiresAt != null && now > contract.tokenExpiresAt;
}
