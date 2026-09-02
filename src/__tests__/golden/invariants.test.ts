/**
 * Phase B proof — front-matter-on-kit.
 *
 * These invariants exist to make the four historical bugs the migration
 * brief named structurally impossible, not just absent from the real
 * shows captured so far: a cover overflowing when its officials list is
 * long, the classification/definitions page spilling onto a near-blank
 * next page, headings orphaned at a page foot, and awards defaults
 * spilling blank pages. They run against the two deliberately extreme
 * synthetic fixtures built for this purpose (see
 * generate-stress-sparse-fixtures.ts) rather than the real shows, because
 * the real shows are exactly what the migration was already proven
 * behaviour-identical against — these fixtures are sized specifically to
 * stress the adaptive paths a normal show never reaches.
 *
 * PROVING EACH INVARIANT FAILS (brief requirement — recorded here, not
 * left in the tree; full transcript in
 * research/evidence-front-matter-on-kit-2026-09-02/invariant-proof-red.md):
 *   - "no page after the first ... is more than 90% empty" and "no known
 *     section heading is the last line of a page" — checked out
 *     catalogue-front-matter.tsx from commit 7917b116 (the last commit
 *     BEFORE any of the Flow-based restructuring: ClassDefinitionsContent,
 *     JurisdictionBlock/TrophiesPage-With-Thanks, ShowInformationContent)
 *     over the current file, ran this suite, restored the current file.
 *     Both failed on the stress fixture's catalogue-by-class: page 5 sat
 *     at 0% content (the 40-definition block, still one big
 *     wrap={false} unit at that commit, moved wholesale off the
 *     preceding page) and "SHOW INFORMATION" landed as the last line of
 *     page 2 (its Welcome subsection, itself atomic, bumped to page 3 on
 *     its own). "no line's bbox falls outside its own page" and "page
 *     count stays within a sane bound" did NOT reproduce via this same
 *     revert for either fixture — for this specific content the
 *     oversized blocks still happened to fit within their own fresh
 *     page (a real console warning DOES fire during this render — "Node
 *     of type VIEW can't wrap between pages and it's bigger than
 *     available page height" — but from a document outside this file's
 *     scope, not from these two).
 *   - "no line's bbox falls outside its own page" and "page count stays
 *     within a sane bound" instead rely on the general mechanism proven
 *     directly at the kit level: pdf-kit/__tests__/keep-together.test.tsx's
 *     escape-hatch tests assert a block genuinely taller than a page
 *     paginates instead of overflowing when estimatedHeight/maxHeight are
 *     supplied, and that removing the `tooTallForOnePage` check entirely
 *     (hardcoding wrap={false}) breaks that — same underlying mechanism
 *     BestAwardsContent's and ShowInformationContent's escape hatches in
 *     this migration both use.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

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
import { renderAllDocuments, type RenderedDocument } from './lib/render-documents';
import type { ShowFixture } from '../../../scripts/lib/export-show-fixture-core';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const RENDER_TIMEOUT_MS = 180_000;

// ── Minimal, self-contained bbox extraction ──────────────────────────────
// Deliberately NOT importing pdf-kit's __tests__/poppler.ts helper: these
// stress documents run to 500KB+ of pdftotext XML (200+ exhibitors, 40
// definitions, 40 sponsorships), which overflows execFileSync's default
// 1MB stdout buffer (ENOBUFS) — that helper's tests never render anything
// this large. Same extraction shape, just with a generous maxBuffer.
interface Line {
  text: string;
  yMin: number;
  yMax: number;
}
interface Page {
  height: number;
  lines: Line[];
}

const NUM = '([-\\d.]+)';
const LINE_RE = new RegExp(`<line xMin="${NUM}" yMin="${NUM}" xMax="${NUM}" yMax="${NUM}">([\\s\\S]*?)</line>`, 'g');
const PAGE_RE = new RegExp(`<page width="${NUM}" height="${NUM}">([\\s\\S]*?)</page>`, 'g');
const WORD_RE = /<word[^>]*>([^<]*)<\/word>/g;

function extractPages(buf: Buffer): Page[] {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'invariant-bbox-'));
  const pdfPath = path.join(tmpDir, 'doc.pdf');
  writeFileSync(pdfPath, buf);
  let xml: string;
  try {
    xml = execFileSync('pdftotext', ['-bbox-layout', pdfPath, '-'], { maxBuffer: 200 * 1024 * 1024 }).toString('utf8');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const pages: Page[] = [];
  let pageMatch: RegExpExecArray | null;
  PAGE_RE.lastIndex = 0;
  while ((pageMatch = PAGE_RE.exec(xml))) {
    const [, , heightStr, pageBody] = pageMatch;
    const lines: Line[] = [];
    let lineMatch: RegExpExecArray | null;
    LINE_RE.lastIndex = 0;
    while ((lineMatch = LINE_RE.exec(pageBody))) {
      const [, , yMinStr, , yMaxStr, lineBody] = lineMatch;
      const words: string[] = [];
      let wordMatch: RegExpExecArray | null;
      WORD_RE.lastIndex = 0;
      while ((wordMatch = WORD_RE.exec(lineBody))) words.push(wordMatch[1]!);
      lines.push({ text: words.join(' ').trim(), yMin: parseFloat(yMinStr), yMax: parseFloat(yMaxStr) });
    }
    pages.push({ height: parseFloat(heightStr), lines });
  }
  return pages;
}

/** Strips every space and uppercases — the letterSpacing catalogue-
 *  styles.ts sectionBandText/coverOrgName etc. use (Amanda's masthead
 *  look) makes poppler's word/line grouping insert stray spaces WITHIN a
 *  heading unpredictably ("BEST AWARDS" → "B E S T AWA R D S" — a known,
 *  previously-documented pdftotext trap for letter-spaced RKC catalogue
 *  text, see project memory reference_rkc_catalogue_compliance_carryover).
 *  Comparing space-stripped strings sidesteps it entirely rather than
 *  trying to predict poppler's exact tokenisation. */
