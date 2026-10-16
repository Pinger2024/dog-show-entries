/**
 * Guard: "does this entry count" — CONFIRMED and not soft-deleted — has ONE
 * owner, {@link isLiveEntry} in `src/lib/entry-counts.ts`.
 *
 * History (CLAUDE.md, "One owner per rule"): this predicate was hand-typed as
 * `ec.entry.status === 'confirmed' && !ec.entry.deletedAt` (and the inverted
 * guard-clause form) about 9 times across judges' book, results-approval,
 * prize cards, ring board, the results/steward routers and the document
 * renderers. All copies were behaviourally identical today; the risk is
 * drift. Consolidated 2026-09-18 into `isLiveEntry`.
 *
 * This test fails if a *new* inline copy of the pattern appears anywhere
 * under src/ other than the owner file — i.e. if someone writes the rule
 * down again instead of calling `isLiveEntry`.
 *
 * Scoping, to avoid false positives:
 *  - Only looks for the two concrete shapes the duplicated rule actually
 *    took: `X.status === 'confirmed' && ... !Y.deletedAt` (the `&&` form)
 *    and `X.status !== 'confirmed' || Y.deletedAt` (the inverted
 *    guard-clause form used once in steward.ts). Drizzle/SQL `where`
 *    clauses express the rule with `eq(entries.status, 'confirmed')` +
 *    `isNull(entries.deletedAt)` — a different mechanism (a query, not an
 *    in-memory check) — and never match `=== 'confirmed'`/`!== 'confirmed'`,
 *    so they are not flagged. Those are a deliberately separate,
 *    unaudited-by-this-test list (see the register in this task's commit
 *    message).
 *  - Deliberately does NOT flag a bare `deletedAt` check that merely
 *    happens to sit near an unrelated `status === 'confirmed'` (e.g. a
 *    shared "skip soft-deleted rows" guard at the top of a multi-status
 *    loop, or a status check on a WRITE path deciding what to transition
 *    a row TO) — those are a different predicate, not this rule, and were
 *    found and intentionally left alone during the 2026-09-18 consolidation
 *    (`server/services/show-metrics.ts`, `app/api/webhooks/stripe/route.ts`).
 *    Only the exact `&&`/`||` combination — the same expression on the same
 *    object — counts as a copy of the rule.
 *  - Plain `status === 'confirmed'` checks with NO deletedAt combined via
 *    `&&`/`||` are not this rule and are intentionally not flagged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER = join(SRC, 'lib', 'entry-counts.ts');

/** Every .ts/.tsx file under src/, excluding tests and the owner itself. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(name) && full !== OWNER) {
      acc.push(full);
    }
  }
  return acc;
}

// The two concrete shapes the duplicated rule took in the codebase before
// 2026-09-18 (any receiver — `entry.status`, `ec.entry.status`, `e.status`,
// and correspondingly `ec.entry.deletedAt`, `entry.deletedAt`, ...):
//   1. `X.status === 'confirmed' && ... !X.deletedAt`  (short && gap only —
//      an inline comment may sit between them, so allow a modest gap, but
//      NOT an unrelated multi-statement block).
//   2. `X.status !== 'confirmed' || X.deletedAt`  (inverted guard clause).
const AND_FORM = /\.status\s*===\s*['"]confirmed['"][\s\S]{0,120}?&&[\s\S]{0,120}?!\S*\.deletedAt/g;
const OR_GUARD_FORM = /\.status\s*!==\s*['"]confirmed['"]\s*\|\|\s*\S*\.deletedAt/g;

function findInlineCopies(src: string): number[] {
  const hits: number[] = [];
  for (const m of src.matchAll(AND_FORM)) hits.push(m.index!);
  for (const m of src.matchAll(OR_GUARD_FORM)) hits.push(m.index!);
  return hits;
}

describe('live-entry — one owner', () => {
  it('isLiveEntry is defined exactly once', () => {
    const owners = sourceFiles(join(SRC)).concat(OWNER).filter((f) =>
      readFileSync(f, 'utf8').includes('export function isLiveEntry')
    );
    expect(owners).toEqual([OWNER]);
  });

  it('no file other than the owner hand-types the confirmed+not-deleted check', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, 'utf8');
      const hits = findInlineCopies(src);
      if (hits.length > 0) {
        offenders.push(`${file.slice(SRC.length + 1)} (${hits.length} occurrence(s))`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
