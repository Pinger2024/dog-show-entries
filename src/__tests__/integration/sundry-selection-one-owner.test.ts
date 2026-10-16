/**
 * Guard: sundry-item purchase rules have ONE owner —
 * `validateSundrySelection` in src/server/services/sundry-selection.ts.
 *
 * History (CLAUDE.md, "One owner per rule"): `orders.checkout` validated
 * requested sundry items inline — existence, show-membership, enabled, and
 * the per-order `maxPerOrder` cap aggregated across cart lines (bug hunt
 * #27). `secretary.createManualEntry` had its own, smaller copy of the same
 * lookup that checked existence/enabled/show-membership but never enforced
 * `maxPerOrder` at all. Extracted 2026-09-18 so both routers call the same
 * function; the manual-entry path still deliberately does not enforce
 * `over_max` (see the comment at its call site — that is a decision for
 * `feat-entry-requirements-one-gate`, not a bug).
 *
 * This test fails if:
 *  - either router stops calling the shared function, or
 *  - `maxPerOrder` gets compared anywhere under src/ outside the owning
 *    service — i.e. if someone writes the cap rule down a second time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER = join(SRC, 'server', 'services', 'sundry-selection.ts');

/** Every .ts/.tsx file under src/, excluding tests. */
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

describe('sundry selection — one owner', () => {
  it('orders.checkout calls the shared function', () => {
    const src = readFileSync(join(SRC, 'server', 'trpc', 'routers', 'orders.ts'), 'utf8');
    expect(src).toContain('validateSundrySelection(');
  });

  it('secretary.createManualEntry calls the shared function', () => {
    const src = readFileSync(join(SRC, 'server', 'trpc', 'routers', 'secretary.ts'), 'utf8');
    expect(src).toContain('validateSundrySelection(');
  });

  it('maxPerOrder is compared only inside the owning service', () => {
    // Scoped deliberately, not a blanket "no maxPerOrder anywhere":
    //  - __tests__ is excluded — tests legitimately assert on the field
    //    (e.g. sundry-cap.test.ts, factories.ts building fixtures).
    //  - schema files (server/db/schema/**) and fixture/generator data
    //    (server/services/test-data-generator.ts) are excluded — declaring
    //    or seeding the COLUMN value is not enforcing the RULE.
    //  - everything under src/app is excluded. It only ever holds a client
    //    component: a stepper that disables its own "+" button once the
    //    cart already holds `maxPerOrder` of an item
    //    (app/(shows)/shows/[id]/enter/page.tsx,
    //    app/(secretary)/secretary/shows/[id]/entries/page.tsx), or the
    //    admin form that lets a secretary set the number
    //    (sundry-item-manager.tsx). None of these are authoritative — the
    //    cap is enforced server-side by `validateSundrySelection` regardless
    //    of what the client sent; a disabled button is UX convenience, not
    //    a second copy of the money-relevant rule. Checking per-line (not
    //    per-file) keeps this precise: a whole-file scan with an unbounded
    //    "anything between an operator and maxPerOrder" pattern false-
    //    positived on unrelated `<`/`>` elsewhere in large router files
    //    (JSX-heavy or otherwise) — bounding the check to one line, and to
    //    server/ code only, avoids that.
    const COMPARISON_ON_LINE = /\bmaxPerOrder\b[^\n]{0,20}[<>]=?|[<>]=?[^\n]{0,20}\bmaxPerOrder\b/;

    const offenders: string[] = [];
    for (const file of sourceFiles(join(SRC, 'server'))) {
      if (file === OWNER) continue;
      if (file.includes(`${join('server', 'db', 'schema')}${'/'}`)) continue;
      if (file === join(SRC, 'server', 'services', 'test-data-generator.ts')) continue;
      const src = readFileSync(file, 'utf8');
      if (!src.includes('maxPerOrder')) continue;
      for (const line of src.split('\n')) {
        if (COMPARISON_ON_LINE.test(line)) {
          offenders.push(file.slice(SRC.length + 1));
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