function squash(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase();
}

// SectionBand titles used across catalogue-front-matter.tsx (rendered
// upper-cased by styles.sectionBandText's textTransform). A heading
// appearing as the LAST line of a page — with nothing of its own body
// following it on that same page — is exactly the orphan pattern Flow/
// KeepTogether exist to prevent. Compared via squash() — see above.
const KNOWN_HEADINGS = [
  'SHOW INFORMATION',
  'LIST OF JUDGES',
  'DEFINITIONS OF CLASSES',
  'SPONSORS',
  'WITH THANKS',
  'TROPHIES & SPONSORSHIPS',
  'JURISDICTION AND RESPONSIBILITIES',
  'NOT FOR COMPETITION',
  'BEST AWARDS',
].map(squash);

// Headings that mark the end of "front matter" for the purposes of the
// near-blank-page check below: either the class listing itself starting
// (DOG/BITCH sex group bands — styles.groupHeading, used by every RKC
// catalogue format this repo has, see ChallengeCertificateHeader in
// catalogue-by-class.tsx) or a back-matter section starting (exhibitor
// index / notes / not-for-competition / the results write-in page) —
// trailing blank space THERE is normal print behaviour (a "Notes" page is
// deliberately blank; a write-in page's last item doesn't need to reach
// the bottom margin), not the "spilled onto a near-blank page" bug this
// guards against.
const FRONT_MATTER_END_MARKERS = ['DOG', 'BITCH', 'EXHIBITORINDEX', 'NOTES', 'NOTFORCOMPETITION'].map(squash);

/** First page (1-indexed) whose lines include a front-matter-end marker
 *  (see above) — the start of the actual class listing or back matter,
 *  everything before it is checked for near-blank pages. Returns
 *  pages.length + 1 ("never") if no such marker is found, so the
 *  near-blank-page check simply covers every page in that case — safer
 *  than guessing wrong and skipping the check entirely. */
function classListingStartPage(pages: Page[]): number {
  for (let i = 0; i < pages.length; i++) {
    if (pages[i]!.lines.some((l) => FRONT_MATTER_END_MARKERS.includes(squash(l.text)))) return i + 1;
  }
  return pages.length + 1;
}

