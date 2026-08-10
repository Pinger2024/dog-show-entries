import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The catalogue is built by TWO independent code paths that must produce
 * identical output — the HTTP download route and the print-pipeline service.
 * Historically they have drifted (judge dedup, JH judge role, and the
 * `marked`-format casing they still disagree on today), each time producing a
 * bug where the downloaded catalogue and the printed one differed.
 *
 * NAF/TAF/CNAF is exactly that shape of change, so pin it: both paths must
 * append the registration flags where they build the printed dog name. A
 * behavioural test can only cover whichever path it calls; this covers both.
 */
const PATHS = {
  'catalogue HTTP route': 'src/app/api/catalogue/[showId]/[format]/route.ts',
  'catalogue print service': 'src/server/services/pdf-generation.ts',
} as const;

describe('NAF/TAF flags reach BOTH catalogue render paths', () => {
  for (const [label, relPath] of Object.entries(PATHS)) {
    it(`${label} appends the registration flags to dogName`, () => {
      const src = readFileSync(join(process.cwd(), relPath), 'utf8');

      expect(
        src.includes("from '@/lib/registration-flags'"),
        `${relPath} must import the shared registration-flags helper rather than hand-rolling the suffix`
      ).toBe(true);

      // The dogName construction itself must be wrapped, not merely imported
      // somewhere else in the file.
      const dogNameBlock = src.slice(src.indexOf('dogName:'), src.indexOf('dogName:') + 400);
      expect(
        dogNameBlock.includes('appendRegistrationFlags'),
        `${relPath}: dogName is built without appendRegistrationFlags — the two catalogue paths would disagree`
      ).toBe(true);
    });
  }
});
