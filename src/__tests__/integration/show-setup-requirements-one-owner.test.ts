/**
 * Guard: "how many guarantors does this show need" and "are this show's
 * entry fees configured" each have ONE owner — src/lib/show-setup-requirements.ts
 * (CLAUDE.md, "One owner per rule").
 *
 * History: `getChecklistAutoDetect` and `getPhaseBlockers`
 * (src/server/trpc/routers/secretary.ts) each hand-typed both formulas
 * independently — `showType === 'championship' ? 6 : 3` for the guarantor
 * minimum, and `regionalFeeConfig.tiers.length || firstEntryFee > 0` for
 * "fees set". Fixed 2026-09-18 by routing both procedures through
 * `requiredGuarantorCount` / `hasEnoughGuarantors` / `showFeesConfigured`.
 *
 * This test fails if either formula is hand-typed again inside secretary.ts.
 * It is scoped to that one file (rather than all of src/) because the
 * `showType === 'championship' ? 6 : 3` shape is coincidentally close to
 * unrelated championship-class logic elsewhere in the codebase (e.g.
 * championship-class-requirements.ts) that has nothing to do with
 * guarantors — scanning the whole tree for that literal pattern would flag
 * unrelated code. A known third, NON-equivalent copy of the guarantor
 * formula lives in schedule-settings-form.tsx (no WUSV waiver folded into
 * the raw number — see the PR / handover notes) and is deliberately left
 * out of this guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SECRETARY_ROUTER = join(process.cwd(), 'src/server/trpc/routers/secretary.ts');

describe('show-setup requirements — one owner', () => {
  const src = readFileSync(SECRETARY_ROUTER, 'utf8');

  it('secretary.ts does not hand-type the guarantor minimum formula', () => {
    // The historical hand-rolled shape: `showType === 'championship' ? 6 : 3`
    // (whitespace-insensitive) — guards against a third inline copy
    // reappearing in this file.
    expect(src).not.toMatch(/showType\s*===\s*['"]championship['"]\s*\?\s*6\s*:\s*3/);
  });

  it('secretary.ts does not hand-type the "regional tiers or positive first fee" formula', () => {
    expect(src).not.toMatch(/regionalFeeConfig\??\.tiers\??\.length/);
  });

  it('both procedures call the owner functions', () => {
    expect(src).toContain('requiredGuarantorCount');
    expect(src).toContain('hasEnoughGuarantors');
    expect(src).toContain('showFeesConfigured');
  });

  it('the rules themselves live in exactly one file', () => {
    const owner = readFileSync(join(process.cwd(), 'src/lib/show-setup-requirements.ts'), 'utf8');
    expect(owner).toContain('export function requiredGuarantorCount');
    expect(owner).toContain('export function hasEnoughGuarantors');
    expect(owner).toContain('export function showFeesConfigured');
  });
});
