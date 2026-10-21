/**
 * Guard: "which classes are exempt from catalogue class NUMBERING" has ONE
 * owner (CLAUDE.md, "One owner per rule").
 *
 * History (bug-hunt #5): `isUnnumberedClassDef` in secretary.ts called itself
 * "the single source of truth for every class-numbering path", while
 * shows.ts's `shows.create` carried its own private closure, `isUnnumberedDef`,
 * whose comment admitted it only "mirrors" the secretary one. Both hand-typed
 * `type === 'junior_handler' || (type === 'special' && name.startsWith(...))`
 * separately. Consolidated 2026-09-18 into `isUnnumberedClassDef` in
 * src/lib/class-labels.ts, built on the existing `isSpecialAwardClass` /
 * `isJuniorHandler` predicates rather than re-typing the name-prefix test.
 *
 * This test fails if a THIRD hand-rolled copy of the rule appears — i.e. a
 * file (other than the owner) that joins a `junior_handler` type-check and
 * the `'Special Award Class'` name-prefix check with `||` in one expression,
 * the way the two duplicates above did.
 *
 * Scoping note: this deliberately requires the two conditions to be combined
 * with `||` within a short window, NOT just co-occurrence of the substrings
 * "junior_handler" / "Special Award Class" in the same file — several files
 * (e.g. class-manager.tsx's "add a class" dropdown, which buckets class
 * definitions into labelled groups for a <Select>) legitimately test each
 * substring separately, for unrelated UI purposes, and must not trip this
 * guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER = join(SRC, 'lib', 'class-labels.ts');

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

// Matches the exact duplicated-rule shape: a junior_handler type-check
// OR'd DIRECTLY (via `||`, not just nearby in the same file) with the
// Special Award Class name-prefix check, in either order. The original two
// duplicates both wrote `type === 'junior_handler' || (... startsWith('Special
// Award Class') ...)` — the `||` is what makes it "the rule", as opposed to
// files like class-manager.tsx's <Select> grouping code, which test each
// substring in SEPARATE, un-OR'd filter() calls for an unrelated UI purpose
// and must not trip this guard. The 80-char window after `||` allows for the
// `(cd?.type === 'special' && ...)` wrapping parens the duplicates used,
// without being wide enough to span unrelated statements.
const HAND_ROLLED_RULE =
  /type\s*===\s*['"]junior_handler['"]\s*\|\|[\s\S]{0,80}?startsWith\(\s*['"]Special Award Class['"]\s*\)|startsWith\(\s*['"]Special Award Class['"]\s*\)[\s\S]{0,80}?\|\|[\s\S]{0,40}?type\s*===\s*['"]junior_handler['"]/;

describe('class numbering exemption — one owner', () => {
  it('only class-labels.ts defines isUnnumberedClassDef', () => {
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export function isUnnumberedClassDef'),
    );
    expect(owners).toEqual([OWNER]);
  });

  it('no file outside the owner hand-rolls the junior_handler-or-Special-Award-Class test', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => f !== OWNER)
      .filter((f) => HAND_ROLLED_RULE.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('secretary.ts and shows.ts both import the owner rather than redefining it', () => {
    for (const rel of ['server/trpc/routers/secretary.ts', 'server/trpc/routers/shows.ts']) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      expect(src).toMatch(/isUnnumberedClassDef/);
      expect(src).toMatch(/from ['"]@\/lib\/class-labels['"]/);
    }
  });
});
