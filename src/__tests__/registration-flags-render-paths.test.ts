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
 *
 * 2026-08-26: the HTTP route's own dogName construction moved into
 * catalogue-snapshot.ts (catalogue rendering moved to a background job —
 * the route now only enqueues). It builds BOTH name variants
 * (dogNameStandard / dogNameKc) up front, so the check below looks for the
 * flags wrapping each of those assignments rather than a single `dogName:`
 * object-literal key.
 */
describe('NAF/TAF flags reach BOTH catalogue render paths', () => {
  it('catalogue HTTP route (via catalogue-snapshot.ts) appends the registration flags to both dogName variants', () => {
    const relPath = 'src/server/services/catalogue-snapshot.ts';
    const src = readFileSync(join(process.cwd(), relPath), 'utf8');

    expect(
      src.includes("from '@/lib/registration-flags'"),
      `${relPath} must import the shared registration-flags helper rather than hand-rolling the suffix`
    ).toBe(true);
    expect(
      src.includes('dogNameStandard = appendRegistrationFlags'),
      `${relPath}: dogNameStandard is built without appendRegistrationFlags`
    ).toBe(true);
    expect(
      src.includes('dogNameKc = appendRegistrationFlags'),
      `${relPath}: dogNameKc is built without appendRegistrationFlags`
    ).toBe(true);
  });

  it('catalogue print service builds no dog names of its own — it delegates to the snapshot path', () => {
    // This used to demand that pdf-generation.ts import appendRegistrationFlags
    // and wrap its own `dogName:` construction. Since 9cc33b60 collapsed the two
    // catalogue render paths into one, pdf-generation.ts builds NO dog names:
    // generateCataloguePdf calls buildCatalogueSnapshot + renderCatalogueFromSnapshot
    // (catalogue-snapshot.ts), which the test above covers. The old assertion had
    // been failing on main ever since — a guard for a second copy that no longer
    // exists. What must stay true now is that the second copy never comes back.
    const relPath = 'src/server/services/pdf-generation.ts';
    const src = readFileSync(join(process.cwd(), relPath), 'utf8');

    expect(
      src.includes('buildCatalogueSnapshot') && src.includes('renderCatalogueFromSnapshot'),
      `${relPath} must render catalogues through the shared snapshot path`
    ).toBe(true);
    expect(
      /\bdogName\s*:/.test(src),
      `${relPath} builds a dogName itself — that is a second catalogue render path; NAF/TAF flags (and everything else) would drift from the snapshot path`
    ).toBe(false);
  });
});
