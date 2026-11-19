import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// GUARD (20 Oct 2026): which numbers a show's catalogue uses — where they start
// and which are left out (Mandy: bibs from 141, three missing) — has ONE owner,
// lib/catalogue-number-rule.ts. Before it, "1, 2, 3 … with no gaps" was written
// down twice: once where numbers are issued (catalogue-numbering.ts counted
// from 1 and appended at highest + 1) and once in the print preflight, which
// therefore marked every Midland render as failed after its +140 bib renumber.
// A third hand-rolled counter would start disagreeing the day a show sets a
// start number.

const read = (...p: string[]) => readFileSync(path.join('src', ...p), 'utf8');
/** Code only — comments may describe the old counting freely. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('catalogue numbers have one owner', () => {
  it('the numbering service issues numbers only through the rule', () => {
    const src = read('server', 'services', 'catalogue-numbering.ts');
    expect(src).toMatch(/from '@\/lib\/catalogue-number-rule'/);
    expect(src).toMatch(/\bexpectedCatalogueNumbers\(|\bnextCatalogueNumber\(/);
    expect(code(src)).not.toMatch(/\bnext\+\+|\+\+next|let next = 1\b|highest \+ 1/);
  });

  it('the print preflight checks numbers against the rule, not its own 1 … N', () => {
    const src = read('lib', 'catalogue-preflight.ts');
    expect(src).toMatch(/from '\.\/catalogue-number-rule'|from '@\/lib\/catalogue-number-rule'/);
    expect(src).toMatch(/\bexpectedCatalogueNumbers\(/);
    expect(code(src)).not.toMatch(/sorted\[0\] !== 1|sorted\[i\] !== i \+ 1/);
  });
});
