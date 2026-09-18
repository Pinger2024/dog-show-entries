/**
 * Guard: "a judge-contract offer link has expired" has ONE owner (CLAUDE.md,
 * "One owner per rule").
 *
 * History: `contract.tokenExpiresAt && new Date() > contract.tokenExpiresAt`
 * was copied verbatim between the GET and POST handlers of
 * src/app/api/judge-contract/[token]/route.ts. Consolidated 2026-09-18 into
 * `isContractOfferExpired` in src/lib/judge-contract-offer.ts; both handlers
 * call it.
 *
 * This test fails if a third hand-rolled comparison of `.tokenExpiresAt`
 * against `new Date()` appears outside the owner — i.e. someone writes the
 * rule down again instead of importing it.
 *
 * Scoping note: this matches specifically on `.tokenExpiresAt` being compared
 * to `new Date()` (the judge-contract offer field), not on `expiresAt`/other
 * token-expiry fields in general — invitations.expiresAt,
 * secretaryApplications' 30-day link, and passwordResetTokens are DIFFERENT
 * tokens with their OWN expiry fields and comparisons (confirmed by grep;
 * left alone, not merged into this rule) and must not trip this guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER = join(SRC, 'lib', 'judge-contract-offer.ts');

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

// Matches a hand-rolled `.tokenExpiresAt` vs `new Date()` comparison,
// specifically (not any generic expiresAt field), in either operand order.
const HAND_ROLLED_EXPIRY =
  /new Date\(\)\s*>\s*[\w.?]*tokenExpiresAt|[\w.?]*tokenExpiresAt[\s\S]{0,20}?<\s*new Date\(\)/;

describe('judge-contract offer expiry — one owner', () => {
  it('only judge-contract-offer.ts defines isContractOfferExpired', () => {
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export function isContractOfferExpired'),
    );
    expect(owners).toEqual([OWNER]);
  });

  it('no file outside the owner hand-rolls the tokenExpiresAt comparison', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => f !== OWNER)
      .filter((f) => HAND_ROLLED_EXPIRY.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('both judge-contract route handlers import and call the owner', () => {
    const src = readFileSync(
      join(SRC, 'app', 'api', 'judge-contract', '[token]', 'route.ts'),
      'utf8',
    );
    expect(src).toMatch(/from ['"]@\/lib\/judge-contract-offer['"]/);
    const calls = src.match(/isContractOfferExpired\(/g) ?? [];
    // GET and POST each call it once.
    expect(calls.length).toBe(2);
  });
});
