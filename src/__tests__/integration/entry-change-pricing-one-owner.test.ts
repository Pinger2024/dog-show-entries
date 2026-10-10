/**
 * Guard: "what does changing the classes on an existing entry cost" has ONE
 * owner — `priceEntryClassChange` (src/server/services/entry-change-pricing.ts).
 *
 * History (CLAUDE.md, "One owner per rule"): `entries.update` priced a class
 * change with the shared fee engines while the edit page
 * (src/app/(shows)/shows/[id]/entries/[entryId]/edit/page.tsx) computed its
 * own `newTotal` as a raw SUM of each selected class's `entryFee` — wrong
 * whenever first/subsequent tiers, the regional scale, a discount group or
 * the multi-dog package applied, and the top-up payment screen showed that
 * wrong client figure while Stripe charged the correct server figure.
 *
 * This test fails if either tRPC caller (`update`, `previewUpdate`) stops
 * calling the shared function, or if the edit page starts hand-summing class
 * fees again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const ENTRIES_ROUTER = join(SRC, 'server', 'trpc', 'routers', 'entries.ts');
const PRICING_OWNER = join(SRC, 'server', 'services', 'entry-change-pricing.ts');
const EDIT_PAGE = join(
  SRC,
  'app',
  '(shows)',
  'shows',
  '[id]',
  'entries',
  '[entryId]',
  'edit',
  'page.tsx',
);

describe('entry class-change pricing — one owner', () => {
  it('the pricing rule itself lives in exactly one file', () => {
    const src = readFileSync(PRICING_OWNER, 'utf8');
    expect(src).toContain('export async function priceEntryClassChange');
  });

  it('entries.ts `update` calls the extracted pricing function', () => {
    const src = readFileSync(ENTRIES_ROUTER, 'utf8');
    // Must import and call the one owner.
    expect(src).toMatch(/import\s*\{\s*priceEntryClassChange\s*\}\s*from\s*['"]@\/server\/services\/entry-change-pricing['"]/);
    const updateBody = src.slice(src.indexOf('update: protectedProcedure'), src.indexOf('previewUpdate:'));
    expect(updateBody).toContain('priceEntryClassChange(');
    // The rule itself (the fee engines) must NOT be re-implemented inline in
    // the router any more — that would be a second copy.
    expect(updateBody).not.toContain('computeOrderFees(');
    expect(updateBody).not.toContain('computeRegionalOrderFees(');
  });

  it('entries.ts `previewUpdate` calls the extracted pricing function and performs no writes', () => {
    const src = readFileSync(ENTRIES_ROUTER, 'utf8');
    const start = src.indexOf('previewUpdate: protectedProcedure');
    expect(start).toBeGreaterThan(-1);
    // previewUpdate is the last procedure before validateExhibitorForEntry's
    // section comment in this router; slice to the next top-level query.
    const end = src.indexOf('validateExhibitorForEntry:');
    const previewBody = src.slice(start, end);
    expect(previewBody).toContain('priceEntryClassChange(');
    expect(previewBody).not.toMatch(/ctx\.db\.(update|insert|delete)\(/);
  });

  it('the edit page does not compute a price — it uses previewUpdate', () => {
    const src = readFileSync(EDIT_PAGE, 'utf8');
    expect(src).toContain('previewUpdate');
    // No client-side sum of class entryFee — that was the second (wrong) owner.
    expect(src).not.toMatch(/\.reduce\(\s*\([^)]*\)\s*=>\s*[^,]*\+\s*[^,]*\.?entryFee/);
    expect(src).not.toMatch(/sum\s*\+\s*sc\.entryFee/);
  });
});
