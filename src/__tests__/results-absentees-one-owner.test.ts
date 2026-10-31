import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT, findFiles, scanFiles } from './helpers/static-scan';

/**
 * A results class card's absentees have ONE owner each side (Mandy 8076,
 * 21 Oct 2026): `getLiveResults` builds the list from the same confirmed
 * entries its "N presented / M entered" count uses, and ClassAbsentees
 * (components/shows/class-absentees.tsx) is the only thing that draws it.
 *
 * Two ways this goes wrong later, both guarded here:
 * - a results screen prints the presented/entered count but never got the
 *   absentee lines (a third results page, or one rebuilt from scratch);
 * - a page draws the list itself, so the public page and the secretary's
 *   page word or order absentees differently.
 */

const OWNER = 'src/components/shows/class-absentees.tsx';
const show = (matches: Array<{ file: string; line: number; content: string }>) =>
  matches.map((m) => `  ${m.file}:${m.line}  ${m.content}`).join('\n');

describe('results absentees — one owner', () => {
  it('every page that prints a live results class count also renders ClassAbsentees', () => {
    const pages = findFiles('src/app', ['.tsx'])
      .map((abs) => ({ file: path.relative(PROJECT_ROOT, abs), source: fs.readFileSync(abs, 'utf-8') }))
      .filter(({ source }) => /getLiveResults\.useQuery/.test(source) && /dogsForward\}\s*presented/.test(source));

    // The public results page and the secretary's Results page today.
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const missing = pages.filter(({ source }) => !/<ClassAbsentees\b/.test(source)).map(({ file }) => file);
    expect(missing, `render cls.absentees with <ClassAbsentees> (${OWNER})`).toEqual([]);
  });

  it('nothing but ClassAbsentees draws an absentees list', () => {
    const matches = scanFiles(['src/app', 'src/components'], ['.tsx', '.ts'], /\babsentees\.map\(/).filter(
      (m) => m.file !== OWNER,
    );
    expect(matches, `use <ClassAbsentees> (${OWNER}):\n${show(matches)}`).toEqual([]);
  });
});
