import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from '../helpers/static-scan';

// GUARD (3 Nov 2026): `secretary.createManualEntry` ran no age gate at all, so
// a secretary could put a four-month-old in Open and Remi printed it in the
// catalogue, while the same dog entered online was refused. `entries.create`
// and `orders.checkout` each hand-wrote the same NFC-or-competition branch;
// the third path simply never got a copy. The whole age decision for an entry
// now lives in `entryAgeError` (src/lib/date-utils.ts) and every server path
// that creates an entry calls it. Repro: integration/manual-entry-age-gate.test.ts.

const ROUTERS = path.join('src', 'server', 'trpc', 'routers');
const CREATION_PATHS = [
  path.join(ROUTERS, 'entries.ts'),
  path.join(ROUTERS, 'orders.ts'),
  path.join(ROUTERS, 'secretary.ts'),
];

// Writers of entry_classes that change an EXISTING entry's classes rather
// than create one. They run none of the checkout gates today — the known
// class-change gap (Mandy 8046, project_regional_edit_classes_2026-10-16),
// which is its own fix. Listed so a NEW writer fails here and gets a decision.
const CLASS_CHANGE_WRITERS = [
  path.join('src', 'app', 'api', 'webhooks', 'stripe', 'route.ts'),
];

const serverFiles = () =>
  findFiles('src', ['.ts', '.tsx']).filter(
    (f) => !f.includes(`${path.sep}__tests__${path.sep}`) && !f.endsWith(path.join('lib', 'date-utils.ts')),
  );

describe('the entry age gate has one owner', () => {
  it.each(CREATION_PATHS)('%s calls entryAgeError', (file) => {
    expect(readFileSync(file, 'utf8')).toMatch(/\bentryAgeError\(/);
  });

  it('no server path calls the parts of the gate directly', () => {
    // The enter page may use isOldEnoughForNfc to grey out a dog that is too
    // young for anything — that is a screen hint, not the gate.
    const offenders = serverFiles()
      .filter((f) => !f.includes(`${path.sep}app${path.sep}(shows)${path.sep}`))
      .filter((f) => /\b(getCompetitionAgeError|isOldEnoughForNfc|nfcMinAgeMessage)\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('every file that writes entry classes is a gated creation path or a known class-change writer', () => {
    const writers = serverFiles().filter((f) => /\.insert\(entryClasses\)/.test(readFileSync(f, 'utf8')));
    const unaccounted = writers.filter((f) => ![...CREATION_PATHS, ...CLASS_CHANGE_WRITERS].some((k) => f.endsWith(k)));
    expect(unaccounted).toEqual([]);
  });
});
