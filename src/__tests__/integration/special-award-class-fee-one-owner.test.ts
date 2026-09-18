/**
 * Guard: "which classes charge their own flat fee instead of the
 * first/subsequent tier" has ONE owner (CLAUDE.md, "One owner per rule").
 *
 * History: four fee sites — orders.checkout, entries.update (new classes AND
 * sibling classes), secretary.createManualEntry, and the enter-page client
 * fee preview — each hand-rolled `classDefinition.type === 'special' ?
 * entryFee : null`. That's the wrong predicate: `type: 'special'` is a
 * broader bucket than Special Award Classes — production carries nine other
 * `type: 'special'` definitions (Special Beginners, Any Variety Not
 * Separately Classified, Variety Class, Good Citizen Dog Scheme, Rare
 * Breeds, …) that are ORDINARY classes for pricing. Co-founder ruling
 * 2026-07-19: only a real Special Award Class (type 'special' AND name
 * starting "Special Award Class") is exempt from the tier — that's
 * `isSpecialAwardClass`/`specialAwardClassFee` in src/lib/class-labels.ts.
 *
 * This test fails if:
 *   1. a hand-rolled `type === 'special' ? … entryFee … : null` ternary
 *      reappears anywhere under src/ (a second copy of the rule), or
 *   2. any of the four known fee files stops referencing the helper.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

/** Every .ts/.tsx file under src/, excluding tests and the owner module itself. */
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

const OWNER = join(SRC, 'lib', 'class-labels.ts');

const FEE_SITES = [
  'server/trpc/routers/orders.ts',
  // entries.update's pricing moved into this service on 2026-09-18 (the
  // entry-change one-owner fix), taking its specialAwardClassFee calls with it.
  'server/services/entry-change-pricing.ts',
  'server/trpc/routers/secretary.ts',
  'app/(shows)/shows/[id]/enter/page.tsx',
];

describe('special award class fee — one owner', () => {
  it('no file hand-rolls a type-only special-fee ternary', () => {
    // Matches the exact bug pattern: `type === 'special' ? ... entryFee`
    // (any whitespace/parens/ternary-else between). Excludes the owner file,
    // which is allowed to test `type === 'special'` as part of the real
    // predicate (it also checks the class NAME).
    const pattern = /type\s*===\s*['"]special['"]\s*\?[^;]*entryFee/;
    const offenders = sourceFiles(SRC)
      .filter((f) => f !== OWNER)
      .filter((f) => pattern.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length + 1));

    expect(offenders).toEqual([]);
  });

  for (const rel of FEE_SITES) {
    it(`${rel} prices Special Award Classes through the one owner`, () => {
      const src = readFileSync(join(SRC, rel), 'utf8');
      const usesOwner =
        src.includes('specialAwardClassFee(') || src.includes('isSpecialAwardClass(');
      expect(usesOwner).toBe(true);
    });
  }

  it('the predicate + fee helper live in exactly one file', () => {
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export function specialAwardClassFee('),
    );
    expect(owners.map((f) => f.slice(SRC.length + 1))).toEqual(['lib/class-labels.ts']);
  });
});
