/**
 * Guard: the "group classes with a non-standard entry fee into display
 * lines" logic (e.g. "Special Award classes £3", "Baby Puppy classes £4")
 * has ONE owner — buildEntryFeeGroups in
 * src/components/schedule/shared/entry-fee-groups.ts (CLAUDE.md, "One owner
 * per rule").
 *
 * History: the public show-preview page
 * (app/(shows)/shows/[id]/preview/show-preview.tsx) carried a byte-for-byte
 * mirror of this grouping (its own comment said so) instead of calling the
 * schedule renderer's shared function. Fixed 2026-09-18: show-preview.tsx
 * now calls buildEntryFeeGroups directly.
 *
 * This test fails if a hand-rolled copy of the grouping logic reappears
 * anywhere outside the owner file. It's scoped to the exact
 * `startsWith('Special Award Class') ? 'Special Award' : …` ternary shape —
 * NOT a bare `startsWith('Special Award Class')` scan, which also matches
 * several unrelated "is this a special award class" call sites (the
 * separately-registered special-awards carve-out in CLAUDE.md: class-manager.tsx,
 * add-judge-wizard.tsx, class-labels.ts, judge-coverage.ts,
 * show-schedule-multibreed.tsx's own carve-out check) that have nothing to
 * do with fee grouping.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER = join(SRC, 'components/schedule/shared/entry-fee-groups.ts');

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

describe('entry fee groups — one owner', () => {
  it('no file other than the owner hand-rolls the fee-group collapse ternary', () => {
    const offenders = sourceFiles(SRC).filter((f) => {
      if (f === OWNER) return false;
      const src = readFileSync(f, 'utf8');
      return /startsWith\(['"]Special Award Class['"]\)\s*\?\s*['"]Special Award['"]\s*:/.test(src);
    });
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('show-preview.tsx calls the owner', () => {
    const src = readFileSync(
      join(SRC, 'app/(shows)/shows/[id]/preview/show-preview.tsx'),
      'utf8',
    );
    expect(src).toContain('buildEntryFeeGroups');
  });

  it('the schedule renderers still call the owner too', () => {
    for (const rel of [
      'components/schedule/show-schedule.tsx',
      'components/schedule/show-schedule-multibreed.tsx',
    ]) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      expect(src).toContain('buildEntryFeeGroups');
    }
  });

  it('the grouping function itself lives in exactly one file', () => {
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export function buildEntryFeeGroups'),
    );
    expect(owners.map((f) => f.slice(SRC.length + 1))).toEqual([
      'components/schedule/shared/entry-fee-groups.ts',
    ]);
  });
});
