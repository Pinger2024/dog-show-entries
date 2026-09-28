/**
 * Guard: the RKC multi-dog package counts an exhibitor's earlier dogs through
 * ONE owner, and every path that prices with the package uses it.
 *
 * History (CLAUDE.md, "One owner per rule"): the regional scale was taught on
 * 18 Sept that a dog entered later is still the exhibitor's 3rd dog
 * (regional-pricing-one-owner.test.ts). The RKC package was not — checkout,
 * entry edit, manual entry and the enter-page preview each priced only the
 * dogs in front of them, and Ann Robinson paid £18 for a 4th dog the North
 * Eastern package covered (Mandy, 28 Sept 2026).
 *
 * Fails if a caller of `computeOrderFees` that can apply a package appears
 * without `prior`, or if the counting rule is written down a second time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

const rel = (f: string) => f.slice(SRC.length + 1);
const ENGINE = 'lib/fee-calc.ts';
/** The class-picker running total: one dog, package switched off by design
 *  (multiDogThreshold: null) — see computeClassSelectionTotal's doc comment. */
const NO_PACKAGE = 'app/(shows)/shows/[id]/enter/use-entry-cart.ts';

describe('RKC package pricing — one owner', () => {
  const callers = sourceFiles(SRC).filter(
    (f) => rel(f) !== ENGINE && readFileSync(f, 'utf8').includes('computeOrderFees('),
  );

  it('finds the known callers', () => {
    expect(callers.map(rel).sort()).toEqual([
      'app/(shows)/shows/[id]/enter/page.tsx',
      'app/(shows)/shows/[id]/enter/use-entry-cart.ts',
      'server/trpc/routers/entries.ts',
      'server/trpc/routers/orders.ts',
      'server/trpc/routers/secretary.ts',
    ]);
  });

  for (const file of callers.filter((f) => rel(f) !== NO_PACKAGE)) {
    it(`${rel(file)} passes the exhibitor's earlier dogs into the package`, () => {
      const src = readFileSync(file, 'utf8');
      // The fee context's `prior` must be filled from the one owner: server
      // paths call it directly; the enter page reads it over tRPC
      // (entries.packagePriorStanding), which calls the same function.
      const handsOver =
        /prior:\s*await priorPackageStanding\(/.test(src) || /prior:\s*packagePriorStanding\b/.test(src);
      expect(handsOver).toBe(true);
    });
  }

  it('the class-picker running total never applies a package', () => {
    const src = readFileSync(join(SRC, NO_PACKAGE), 'utf8');
    expect(src).toMatch(/multiDogThreshold:\s*null/);
  });

  it('the counting rule itself lives in exactly one file', () => {
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export async function priorPackageStanding'),
    );
    expect(owners.map(rel)).toEqual(['server/services/package-pricing.ts']);
  });

  it('the regional scale and the RKC package share one rule for which earlier entries count', () => {
    const pkg = readFileSync(join(SRC, 'server/services/package-pricing.ts'), 'utf8');
    const regional = readFileSync(join(SRC, 'server/services/regional-pricing.ts'), 'utf8');
    expect(pkg).toContain('heldPlaceConditions(');
    expect(regional).toContain('heldPlaceConditions(');
    // Nobody re-types the exclusions.
    expect(pkg).not.toContain("'withdrawn'");
  });
});
