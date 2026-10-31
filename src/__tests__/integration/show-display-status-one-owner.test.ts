/**
 * Guard: "what status should this show DISPLAY as" has ONE owner —
 * `effectiveShowStatus` in src/lib/show-status.ts.
 *
 * History (CLAUDE.md, "One owner per rule"): a show's DB `status` only
 * flips from 'entries_open' to 'entries_closed' via a once-daily cron, so
 * between the close instant and the cron running the DB still says
 * 'entries_open'. The public Browse Shows list (shows-list.tsx) grew a
 * display-only fix for this in isolation; by 2026-09-18 the same rule had
 * been hand-written again in the secretary dashboard, the show lifecycle
 * banner, the public show page's metadata + preview, and both share-image
 * renderers (opengraph-image.tsx and share-image-data.ts) — some of them
 * disagreeing on the boundary. Consolidated into `effectiveShowStatus`,
 * which every one of those sites now calls.
 *
 * Two things are checked:
 *   1. The known display sites import the helper (fails if one stops).
 *   2. No file under src/app or src/components writes the rule down again —
 *      i.e. compares `entryCloseDate` against "now" with a relational
 *      operator to decide what to display.
 *
 * Scoping note on (2): a countdown ("closes in 3 days") or an hours-to-close
 * banding computation is NOT the same rule — it doesn't decide open/closed,
 * it only formats a number for a show already known to be open. Those use
 * `differenceInDays(...)` or compute a plain `hoursToClose`/`closeDateMs`
 * value with no comparison operator, so they don't match this pattern. What
 * the pattern catches is `entryCloseDate` compared with `<`, `<=`, `>` or
 * `>=` against `Date.now()`/`now` (in either order) — that comparison IS the
 * open/closed decision, and it belongs in show-status.ts alone.
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
    } else if (/\.tsx?$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

const KNOWN_DISPLAY_SITES = [
  'components/shows/shows-list.tsx',
  'app/(secretary)/secretary/page.tsx',
  'app/(secretary)/secretary/shows/[id]/_components/lifecycle-banner.tsx',
  'app/(secretary)/secretary/shows/[id]/layout.tsx',
  'app/(shows)/shows/[id]/page.tsx',
  'app/(shows)/shows/[id]/preview/show-preview.tsx',
  'app/(shows)/shows/[id]/opengraph-image.tsx',
  'lib/share-image-data.ts',
];

describe('show display status — one owner', () => {
  // Public labels call publicShowStatus (5 Oct 2026), which is effectiveShowStatus
  // plus "a show on its own day reads as live" — same module, same owner.
  it('every known display site imports effectiveShowStatus or publicShowStatus', () => {
    for (const rel of KNOWN_DISPLAY_SITES) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      expect(src, `${rel} should import effectiveShowStatus or publicShowStatus from @/lib/show-status`).toMatch(
        /import \{[^}]*\b(effectiveShowStatus|publicShowStatus)\b[^}]*\} from '@\/lib\/show-status'/
      );
    }
  });

  it('the derivation rule itself lives in exactly one file', () => {
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export function effectiveShowStatus')
    );
    expect(owners.map((f) => f.slice(SRC.length + 1))).toEqual(['lib/show-status.ts']);
  });

  it('no file under src/app or src/components re-derives it inline from entryCloseDate vs now', () => {
    // Catches `entryCloseDate ... < Date.now()` (and <=, >, >=, either operand
    // order). Deliberately does NOT match plain countdown math (differenceInDays,
    // or a bare `.getTime()`/`Date.now()` with no relational comparison) — see
    // the file doc comment above.
    const VIOLATION = /entryCloseDate[^;\n]{0,80}(<=|>=|<|>)\s*(Date\.now\(\)|now(?:\.getTime\(\))?)|(Date\.now\(\)|now(?:\.getTime\(\))?)\s*(<=|>=|<|>)[^;\n]{0,80}entryCloseDate/;

    const offenders: string[] = [];
    for (const dir of ['app', 'components']) {
      for (const file of sourceFiles(join(SRC, dir))) {
        const src = readFileSync(file, 'utf8');
        if (VIOLATION.test(src)) {
          offenders.push(file.slice(SRC.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
