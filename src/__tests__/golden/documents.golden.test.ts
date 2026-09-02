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
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
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
import { loadShowFixture } from '../helpers/show-fixture';
import { renderAllDocuments, documentNamesForFixture, type RenderedDocument } from './lib/render-documents';
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

/** Comma-separated fixture slugs (e.g.
 *  `GOLDEN_FIXTURES=south-western-champ-2026,synthetic-rkc-champ`) to
 *  render only a subset instead of all ~11 real+synthetic shows (121
 *  documents) — every render spins up a full DB fixture load plus
 *  react-pdf/poppler, so the full guard is heavy to run on every save
 *  while iterating page-by-page. Unset (the default) renders everything,
 *  which is what CI and any "does this commit still pass end to end"
 *  check must use. */
function fixtureFilter(): Set<string> | null {
  const raw = process.env.GOLDEN_FIXTURES?.trim();
  if (!raw) return null;
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function loadFixtureFiles(): { slug: string; fixture: ShowFixture }[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  const filter = fixtureFilter();
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const fixture = JSON.parse(readFileSync(path.join(FIXTURES_DIR, f), 'utf8')) as ShowFixture;
      return { slug: fixture.slug, fixture };
    })
    .filter(({ slug }) => !filter || filter.has(slug));
}

async function compareDocument(slug: string, docName: string, buffer: Buffer): Promise<void> {
  const current = await extractDocumentGeometry(buffer);
  if (process.env.GOLDEN_KEEP_PDF === '1') {
    const keepDir = path.join(OUTPUT_DIR, '_pdfs', slug);
    mkdirSync(keepDir, { recursive: true });
    writeFileSync(path.join(keepDir, `${docName}.pdf`), buffer);
  }
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
  writeFileSync(path.join(outDir, 'current.pdf'), buffer);
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

/**
 * Frozen clock. Several documents print "generated <today>" (the reports)
 * and would otherwise drift out of their baselines every midnight — the
 * guard failed 29/164 on 2026-09-02 for exactly that reason. Only `Date`
 * is faked so async DB work and child processes (poppler) are unaffected.
 * Baselines were generated on 2026-09-01; keep this date unless you also
 * regenerate every baseline.
 */
const GOLDEN_CLOCK = new Date('2026-09-01T12:00:00Z');
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(GOLDEN_CLOCK);
});
afterAll(() => {
  vi.useRealTimers();
});

describe.each(fixtures)('golden documents: $slug', ({ slug, fixture }) => {
  let rendered: RenderedDocument[] = [];
  let renderError: Error | null = null;

  beforeAll(async () => {
    const { cleanDb } = await import('../helpers/db');
    await cleanDb();
    const loaded = await loadShowFixture(db, fixture);
    try {
      rendered = await renderAllDocuments(loaded.showId, fixture);
    } catch (err) {
      renderError = err instanceof Error ? err : new Error(String(err));
    }
  }, RENDER_TIMEOUT_MS);

  // documentNamesForFixture is the SAME function renderAllDocuments() uses
  // internally to decide what to skip (e.g. ring-numbers/prize-cards/
  // ring-board/sh01 on a zero-confirmed-entries show) — so "expected" and
  // "rendered" can never drift on which documents this fixture gets.
  const names = documentNamesForFixture(fixture);

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
