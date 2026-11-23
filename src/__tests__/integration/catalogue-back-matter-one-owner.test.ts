/**
 * Guard: which back-of-book pages a catalogue prints (the Best Awards
 * write-in page, the Not For Competition list, the exhibitor index) is
 * decided in exactly ONE place — `catalogueBackMatter()` in
 * `src/lib/catalogue-back-matter.ts`. Before that module existed the
 * answer was written three times and disagreed (see that file's header,
 * and CLAUDE.md's "One owner per rule" — regional Best Awards page,
 * 22 Sept 2026).
 *
 * This test fails if either:
 *  1. Any renderer wraps one of the three page components in its own
 *     `isSvShow` / `showRuleset` condition instead of going through
 *     `catalogueBackMatter()` — a second copy of the rule.
 *  2. Any renderer uses one of the three page components at all without
 *     also calling `catalogueBackMatter(` somewhere in the same file —
 *     i.e. rendering it unconditionally, bypassing the owner.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER_FILE = join(SRC, 'lib', 'catalogue-back-matter.ts');
const PAGE_COMPONENTS = ['BestsWriteInPage', 'NotForCompetitionPage', 'ExhibitorIndexPage'];

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      tsxFiles(full, acc);
    } else if (name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

describe('catalogue back matter — one owner for which pages print', () => {
  it('no renderer re-derives isSvShow/showRuleset around a back-matter page component', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      // The components' own definition file (catalogue-front-matter.tsx)
      // legitimately mentions showRuleset inside BestsWriteInPage's own
      // body (threading it into buildBestAwards) — that's not a second
      // copy of THIS rule (which pages print), so it's not scanned here.
      if (file.endsWith(`${join('catalogue', 'catalogue-front-matter.tsx')}`)) continue;

      const src = readFileSync(file, 'utf8');
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const comp of PAGE_COMPONENTS) {
          if (!line.includes(`<${comp}`)) continue;
          // Look at this line plus a small window above it for the JSX
          // conditional that guards the tag, e.g.
          // `{!isSvShow && <BestsWriteInPage .../>}`.
          const windowStart = Math.max(0, i - 2);
          const context = lines.slice(windowStart, i + 1).join('\n');
          if (/isSvShow|showRuleset/.test(context)) {
            offenders.push(
              `${file.slice(SRC.length + 1)}:${i + 1}: <${comp}> guarded by a local isSvShow/showRuleset check instead of catalogueBackMatter()`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every renderer of a back-matter page component calls catalogueBackMatter()', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      // catalogue-front-matter.tsx defines the page components (and the
      // createBreedIndexRenderer HELPER, which renders ExhibitorIndexPage
      // from an `enabled` boolean its CALLER already computed) — the owner
      // call belongs at each call site below, not inside the shared helper.
      if (file.endsWith(`${join('catalogue', 'catalogue-front-matter.tsx')}`)) continue;

      const src = readFileSync(file, 'utf8');
      // `createBreedIndexRenderer(` is the indirect path to ExhibitorIndexPage
      // (per-breed, multi-breed championship shows) — a call site that skips
      // it entirely still owes catalogueBackMatter() for the `enabled` flag.
      const usesAnyPage =
        PAGE_COMPONENTS.some((comp) => src.includes(`<${comp}`)) || src.includes('createBreedIndexRenderer(');
      if (!usesAnyPage) continue;
      if (!src.includes('catalogueBackMatter(')) {
        offenders.push(`${file.slice(SRC.length + 1)}: renders a back-matter page without calling catalogueBackMatter()`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the owner module exists and exports catalogueBackMatter', () => {
    const src = readFileSync(OWNER_FILE, 'utf8');
    expect(src).toMatch(/export function catalogueBackMatter/);
  });
});
