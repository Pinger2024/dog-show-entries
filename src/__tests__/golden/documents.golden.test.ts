/**
 * Golden-document safety net for the upcoming layout refactor.
 *
 * For every fixture in src/__tests__/golden/fixtures/*.json: load it into
 * remi_test, render every applicable RKC document through the REAL route
 * handlers / DB-free catalogue seam (no @react-pdf/renderer, storage, or
 * poppler mocking — see lib/render-documents.ts), extract each page's word
 * geometry + embedded-font list via poppler, and compare against a stored
 * baseline. A mismatch fails naming exactly which show, document, and pages
 * changed, and writes rendered PNGs of the changed pages + a diff.md under
 * golden-output/ (gitignored) for a human to look at.
 *
 * Run: `npm run golden` (or `npm test`, which includes this file).
 * Update baselines after an intentional layout change: `npm run golden:update`.
 * A missing baseline is written automatically and the test passes with a
 * console notice — review the new baseline file into git deliberately.
 *
 * Auth is mocked the same way src/__tests__/integration/pdf-routes.test.ts
 * mocks it (a fake NextAuth session + no impersonation) — that's the only
 * thing standing in for a real browser session; everything downstream is
 * real.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { CATALOGUE_FORMATS } from '@/server/services/catalogue-snapshot';
import { loadShowFixture } from '../helpers/show-fixture';
import { renderAllDocuments, reportTypesForRuleset, type RenderedDocument } from './lib/render-documents';
import {
  extractDocumentGeometry,
  diffGeometry,
  isGeometryDiffEmpty,
  summariseDiff,
  rasterisePages,
  serialiseGeometry,
  parseGeometry,
} from './lib/pdf-inspect';
import type { ShowFixture } from '../../../scripts/lib/export-show-fixture-core';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const BASELINE_DIR = path.join(__dirname, 'baseline');
const OUTPUT_DIR = path.join(process.cwd(), 'golden-output');
const RENDER_TIMEOUT_MS = 180_000;

function loadFixtureFiles(): { slug: string; fixture: ShowFixture }[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const fixture = JSON.parse(readFileSync(path.join(FIXTURES_DIR, f), 'utf8')) as ShowFixture;
      return { slug: fixture.slug, fixture };
    });
}

/** Must match exactly what lib/render-documents.ts's renderAllDocuments()
 *  emits — computed statically (from the fixture JSON alone) so it.each can
 *  declare test cases at collection time, before any async rendering runs.
 *  The report list is ruleset-aware via the SAME reportTypesForRuleset()
 *  renderAllDocuments() itself calls, so a WUSV fixture's extra sv-results/
 *  grading-cards reports can never drift between "expected" and "rendered". */
function expectedDocumentNames(fixture: ShowFixture): string[] {
  const showRow = fixture.tables.shows[0] as { showRuleset?: string | null } | undefined;
  const reportNames = reportTypesForRuleset(showRow?.showRuleset ?? null).map((t) => `report-${t}`);
  const names = [
    ...CATALOGUE_FORMATS.map((f) => `catalogue-${f}`),
    'schedule',
    'judges-book',
    'prize-cards',
    'ring-numbers-multi-up',
    'ring-numbers-single',
    'ring-board',
    ...reportNames,
  ];
  if (fixture.tables.invoices.length > 0) names.push('invoice');
  return names;
}

async function compareDocument(slug: string, docName: string, buffer: Buffer): Promise<void> {
  const current = await extractDocumentGeometry(buffer);
  // .jsonl (not .json): one JSON value per line — a header line
  // ({pageCount, fonts}) then one [text,x,y,w,h] tuple array per page. See
  // pdf-inspect.ts's serialiseGeometry/parseGeometry doc comment — this
  // keeps a real show's baseline to a fraction of pretty-printed JSON's
  // size (measured ~5x smaller on the synthetic fixture), which matters
  // once several real-show fixtures are committed alongside it.
  const baselinePath = path.join(BASELINE_DIR, slug, `${docName}.jsonl`);

  if (process.env.GOLDEN_UPDATE === '1') {
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, serialiseGeometry(current));
    console.log(`[golden] updated baseline: ${slug}/${docName} (${current.pageCount} page(s))`);
    return;
  }

  if (!existsSync(baselinePath)) {
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, serialiseGeometry(current));
    console.log(
      `[golden] NOTICE: no baseline existed for ${slug}/${docName} — wrote one now ` +
        `(${current.pageCount} page(s)). Review the new file into git.`,
    );
    return;
  }

  const baseline = parseGeometry(readFileSync(baselinePath, 'utf8'));
  const diff = diffGeometry(baseline, current);
  if (isGeometryDiffEmpty(diff)) return;

  const outDir = path.join(OUTPUT_DIR, slug, docName);
  mkdirSync(outDir, { recursive: true });
  const changedPageNumbers = diff.changedPages.map((p) => p.page);
  rasterisePages(buffer, changedPageNumbers, outDir);
  const summary = summariseDiff(`${slug} — ${docName}`, diff);
  writeFileSync(path.join(outDir, 'diff.md'), summary + '\n');

  const pageDescription = diff.pageCountChanged
    ? `page count ${diff.baselinePageCount} → ${diff.currentPageCount}`
    : `page(s) ${diff.changedPages.map((p) => p.page).join(', ')}`;

  expect.fail(
    `Golden document mismatch — show "${slug}", document "${docName}": ${pageDescription} changed.\n` +
      `See ${path.relative(process.cwd(), outDir)}/diff.md and rendered page PNGs there.\n` +
      `If this change is intentional: \`npm run golden:update\` and commit the new baseline.`,
  );
}

const fixtures = loadFixtureFiles();

it('has at least one golden fixture to render', () => {
  expect(fixtures.length).toBeGreaterThan(0);
});

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

describe.each(fixtures)('golden documents: $slug', ({ slug, fixture }) => {
  let rendered: RenderedDocument[] = [];
  let renderError: Error | null = null;

  beforeAll(async () => {
    const { cleanDb } = await import('../helpers/db');
    await cleanDb();
    const loaded = await loadShowFixture(db, fixture);
    try {
      rendered = await renderAllDocuments(loaded.showId);
    } catch (err) {
      renderError = err instanceof Error ? err : new Error(String(err));
    }
  }, RENDER_TIMEOUT_MS);

  const names = expectedDocumentNames(fixture);

  it.each(names)('%s matches its baseline', async (docName) => {
    if (renderError) throw renderError;
    const doc = rendered.find((r) => r.name === docName);
    if (!doc) {
      throw new Error(
        `Expected renderAllDocuments() to produce "${docName}" for fixture "${slug}", but it didn't. ` +
          `Rendered: ${rendered.map((r) => r.name).join(', ') || '(none)'}`,
      );
    }
    await compareDocument(slug, docName, doc.buffer);
  }, 30_000);
});
