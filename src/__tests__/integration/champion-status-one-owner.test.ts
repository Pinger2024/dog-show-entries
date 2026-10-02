/**
 * Guard: "is this dog a (show) champion" has ONE owner —
 * `src/lib/dog-champion-status.ts` — and every path that needs it calls
 * `isShowChampion` (class-eligibility: bars a champion from every
 * achievement class except Open) or `isRkcChampion` (the narrower "is this
 * an RKC Champion/Show Champion" used by the dashboard title-progress
 * tracker), never a hand-rolled `.title === 'ch'` / `.some((t) => t.title...)`
 * check.
 *
 * History (Mandy, 21 Sept 2026): `dogs.getWinSummary` only ever looked at
 * `achievements` rows for "has this dog won a CC", so a Champion with no
 * Remi win history (an import, or simply new to Remi) was told it was
 * eligible for every achievement class instead of Open only. A second,
 * narrower "is this a Champion" check already existed independently in
 * `dashboard.ts` (`dogTitlesList.some((t) => t.title === 'ch')`) — exactly
 * the shape CLAUDE.md's "One owner per rule" warns will drift.
 *
 * This test fails if a THIRD hand-rolled champion check appears anywhere
 * in src/ outside the owning module.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER = join(SRC, 'lib', 'dog-champion-status.ts');

/** Every .ts/.tsx file under src/, excluding tests and the owning module. */
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

// Patterns that shape a hand-rolled champion/title check — the same shape
// dashboard.ts and getWinSummary each wrote independently before this fix.
const SHADOW_PATTERNS: RegExp[] = [
  /title\s*===\s*['"]ch['"]/,
  /title\s*===\s*['"]sh_ch['"]/,
  /\.some\(\s*\(?[a-zA-Z0-9_]*\)?\s*=>\s*[a-zA-Z0-9_.]*\.title\s*===/,
];

describe('champion status — one owner', () => {
  it('the check itself lives in exactly one file', () => {
    const owners = sourceFiles(SRC, []).concat(OWNER).filter((f) =>
      readFileSync(f, 'utf8').includes('export function isShowChampion'),
    );
    expect(owners.map((f) => f.slice(SRC.length + 1))).toEqual([
      'lib/dog-champion-status.ts',
    ]);
  });

  it('no file outside the owner hand-rolls a title/champion check', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, 'utf8');
      if (SHADOW_PATTERNS.some((re) => re.test(src))) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('getWinSummary and the dashboard tracker both call the one owner', () => {
    const dogsSrc = readFileSync(join(SRC, 'server/trpc/routers/dogs.ts'), 'utf8');
    const dashboardSrc = readFileSync(join(SRC, 'server/trpc/routers/dashboard.ts'), 'utf8');
    expect(dogsSrc).toContain('isShowChampion');
    expect(dashboardSrc).toContain('isRkcChampion');
  });
});
