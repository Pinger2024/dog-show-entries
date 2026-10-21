/**
 * Guard: the judge "Breed: … / Classification: …" label has ONE owner —
 * buildJudgeBreedAndClassification (src/lib/judge-breed-classification.ts).
 *
 * History (CLAUDE.md, "One owner per rule"; register item pending 2026-09-18):
 * judge-section.tsx's assignments card and offer-email preview re-implemented
 * the SAC/JH detection, per-breed dog/bitch/both sex union, and single-breed
 * breedId=null fallback inline (deriveJudgeLabels + the uniqueJudges grouping
 * it read from), instead of calling the shared lib the server side
 * (secretary.ts, steward.ts, judge-contract-pdf.ts) already used. Fixed by
 * having deriveJudgeLabels call buildJudgeBreedAndClassification directly on
 * the judge's raw assignments.
 *
 * NOT the same thing as the registered "schedule judge aggregation written
 * three times" item (docs/AUDIT-duplicated-rules-2026-09-11.md #5 —
 * schedule-judges.ts / pdf-generation.ts / api/schedule/[showId]/route.ts,
 * plus show-preview.tsx's own "role" aggregation for the public judge card).
 * Those produce a different shape (a single per-judge "role" string, or a
 * schedule table row) and are deliberately left standing — this test scopes
 * itself to files that render the literal "Breed:" / "Classification:" label
 * pair, which excludes all of them.
 *
 * This test fails if a client file starts rendering that label pair again
 * without importing the shared function — i.e. if the rule gets written down
 * a third time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER = join(SRC, 'lib', 'judge-breed-classification.ts');

/** Every .ts/.tsx file under src/, excluding tests and the owner itself. */
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

describe('judge breed/classification label — one owner', () => {
  // Files that render the "Breed: ... / Classification: ..." UI label pair.
  const labelRenderers = sourceFiles(SRC).filter((f) => {
    if (f === OWNER) return false;
    const src = readFileSync(f, 'utf8');
    return src.includes('Breed:') && src.includes('Classification:');
  });

  it('finds the known label renderers', () => {
    const rel = labelRenderers.map((f) => f.slice(SRC.length + 1)).sort();
    expect(rel).toEqual([
      'app/(secretary)/secretary/shows/[id]/_components/judge-section.tsx',
      'components/judge-contract/judge-contract-pdf.tsx',
      // Only a comment referencing the label pattern — it already imports
      // and calls the shared function (see the loop below).
      'server/services/judge-contract-pdf.ts',
    ]);
  });

  for (const file of labelRenderers) {
    const rel = file.slice(SRC.length + 1);
    const src = readFileSync(file, 'utf8');
    // judge-contract-pdf.tsx only ever RENDERS a breedLine/classificationLine
    // it's handed as props (computed server-side via the shared function in
    // judge-contract-pdf.ts) — it never rebuilds the label itself, so it
    // never needs the import. Anything else that renders the label pair must
    // import the shared function.
    const rendersPrecomputedPropsOnly = /breedLine\??:\s*string/.test(src) && !src.includes('Dogs & Bitches');

    if (rendersPrecomputedPropsOnly) {
      it(`${rel} renders precomputed props and does not rebuild the label`, () => {
        expect(src).not.toContain('Dogs & Bitches');
      });
      continue;
    }

    it(`${rel} imports the shared judge label function instead of rebuilding it`, () => {
      expect(src).toContain("from '@/lib/judge-breed-classification'");
      expect(src).toContain('buildJudgeBreedAndClassification');
      // The telltale sign of a re-implementation: hand-rolling the
      // dog/bitch/both sex union inline.
      expect(src).not.toContain('Dogs & Bitches');
    });
  }
});
