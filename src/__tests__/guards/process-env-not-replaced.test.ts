import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from '../helpers/static-scan';

// GUARD (3 Nov 2026): render-worker-kick.test.ts reset its env by swapping
// process.env for a plain copy. Every test file runs in ONE process
// (singleFork), and Node only re-reads the time zone when TZ is set on the
// REAL process.env — so every file that ran after it could no longer switch
// zones, and london-datetime-input.test.ts failed 10 tests whenever the file
// order put it second (seen 1 Nov; reproduced 3 Nov with --sequence.seed=3).
// Change keys on process.env, or use vi.stubEnv; never replace the object.

const REPLACES_ENV = new RegExp(['process', 'env'].join('\\.') + '\\s*=(?!=)');

describe('no test replaces process.env', () => {
  it('every file changes keys on the real process.env instead', () => {
    const offenders = findFiles('src', ['.ts', '.tsx']).filter((f) => REPLACES_ENV.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});
