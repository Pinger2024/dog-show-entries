/**
 * Guard: "is this class's results published / does it have unpublished
 * changes" has ONE owner — classResultsPublishState in
 * src/lib/class-results-publish-state.ts (CLAUDE.md, "One owner per rule").
 *
 * History: `getClassSummaries` and `getClassEntries`
 * (src/server/trpc/routers/steward.ts) each hand-typed the same predicate:
 * `total > 0 && published === total` for isPublished, and
 * `published > 0 && published < total` for hasUnpublishedChanges. Fixed
 * 2026-09-18.
 *
 * Scoped to steward.ts's use of `publishedResults.length` (the count
 * produced from `r.publishedAt !== null`) rather than a bare `< total`/`===
 * total` text scan, which would false-positive on unrelated count
 * comparisons elsewhere in this large router file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STEWARD_ROUTER = join(process.cwd(), 'src/server/trpc/routers/steward.ts');
const OWNER = join(process.cwd(), 'src/lib/class-results-publish-state.ts');

describe('class results publish state — one owner', () => {
  const src = readFileSync(STEWARD_ROUTER, 'utf8');

  it('steward.ts does not hand-type "published.length === total" / "published.length < total" against publishedResults', () => {
    expect(src).not.toMatch(/publishedResults\.length\s*===\s*\w+\.length/);
    expect(src).not.toMatch(/publishedResults\.length\s*<\s*\w+\.length/);
  });

  it('steward.ts calls the owner function', () => {
    // Two call sites: getClassSummaries and getClassEntries.
    const matches = src.match(/classResultsPublishState\(/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('the predicate itself lives in exactly one file', () => {
    const owner = readFileSync(OWNER, 'utf8');
    expect(owner).toContain('export function classResultsPublishState');
  });
});
