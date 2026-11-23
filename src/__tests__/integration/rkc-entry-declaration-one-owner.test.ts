/**
 * Guard: the RKC entry declaration has ONE owner — `entryDeclaration` in
 * src/lib/rkc-entry-declaration.ts (CLAUDE.md, "One owner per rule").
 *
 * History: the declaration was hand-copied into THREE files — the online
 * checkout (app/(shows)/shows/[id]/enter/page.tsx), the single-breed
 * schedule's postal entry form (components/schedule/show-schedule.tsx) and the
 * multi-breed schedule's (show-schedule-multibreed.tsx). The RKC's 2027
 * amendment (F(1)8.h) inserts eight words into it, which would have meant
 * three separate edits and three chances to drift. Collapsed to one owner
 * 2026-10-26.
 *
 * Why it matters more here than elsewhere: this is the text an exhibitor
 * actually agrees to. If the online wording and the printed form's wording
 * ever disagree, there is no answer to "what did they consent to?".
 *
 * This test fails if a fourth copy of the wording appears anywhere outside the
 * owner file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER = join(SRC, 'lib/rkc-entry-declaration.ts');

/** Distinctive fragments of the two declarations — short enough to survive
 *  re-wrapping, long enough not to match anything else. */
const DECLARATION_FRAGMENTS = [
  'undertake to abide by the Regulations of this Show',
  'agree to submit to and be bound by Royal Kennel Club Limited',
  'abide by the GSDL-British Regional Group Rules',
];

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

describe('RKC entry declaration — one owner', () => {
  it.each(DECLARATION_FRAGMENTS)('no file other than the owner spells out %j', (fragment) => {
    const offenders = sourceFiles(SRC).filter(
      (f) => f !== OWNER && readFileSync(f, 'utf8').includes(fragment),
    );
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it.each([
    'app/(shows)/shows/[id]/enter/page.tsx',
    'components/schedule/show-schedule.tsx',
    'components/schedule/show-schedule-multibreed.tsx',
  ])('%s calls the owner', (relative) => {
    expect(readFileSync(join(SRC, relative), 'utf8')).toContain('entryDeclaration(');
  });
});
