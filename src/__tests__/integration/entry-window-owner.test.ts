/**
 * Guard: "is this show still accepting new money against an entry" has ONE
 * owner — `entryWindowOpen` (src/lib/show-status.ts).
 *
 * History (add-extras-to-entry design doc, 2026-09-21): `orders.checkout`
 * and `entries.create` each carried their own copy of
 * `status === 'entries_open' && entryCloseDate not passed`, while
 * `priceEntryClassChange` (the class-change top-up owner) carried only HALF
 * of it — `status !== 'entries_open'` with no close-date check at all — so a
 * show whose deadline had passed but whose daily-cron status hadn't caught
 * up yet still accepted a class-change top-up. This test fails if a new
 * inline `=== 'entries_open'` / `!== 'entries_open'` window check reappears
 * outside the owner, `secretary.ts` (manual entry deliberately allows a
 * WIDER status set — see its own comment) or tests.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const SHOW_STATUS_OWNER = join(SRC, 'lib', 'show-status.ts');

// The specific "does this let new money through" enforcement call sites the
// design doc names — NOT every `status === 'entries_open'` in the codebase.
// Plenty of legitimate DISPLAY-only comparisons exist elsewhere (badges,
// catalogue-generation banners, JSON-LD, sort order) that are effectiveShowStatus's
// territory, not this rule's — flagging those too would be a false positive,
// not a second copy of the money-gating rule this guard exists to protect.
const ENFORCEMENT_FILES = [
  join(SRC, 'server', 'trpc', 'routers', 'orders.ts'),
  join(SRC, 'server', 'trpc', 'routers', 'entries.ts'),
  join(SRC, 'server', 'services', 'entry-change-pricing.ts'),
  join(SRC, 'server', 'services', 'order-extras-pricing.ts'),
  join(SRC, 'lib', 'entry-edit-rules.ts'),
];

const WINDOW_CHECK = /show\.status\s*(!==|===)\s*['"]entries_open['"]/;

describe('entryWindowOpen — one owner', () => {
  it('the rule itself lives in exactly one file', () => {
    const src = readFileSync(SHOW_STATUS_OWNER, 'utf8');
    expect(src).toContain('export function entryWindowOpen');
  });

  it('none of the money-gating enforcement call sites hand-roll `show.status === \'entries_open\'` any more', () => {
    const offenders: string[] = [];
    for (const file of ENFORCEMENT_FILES) {
      const src = readFileSync(file, 'utf8');
      if (WINDOW_CHECK.test(src)) {
        offenders.push(file.replace(SRC + '/', 'src/'));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the entry detail page\'s Edit Classes / Add extras buttons gate on entryWindowOpen, not a raw status check', () => {
    const src = readFileSync(
      join(SRC, 'app', '(dashboard)', 'entries', '[id]', 'page.tsx'),
      'utf8',
    );
    expect(src).toMatch(/entryWindowOpen\(/);
    expect(src).not.toMatch(/entry\.show\.status\s*===\s*['"]entries_open['"]/);
  });

  it('orders.checkout, entries.create and priceEntryClassChange all call entryWindowOpen', () => {
    const orders = readFileSync(join(SRC, 'server', 'trpc', 'routers', 'orders.ts'), 'utf8');
    const entriesRouter = readFileSync(join(SRC, 'server', 'trpc', 'routers', 'entries.ts'), 'utf8');
    const pricing = readFileSync(join(SRC, 'server', 'services', 'entry-change-pricing.ts'), 'utf8');
    const pricingExtras = readFileSync(join(SRC, 'server', 'services', 'order-extras-pricing.ts'), 'utf8');

    const editRules = readFileSync(join(SRC, 'lib', 'entry-edit-rules.ts'), 'utf8');

    expect(orders).toMatch(/entryWindowOpen\(/);
    expect(entriesRouter).toMatch(/entryWindowOpen\(/);
    // A class change is gated by entryClassChangeBlock (paid entry + window),
    // whose show half IS entryWindowOpen.
    expect(pricing).toMatch(/entryClassChangeBlock\(/);
    expect(editRules).toMatch(/entryWindowOpen\(/);
    expect(pricingExtras).toMatch(/entryWindowOpen\(/);
  });
});
