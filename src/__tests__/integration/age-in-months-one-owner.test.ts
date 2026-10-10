/**
 * Guard: "a dog's age in whole completed months on a given date" has ONE
 * owner — `ageInCompletedMonths` in `src/lib/date-utils.ts` — and
 * `src/server/trpc/routers/dogs.ts` calls it rather than re-deriving the
 * same rule by hand.
 *
 * History (CLAUDE.md, "One owner per rule"): `getWinSummary` computed this
 * correctly (subtracting 1 when the on-date's day-of-month falls before the
 * DOB's day-of-month, so the count floors to COMPLETED months).
 * `getTitleProgress` computed the same thing by hand next to it, but
 * omitted that adjustment — so for roughly the first three-and-a-bit weeks
 * of every month it overstated a dog's age by one whole month. That gates
 * Junior Warrant progress (<18 months) and Veteran Warrant progress (>=84
 * months), so a dog could show as JW-ineligible, or Veteran-eligible, a few
 * weeks early.
 *
 * Scope: this only fails on the specific hand-rolled shape the bug took —
 * `(a.getFullYear() - b.getFullYear()) * 12 ... a.getMonth() - b.getMonth()`
 * — in `dogs.ts` specifically. It deliberately does NOT scan the whole repo
 * or flag every `getMonth()`/`getFullYear()` use (there are plenty of
 * unrelated ones — see the commit message for the full inventory), and it
 * deliberately does NOT touch the several WEEKS/YEARS-based and
 * class-eligibility age computations found in the same inventory (the NFC
 * 12-week floor, class age bands, svDisplayAge, the puppy/veteran award
 * bands) — those are a separate, higher-stakes concern out of scope here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeDog } from '../helpers/factories';

const DOGS_ROUTER = join(process.cwd(), 'src', 'server', 'trpc', 'routers', 'dogs.ts');

describe('age-in-completed-months — one owner', () => {
  it('dogs.ts contains no hand-rolled "(y2-y1)*12 + (m2-m1)" month-count arithmetic', () => {
    const src = readFileSync(DOGS_ROUTER, 'utf8');
    // The bug's exact shape: subtracting getFullYear() calls, scaled by 12,
    // combined with a getMonth() difference, all within the same file.
    // eslint-disable-next-line no-useless-escape
    const handRolled = /getFullYear\(\)\s*-\s*\w+\.getFullYear\(\)\)\s*\*\s*12/;
    expect(src).not.toMatch(handRolled);
  });

  it('dogs.ts calls the shared ageInCompletedMonths helper', () => {
    const src = readFileSync(DOGS_ROUTER, 'utf8');
    expect(src).toContain('ageInCompletedMonths(');
    expect(src).toMatch(/from ['"]@\/lib\/date-utils['"]/);
  });

  it('the rule itself lives in exactly one place', () => {
    const owner = readFileSync(join(process.cwd(), 'src', 'lib', 'date-utils.ts'), 'utf8');
    expect(owner).toContain('export function ageInCompletedMonths(');
  });
});

describe('dogs.getTitleProgress — JW eligibility uses completed months (regression)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a dog 17 months and 20 days old is still JW-eligible (not aged out by an off-by-one)', async () => {
    // Freeze "now" so the test is deterministic regardless of what day it's
    // run on — getTitleProgress reads `new Date()` for its reference date,
    // not the show date, so real timers would make this test's outcome
    // depend on the calendar day it happened to run on.
    const FROZEN_NOW = new Date('2026-06-15T12:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FROZEN_NOW);

    // DOB chosen so the dog is exactly 17 months + 20 days old on FROZEN_NOW:
    // 2024-12-26 -> 2025-01-15 is 20 days; 2025-01-15 -> 2026-06-15 is
    // exactly 17 calendar months. Completed-months count on FROZEN_NOW = 17
    // (correct/fixed); the buggy hand-rolled formula (no day-of-month
    // adjustment) gives 18, which is old enough to be excluded from JW
    // entirely (`ageMonths < 18 || jwPoints > 0` is false when jwPoints is
    // also 0), so the observable symptom of the bug is the JW row missing
    // from titleProgress altogether rather than showing 0/25 progress.
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, dateOfBirth: '2024-12-26' });

    const result = await createTestCaller(owner).dogs.getTitleProgress({ dogId: dog.id });
    const jw = result.titleProgress.find((t) => t.code === 'jw');

    expect(jw).toBeDefined();
    expect(jw?.milestoneReached).toBe(false);
    expect(jw?.current).toBe(0);
    expect(jw?.required).toBe(25);
    // The buggy formula's symptom text ("age limit reached") must NOT
    // appear — a 17-month-20-day-old dog still has time left.
    expect(jw?.detail).not.toMatch(/age limit reached/);
    expect(jw?.detail).toMatch(/days remaining/);
  });

  it('a dog exactly 18 months old (the true anniversary) is correctly excluded from JW', async () => {
    const FROZEN_NOW = new Date('2026-06-15T12:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FROZEN_NOW);

    // Exactly 18 completed months: 2024-12-15 -> 2026-06-15.
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, dateOfBirth: '2024-12-15' });

    const result = await createTestCaller(owner).dogs.getTitleProgress({ dogId: dog.id });
    const jw = result.titleProgress.find((t) => t.code === 'jw');

    // No wins recorded (jwPoints === 0) and ageMonths is not < 18, so the JW
    // row is correctly absent — same shape as the "missing row" symptom
    // above, but here it's the RIGHT answer, not the bug.
    expect(jw).toBeUndefined();
  });
});
