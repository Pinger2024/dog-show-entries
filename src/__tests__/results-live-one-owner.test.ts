import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT, scanFiles } from './helpers/static-scan';

/**
 * "Is this show live" and "has it got results to look at" have ONE owner each:
 * isShowLive / showResultsState / publicShowStatus in lib/show-status.ts, and
 * showIdsWithPublishedResults in server/services/results-shows.ts.
 *
 * Before 5 Oct 2026 the show page, its link preview, the results page and Find a
 * Show each compared `status === 'in_progress'` themselves, and the show page
 * counted published results inline — so a show on its own day, before the
 * cron, was live nowhere, and the new Results page would have been a fourth
 * opinion. Mandy: people couldn't find the live results.
 */

// Every public surface that says "live" or links to results.
const PUBLIC_DIRS = ['src/app/(shows)', 'src/components/shows', 'src/app/(dashboard)/dashboard'];
const PUBLIC_FILES = ['src/lib/share-image-data.ts', 'src/app/page.tsx'];

function scanPublic(pattern: RegExp) {
  const inDirs = scanFiles(PUBLIC_DIRS, ['.tsx', '.ts'], pattern);
  const inFiles = PUBLIC_FILES.flatMap((file) =>
    fs
      .readFileSync(path.resolve(PROJECT_ROOT, file), 'utf-8')
      .split('\n')
      .flatMap((content, i) => (pattern.test(content) ? [{ file, line: i + 1, content: content.trim() }] : [])),
  );
  return [...inDirs, ...inFiles];
}

const show = (matches: Array<{ file: string; line: number; content: string }>) =>
  matches.map((m) => `  ${m.file}:${m.line}  ${m.content}`).join('\n');

describe('live results — one owner', () => {
  it("no public page compares a show's raw status to in_progress", () => {
    const matches = scanPublic(/\.status\s*===\s*['"]in_progress['"]/);
    expect(matches, `use isShowLive / publicShowStatus (lib/show-status.ts):\n${show(matches)}`).toEqual([]);
  });

  it('no public page builds its own "has results" rule from hasPublishedResults', () => {
    const matches = scanPublic(/hasPublishedResults\s*(\|\||&&)|(\|\||&&)\s*[\w.]*hasPublishedResults/);
    expect(matches, `use showResultsState (lib/show-status.ts):\n${show(matches)}`).toEqual([]);
  });

  it('the shows router never counts published results itself', () => {
    const source = fs.readFileSync(path.resolve(PROJECT_ROOT, 'src/server/trpc/routers/shows.ts'), 'utf-8');
    expect(source, 'use showIdsWithPublishedResults (services/results-shows.ts)').not.toMatch(/results\.publishedAt/);
  });
});