async function renderFixture(slug: string): Promise<{ rendered: RenderedDocument[]; fixture: ShowFixture }> {
  vi.mocked(auth).mockReset();
  const { cleanDb } = await import('../helpers/db');
  await cleanDb();
  const fixture = JSON.parse(readFileSync(path.join(FIXTURES_DIR, `${slug}.json`), 'utf8')) as ShowFixture;
  const loaded = await loadShowFixture(db, fixture);
  const rendered = await renderAllDocuments(loaded.showId, fixture);
  return { rendered, fixture };
}

const TORTURE_FIXTURES = ['synthetic-stress-rkc-champ', 'synthetic-sparse-rkc-open'];
const CATALOGUE_DOCS = ['catalogue-standard', 'catalogue-by-class'];

// Rendering these fixtures is expensive (up to 44 pages with hundreds of
// entries); render each slug ONCE and reuse across every invariant.
const renderedBySlug = new Map<string, RenderedDocument[]>();

describe('Phase B proof — front-matter-on-kit invariants', () => {
  beforeAll(async () => {
    for (const slug of TORTURE_FIXTURES) {
      const { rendered } = await renderFixture(slug);
      renderedBySlug.set(slug, rendered);
    }
  }, RENDER_TIMEOUT_MS);

  for (const slug of TORTURE_FIXTURES) {
    for (const docName of CATALOGUE_DOCS) {
      describe(`${slug} — ${docName}`, () => {
        function getPages(): Page[] {
          const rendered = renderedBySlug.get(slug)!;
          const doc = rendered.find((r) => r.name === docName);
          if (!doc) throw new Error(`Expected ${slug} to produce ${docName}`);
          return extractPages(doc.buffer);
        }

        it('page count stays within a sane bound', () => {
          const pages = getPages();
          // Generous ceiling: catches a genuine pagination explosion (an
          // infinite-seeming cascade of near-empty pages) without being
          // fragile to legitimate content growth. The stress fixture's
          // heaviest real document (catalogue-standard) runs to ~44
          // pages; 120 gives ample headroom while still catching a
          // regression that turns "flows across a few pages" into
          // "one section per page".
          expect(pages.length).toBeGreaterThan(0);
          expect(pages.length).toBeLessThan(120);
        });

        it("no line's bbox falls outside its own page", () => {
          const pages = getPages();
          const offenders: string[] = [];
          for (const [i, page] of pages.entries()) {
            for (const line of page.lines) {
              if (line.yMax > page.height + 1 || line.yMin < -1) {
                offenders.push(`page ${i + 1}: "${line.text.slice(0, 60)}" yMin=${line.yMin} yMax=${line.yMax} (page height ${page.height})`);
              }
            }
          }
          expect(offenders).toEqual([]);
        });

        it('no page after the first, before the class listing starts, is more than 90% empty', () => {
          const pages = getPages();
          const startPage = classListingStartPage(pages);
          const offenders: string[] = [];
          // Page 1 (the cover) is deliberately excluded — a cover with
          // little configured content (the sparse fixture) legitimately
          // has empty space below a short detail card, and that's not
          // the "spilled onto a near-blank page" bug this guards against.
          for (let i = 1; i < Math.min(startPage - 1, pages.length); i++) {
            const page = pages[i]!;
            const usableHeight = page.height - 50; // top+bottom page padding, see FRONT_MATTER_PAGE_USABLE_HEIGHT
            const contentBottom = page.lines.reduce((max, l) => Math.max(max, l.yMax), 0) - 20; // top padding
            const emptyFraction = 1 - Math.max(contentBottom, 0) / usableHeight;
            if (emptyFraction > 0.9) {
              offenders.push(`page ${i + 1}: only ${((1 - emptyFraction) * 100).toFixed(0)}% of the usable height has content`);
            }
          }
          expect(offenders).toEqual([]);
        });

        it('no known section heading is the last line of a page', () => {
          const pages = getPages();
          const offenders: string[] = [];
          for (const [i, page] of pages.entries()) {
            if (page.lines.length === 0) continue;
            const lastLine = squash(page.lines[page.lines.length - 1]!.text);
            if (KNOWN_HEADINGS.some((h) => lastLine === h || lastLine.startsWith(h))) {
              offenders.push(`page ${i + 1}: last line is a heading ("${page.lines[page.lines.length - 1]!.text.trim()}")`);
            }
          }
          expect(offenders).toEqual([]);
        });
      });
    }
  }
});
