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
 * Scope: only the two routers named above. This is deliberately NOT a
 * whole-of-src scan for the literal `12`, because the client enter page
 * (shows/[id]/enter/page.tsx) legitimately contains other, unrelated
 * age-in-months literals (Baby Puppy 4–6 months, the 6-month competition
 * floor, Junior Handler age bands) that would make a broad literal-`12`
 * scan noisy and unmaintainable. The enter page's own 12-week floor is
 * checked separately below by requiring it to call `isOldEnoughForNfc`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
