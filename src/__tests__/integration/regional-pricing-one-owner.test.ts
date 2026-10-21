/**
 * Guard: the regional scale has ONE owner, and every path that prices a
 * regional entry uses it.
 *
 * History (CLAUDE.md, "One owner per rule"): the regional fee engine was fed by
 * three hand-built call sites — checkout, entry edit and secretary manual entry
 * — plus the client fee preview. Each counted only the dogs in front of it, so
 * the multi-dog scale silently restarted for a dog entered later, and manual
 * entry never ran the regional engine at all. Fixed 2026-09-16 by routing every
 * path through `countPriorRegionalPayingDogs`.
 *
 * This test fails if a new caller of `computeRegionalOrderFees` appears without
 * the prior-dog count — i.e. if someone writes the rule down a fourth time.
 *
 * 2026-09-18: `entries.update`'s call moved into the extracted
 * `priceEntryClassChange` (src/server/services/entry-change-pricing.ts) — see
 * entry-change-pricing-one-owner.test.ts — so it now shows up here under that
 * file instead of entries.ts. `entries.update` and `entries.previewUpdate`
 * both still price a class change through it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

/** Every .ts/.tsx file under src/, excluding tests and the engine itself. */
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

const ENGINE = join(SRC, 'lib', 'regional-fee-calc.ts');

describe('regional pricing — one owner', () => {
  const callers = sourceFiles(SRC).filter(
    (f) => f !== ENGINE && readFileSync(f, 'utf8').includes('computeRegionalOrderFees('),
  );

  it('finds the known callers', () => {
    const rel = callers.map((f) => f.slice(SRC.length + 1)).sort();
    expect(rel).toEqual([
      'app/(shows)/shows/[id]/enter/page.tsx',
      'server/services/entry-change-pricing.ts',
      'server/services/manual-entry-pricing.ts',
      'server/trpc/routers/orders.ts',
    ]);
  });

  for (const file of callers) {
    it(`${file.slice(SRC.length + 1)} passes the exhibitor's existing dogs into the scale`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('priorPayingDogCount');
      // Server paths must take the count from the one owner; the client preview
      // reads it over tRPC (entries.regionalPriorDogCount), which calls the same
      // function server-side.
      const usesOwner =
        src.includes('countPriorRegionalPayingDogs') ||
        src.includes('regionalPriorDogCount');
      expect(usesOwner).toBe(true);
    });
  }

  it('the counting rule itself lives in exactly one file', () => {
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export async function countPriorRegionalPayingDogs'),
    );
    expect(owners.map((f) => f.slice(SRC.length + 1))).toEqual([
      'server/services/regional-pricing.ts',
    ]);
  });
});
