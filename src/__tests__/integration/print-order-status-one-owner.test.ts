/**
 * Guard: "a print order counts as already paid / advanced" has ONE owner
 * (CLAUDE.md, "One owner per rule").
 *
 * History: the five-status list (paid, submitted, in_production, dispatched,
 * delivered) was hand-typed three times — twice in the Stripe print-order
 * webhook handlers (`src/app/api/webhooks/stripe/route.ts`, once as an `||`
 * chain, once as an inline array literal) and once as `PRINT_PAID_STATUSES`
 * in `src/server/trpc/routers/admin-dashboard.ts`. Consolidated 2026-09-18
 * into `PRINT_ORDER_PAID_STATUSES` / `isPrintOrderPaid` in
 * src/lib/print-products.ts; all three sites now import it.
 *
 * This test fails if a file outside the owner writes an array literal or
 * `status === … || status === …` chain whose quoted values are EXACTLY the
 * five-member paid set (the signature of writing the rule down again, as
 * opposed to using a strict subset or a superset for some other purpose),
 * excluding:
 *  - the owner file itself and its tests,
 *  - schema/enum definitions (src/server/db/schema/**), which legitimately
 *    enumerate every possible status value (including non-paid ones like
 *    'draft'/'cancelled'/'failed') for the pg enum type, not "which
 *    statuses count as paid",
 *  - test files, which build fixture data.
 *
 * Scoping note: matching on the EXACT set (not mere co-occurrence of any two
 * of the five strings) is what keeps this from false-positiving on files
 * that legitimately reuse a SUBSET of the same status strings for a
 * different rule — e.g. the print-shop progress stepper's `canRefresh` list
 * (['submitted', 'in_production', 'dispatched'], 3 of the 5, no
 * 'paid'/'delivered') or the Tradeprint external-status map in
 * print-orders.ts — or a SUPERSET used to render a full pipeline UI that
 * also lists pre-payment/terminal statuses (admin dashboard's
 * PRINT_PIPELINE_STAGES, which additionally lists 'awaiting_payment' and
 * 'failed').
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER = join(SRC, 'lib', 'print-products.ts');
const SCHEMA_DIR = join(SRC, 'server', 'db', 'schema');

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

const PAID_STATUS_SET = new Set(['paid', 'submitted', 'in_production', 'dispatched', 'delivered']);

function sameSet(words: string[]): boolean {
  const set = new Set(words);
  return set.size === PAID_STATUS_SET.size && [...set].every((w) => PAID_STATUS_SET.has(w));
}

function hasHandRolledPaidList(src: string): boolean {
  // Array literals of ONLY quoted strings, e.g. ['paid', 'submitted', ...] —
  // deliberately excludes arrays of objects (like PRINT_PIPELINE_STAGES)
  // since those aren't a re-typing of THIS rule.
  for (const m of src.matchAll(/\[\s*(?:['"][\w-]+['"]\s*,\s*)*['"][\w-]+['"]\s*\]/g)) {
    const words = [...m[0].matchAll(/['"]([\w-]+)['"]/g)].map((w) => w[1]!);
    if (sameSet(words)) return true;
  }
  // `x === 'paid' || x === 'submitted' || …` chains.
  for (const m of src.matchAll(/(?:[\w.?]+\s*===\s*['"][\w-]+['"]\s*\|\|\s*)+[\w.?]+\s*===\s*['"][\w-]+['"]/g)) {
    const words = [...m[0].matchAll(/===\s*['"]([\w-]+)['"]/g)].map((w) => w[1]!);
    if (sameSet(words)) return true;
  }
  return false;
}

describe('print order paid statuses — one owner', () => {
  it('only print-products.ts defines PRINT_ORDER_PAID_STATUSES', () => {
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export const PRINT_ORDER_PAID_STATUSES'),
    );
    expect(owners).toEqual([OWNER]);
  });

  it('no file outside the owner (and schema/enum definitions) hand-rolls the paid-statuses array', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => f !== OWNER)
      .filter((f) => !f.startsWith(SCHEMA_DIR + '/'))
      .filter((f) => hasHandRolledPaidList(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the Stripe webhook and admin dashboard import the owner rather than redefining it', () => {
    for (const rel of ['app/api/webhooks/stripe/route.ts', 'server/trpc/routers/admin-dashboard.ts']) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      expect(src).toMatch(/isPrintOrderPaid|PRINT_ORDER_PAID_STATUSES/);
      expect(src).toMatch(/from ['"]@\/lib\/print-products['"]/);
    }
  });
});
