/**
 * Guard: the NFC (Not For Competition) minimum age — 12 weeks old on show
 * day — has ONE owner: `NFC_MIN_AGE_WEEKS` / `isOldEnoughForNfc` /
 * `nfcMinAgeMessage` in src/lib/date-utils.ts (CLAUDE.md, "One owner per
 * rule").
 *
 * History: entries.ts (`entries.create`) and orders.ts (`orders.checkout`)
 * hand-typed this identically — `differenceInWeeks(showDate, dob) < 12` plus
 * the exact rejection message. Fixed 2026-09-18.
 *
 * Scope of the GATE checks: only the two routers named above. This is
 * deliberately NOT a whole-of-src scan for the literal `12`, because the
 * client enter page (shows/[id]/enter/page.tsx) legitimately contains other,
 * unrelated age-in-months literals (Baby Puppy 4–6 months, the 6-month
 * competition floor, Junior Handler age bands) that would make a broad
 * literal-`12` scan noisy and unmaintainable. The enter page's own 12-week
 * floor is checked separately below by requiring it to call
 * `isOldEnoughForNfc`.
 *
 * SECOND HALF, added 2026-10-27: the PRINTED text. The gate had one owner
 * while the number was still hand-typed as the words "12 weeks" into four
 * strings — the schedule's Rule 18 (shared/rkc-rules.tsx), the summary card
 * in show-schedule.tsx and show-schedule-multibreed.tsx (byte-identical in
 * both), and `getCompetitionAgeError`'s own message inside the owner file.
 * So a schedule could promise one age while the gate enforced another.
 * Found while checking our rendered 2027 schedule against the RKC's 2027
 * specimens, which print "3 calendar months" for this same rule — if that
 * figure ever has to move, it must move in exactly one place.
 *
 * Unlike a bare `12`, the PHRASE "12 weeks" is specific enough to scan the
 * whole of src for, so that half is a broad scan: no source file may spell
 * the age out in prose; every printed string interpolates the constant.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ENTRIES_ROUTER = join(process.cwd(), 'src/server/trpc/routers/entries.ts');
const ORDERS_ROUTER = join(process.cwd(), 'src/server/trpc/routers/orders.ts');
const ENTER_PAGE = join(process.cwd(), 'src/app/(shows)/shows/[id]/enter/page.tsx');
const DATE_UTILS = join(process.cwd(), 'src/lib/date-utils.ts');

describe('NFC minimum age — one owner', () => {
  for (const file of [ENTRIES_ROUTER, ORDERS_ROUTER]) {
    const rel = file.slice(join(process.cwd(), 'src').length + 1);

    it(`${rel} does not hand-type the "< 12" NFC age check`, () => {
      const src = readFileSync(file, 'utf8');
      // The historical hand-rolled shape: `ageWeeks < 12` (whitespace
      // insensitive). Scoped to this file so it can't false-positive on
      // unrelated age-in-months comparisons elsewhere in the codebase.
      expect(src).not.toMatch(/ageWeeks\s*<\s*12\b/);
    });

    it(`${rel} calls the owner for the NFC age gate`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('isOldEnoughForNfc');
      expect(src).toContain('nfcMinAgeMessage');
    });
  }

  it('the enter page uses the owner for its "too young to enter at all" gate', () => {
    const src = readFileSync(ENTER_PAGE, 'utf8');
    expect(src).toContain('isOldEnoughForNfc');
    expect(src).not.toMatch(/ageWeeks\s*<\s*12\b/);
  });

  it('the constant, the check and the server message live in exactly one file', () => {
    const owner = readFileSync(DATE_UTILS, 'utf8');
    expect(owner).toContain('export const NFC_MIN_AGE_WEEKS = 12');
    expect(owner).toContain('export function isOldEnoughForNfc');
    expect(owner).toContain('export function nfcMinAgeMessage');
  });
});

/**
 * Strip comments so the scan below sees only code. JSDoc and full-line
 * comments are where the figure is legitimately discussed in prose (the
 * history of this very rule, for one). `//` is only treated as a comment
 * when it is not part of a URL (`https://`) or a path.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:/])\/\/.*$/gm, '$1');
}

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

describe('NFC minimum age — the PRINTED age has one owner too', () => {
  const SRC = join(process.cwd(), 'src');

  it.each(['12 weeks', 'twelve weeks'])('no source file spells the age out as %j', (phrase) => {
    const offenders = sourceFiles(SRC).filter((f) => codeOnly(readFileSync(f, 'utf8')).includes(phrase));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('the schedule rule and the summary card have one owner each', () => {
    const owner = readFileSync(join(SRC, 'components/schedule/shared/rkc-rules.tsx'), 'utf8');
    expect(owner).toContain('export function nfcScheduleRule');
    expect(owner).toContain('export function nfcSummaryText');
    expect(owner).toContain('NFC_MIN_AGE_WEEKS');
  });

  it.each([
    'components/schedule/show-schedule.tsx',
    'components/schedule/show-schedule-multibreed.tsx',
  ])('%s calls the summary owner rather than repeating it', (relative) => {
    expect(readFileSync(join(SRC, relative), 'utf8')).toContain('nfcSummaryText(');
  });
});
