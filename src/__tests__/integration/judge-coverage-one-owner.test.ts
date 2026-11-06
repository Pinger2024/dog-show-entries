/**
 * Guard: "is every judging requirement on this show covered by an assigned
 * judge" has ONE owner — src/server/services/judge-coverage.ts
 * (`computeJudgeCoverage`).
 *
 * History (CLAUDE.md, "One owner per rule"): `getJudgeCoverage` (the Judge
 * Coverage dashboard) and `getChecklistAutoDetect` (the `judges_assigned`
 * checklist tick) each re-derived coverage independently and disagreed — the
 * checklist had no Special-Award-Classes lane and let any breedId===null
 * assignment match any breed, so a Special-Award-Classes-only judge ticked
 * "Judges assigned" while the dashboard still showed the breed uncovered.
 * See judge-coverage-checklist.test.ts for the behavioural proof.
 *
 * This guard fails if secretary.ts (or anything else in src/) grows a new
 * inline re-derivation of the coverage rule instead of calling
 * `computeJudgeCoverage`.
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

const ENGINE = join(SRC, 'server', 'services', 'judge-coverage.ts');
const SECRETARY_ROUTER = join(SRC, 'server', 'trpc', 'routers', 'secretary.ts');

describe('judge coverage — one owner', () => {
  it('the coverage rule itself lives in exactly one file', () => {
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export async function computeJudgeCoverage'),
    );
    expect(owners.map((f) => f.slice(SRC.length + 1))).toEqual([
      'server/services/judge-coverage.ts',
    ]);
  });

  it('getJudgeCoverage and getChecklistAutoDetect both call the shared function', () => {
    const src = readFileSync(SECRETARY_ROUTER, 'utf8');
    const getJudgeCoverageBody = src.slice(
      src.indexOf('getJudgeCoverage: secretaryProcedure'),
      src.indexOf('getChecklistAutoDetect: secretaryProcedure') > src.indexOf('getJudgeCoverage: secretaryProcedure')
        ? src.indexOf('// ─── RKC Judge Lookup')
        : src.length,
    );
    const getChecklistBody = src.slice(
      src.indexOf('getChecklistAutoDetect: secretaryProcedure'),
      src.indexOf('// ── Phase Blockers'),
    );
    expect(getJudgeCoverageBody).toContain('computeJudgeCoverage(');
    expect(getChecklistBody).toContain('computeJudgeCoverage(');
    // The checklist tick must be driven by the shared function's `allCovered`,
    // not a re-derived boolean.
    expect(getChecklistBody).toContain('.allCovered');
  });

  it('no other file re-derives coverage by building its own requiredCombos-style map over judgeAssignments', () => {
    // Scoped narrowly: a hand-rolled re-derivation of this rule looks like a
    // map keyed by breed+sex built OUTSIDE judge-coverage.ts, fed by a raw
    // judgeAssignments query and a breedMatch/sexMatch pair of comparisons.
    // A file that merely CALLS computeJudgeCoverage (or reads its `coverage`/
    // `allCovered` output) doesn't match this — only a fresh inline
    // implementation does.
    const offenders = sourceFiles(SRC).filter((f) => {
      if (f === ENGINE) return false;
      const src = readFileSync(f, 'utf8');
      const hasBreedSexMatchPair = /breedMatch/.test(src) && /sexMatch/.test(src);
      const hasOwnRequirementMap = /requiredCombos|requirementsMap/.test(src);
      return hasBreedSexMatchPair && hasOwnRequirementMap;
    });
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});
