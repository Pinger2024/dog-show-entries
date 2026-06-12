import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Static guard for the 2026-06-12 bank-details leak (see
 * src/server/trpc/public-org-columns.ts and public-data-privacy.test.ts).
 *
 * `organisation: true` in a tRPC router joins the FULL organisations row —
 * including payout bank details and Stripe IDs — into the response payload.
 * Public and exhibitor-facing queries must use
 * `organisation: { columns: publicOrgColumns }` instead.
 *
 * public-data-privacy.test.ts pins the procedures that were fixed; this
 * scan catches the NEXT procedure someone writes with an unscoped join.
 * Like mobile-overflow.test.ts, it's a blunt instrument with a precise
 * allowlist — if it fails on legitimately secretary-scoped code, scope the
 * join anyway (costs nothing) or extend the allowlist with a justification.
 */

const ROUTERS_DIR = join(__dirname, '..', 'server', 'trpc', 'routers');

// file → number of `organisation: true` joins that are known-safe.
const ALLOWED: Record<string, { count: number; reason: string }> = {
  'secretary.ts': {
    count: 14,
    reason:
      'secretaryProcedure + verifyShowAccess/org scoping — a club may see its own payout details',
  },
  'steward.ts': {
    count: 1,
    reason:
      'submitForJudgeApproval uses the org row server-side to render an email; nothing returns it',
  },
};

describe('no unscoped organisation joins in tRPC routers', () => {
  const files = readdirSync(ROUTERS_DIR).filter((f) => f.endsWith('.ts'));

  for (const file of files) {
    it(`${file} only joins full organisation rows where allowlisted`, () => {
      const src = readFileSync(join(ROUTERS_DIR, file), 'utf8');
      const matches = src.match(/organisation:\s*true/g) ?? [];
      const allowed = ALLOWED[file]?.count ?? 0;

      expect(
        matches.length,
        `${file} has ${matches.length} \`organisation: true\` join(s) but only ` +
          `${allowed} allowlisted. Use \`organisation: { columns: publicOrgColumns }\` ` +
          `for anything public/exhibitor-facing (payout bank details must never ` +
          `leave secretary scope), or extend the allowlist with a justification.`
      ).toBeLessThanOrEqual(allowed);
    });
  }
});
