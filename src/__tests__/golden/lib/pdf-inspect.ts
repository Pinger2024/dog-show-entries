/**
 * Poppler-backed PDF inspection for the golden-document test: turn a
 * rendered PDF Buffer into a normalised, comparable geometry snapshot
 * (per-page LINE bounding boxes + embedded-font list), and diff two
 * snapshots into a page-numbered, human-readable summary.
 *
 * LINE-level, not word-level (changed 2026-09-02): a real-fixture proof-red
 * (synthetic-wusv-regional, schedule pages 4/6) showed pdftotext -bbox-layout
 * split words around U+2019 (curly apostrophe) differently between two
 * IDENTICAL renders of the same PDF — "'a'-stamp." as one word one run,
 * "'a" + "-stamp." the next. This isn't a real layout change; it's
 * pdftotext's word-boundary heuristic reacting to something in the
 * font-subsetter's glyph ordering that isn't itself content-stable across
 * renders. Comparing at the LINE level and folding each line's full text
 * down to [a-z0-9] (stripping every space/punctuation mark, including
 * whichever ones a run's word-splitting put where) makes the comparison
 * blind to exactly that class of noise: "'a'-stamp." and "'a" + "-stamp."
 * both fold to "astamp" regardless of where the word boundary landed. A
 * LINE's own bounding box (not the union of its words') is still a
 * meaningful, stable position signal — poppler computes it once from the
 * line's baseline/ascent/descent, independent of word splitting.
 *
 * Deliberately independent of src/lib/catalogue-preflight.ts (which shells
 * out to the same poppler binaries for a different purpose — print
 * preflight, not layout-regression detection) rather than importing from
 * it, so this test's pass/fail never depends on that module's internals.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** One line of text on a page, folded to bare [a-z0-9] (case, spacing, and
 *  punctuation-diacritics all collapsed away — see `fold()`) plus its own
 *  bounding box. */
export interface LineEntry {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FontInfo {
  name: string;
  embedded: boolean;
}

export interface DocumentGeometry {
  pageCount: number;
  /** One sorted line-entry array per page, 0-indexed. */
  pages: LineEntry[][];
  fonts: FontInfo[];
}

function runPoppler(bin: string, args: string[], maxBuffer = 50 * 1024 * 1024): string {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', maxBuffer });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `golden pdf-inspect: required poppler-utils binary "${bin}" was not found on PATH. ` +
          `Install poppler-utils (macOS: \`brew install poppler\`; Debian/Ubuntu/CI: \`sudo apt-get install -y poppler-utils\`).`,
      );
    }
    throw err;
  }
}

const round = (n: number) => Math.round(n * 2) / 2;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Fold text down to bare [a-z0-9] — case, whitespace, and punctuation
 *  (including apostrophes/diacritics) all collapsed away, matching
 *  catalogue-preflight.ts's `fold()` (same rationale: pdftotext's word-
 *  splitting around an apostrophe or accented letter isn't stable, and
 *  the ACTUAL content — the letters and digits — is what a layout
 *  regression would actually change). Duplicated rather than imported;
 *  see the file header for why this module doesn't import from that one. */
function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks left behind by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const WORD_RE = /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]*)<\/word>/g;
const LINE_RE = /<line xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([\s\S]*?)<\/line>/g;

function parseBboxLines(xml: string): LineEntry[][] {
  // Split on <page ...> tags — each chunk (after the first) is one page's
  // content up to (but not including) the next <page or the closing </doc>.
  const pageChunks = xml.split(/<page [^>]*>/g).slice(1);
  return pageChunks.map((chunk) => {
    const lines: LineEntry[] = [];
    let lm: RegExpExecArray | null;
    LINE_RE.lastIndex = 0;
    while ((lm = LINE_RE.exec(chunk))) {
      const xMin = parseFloat(lm[1]!);
      const yMin = parseFloat(lm[2]!);
      const xMax = parseFloat(lm[3]!);
      const yMax = parseFloat(lm[4]!);
      const inner = lm[5]!;
      // The line's own bbox is what we keep — words inside it only
      // contribute their TEXT (joined, then folded), never their
      // individual boxes, since word-boundary placement is exactly the
      // noise source this rewrite exists to ignore.
      const words: string[] = [];
      let wm: RegExpExecArray | null;
      WORD_RE.lastIndex = 0;
      while ((wm = WORD_RE.exec(inner))) {
        words.push(decodeXmlEntities(wm[5]!));
      }
      const folded = fold(words.join(' '));
      if (!folded) continue; // a line of pure punctuation/whitespace carries no comparable content
      lines.push({ text: folded, x: round(xMin), y: round(yMin), w: round(xMax - xMin), h: round(yMax - yMin) });
    }
    lines.sort((a, b) => a.y - b.y || a.x - b.x || a.text.localeCompare(b.text));
    return lines;
  });
}

interface PdffontsRow {
  name: string;
  embedded: boolean;
}

/** Same fixed-width-column parsing approach as catalogue-preflight.ts's
 *  parsePdffontsRows (poppler pads every column to the width of its dashes
 *  row) — duplicated rather than imported, see the file header. */
function parsePdffontsRows(output: string): PdffontsRow[] {
  const lines = output.split(/\r?\n/);
  const dashLineIdx = lines.findIndex((l) => /^-+(\s-+)*\s*$/.test(l));
  if (dashLineIdx === -1) return [];
  const dashLine = lines[dashLineIdx]!;
  const ranges: [number, number][] = [];
  const dashRe = /-+/g;
  let m: RegExpExecArray | null;
  while ((m = dashRe.exec(dashLine))) ranges.push([m.index, m.index + m[0].length]);
  const NAME_COLUMN = 0;
  const EMB_COLUMN = 3;
  if (ranges.length <= EMB_COLUMN) return [];
  const dataLines = lines.slice(dashLineIdx + 1).filter((l) => l.trim().length > 0);
  return dataLines.map((line) => {
    const [nameStart, nameEnd] = ranges[NAME_COLUMN]!;
    const [embStart, embEnd] = ranges[EMB_COLUMN]!;
    const rawName = line.slice(nameStart, nameEnd).trim() || line.trim();
    // Every PDF subsetter (react-pdf included) prefixes an embedded font's
    // PostScript name with a random 6-uppercase-letter subset TAG (e.g.
    // "ABCDEF+Inter-Regular") — a fresh, random tag on every single render,
    // completely unrelated to layout. Comparing raw names would make this
    // test flaky-fail on every run purely from that noise (confirmed
    // empirically: two consecutive renders of the same fixture produced
    // fonts differing ONLY in this tag). Strip it before it ever reaches a
    // baseline or a diff.
    const name = rawName.replace(/^[A-Z]{6}\+/, '');
    const embField = line.slice(embStart, embEnd).trim().toLowerCase();
    return { name, embedded: embField === 'yes' };
  });
}

export async function extractDocumentGeometry(pdf: Buffer): Promise<DocumentGeometry> {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'golden-pdf-'));
  try {
    const pdfPath = path.join(tmpDir, 'doc.pdf');
    writeFileSync(pdfPath, pdf);
    const bboxXml = runPoppler('pdftotext', ['-bbox-layout', pdfPath, '-']);
    const pages = parseBboxLines(bboxXml);
    const fontsOutput = runPoppler('pdffonts', [pdfPath]);
    const fonts = parsePdffontsRows(fontsOutput).map((r) => ({ name: r.name, embedded: r.embedded }));
    return { pageCount: pages.length, pages, fonts };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Compact on-disk baseline format ───────────────────────────────────────
//
// A baseline is committed to git, and a real show's rendered documents run
// to hundreds of pages across dozens of lines each — pretty-printed JSON
// objects (`{"text":"...","x":1,"y":2,"w":3,"h":4}` per line, repeating
// every key name) cost roughly 10x their information content. The on-disk
// shape is JSON Lines instead: a header line (`{pageCount, fonts}`) followed
// by one line per PAGE, each page a plain array of `[text, x, y, w, h]`
// tuples (one tuple per LINE of the page) — no repeated key names, no
// pretty-print whitespace. The in-memory DocumentGeometry shape (and
// everything that compares/diffs it) is unchanged; only serialiseGeometry/
// parseGeometry touch the file format.

export function serialiseGeometry(geo: DocumentGeometry): string {
  const header = JSON.stringify({ pageCount: geo.pageCount, fonts: geo.fonts });
  const pageLines = geo.pages.map((page) => JSON.stringify(page.map((w) => [w.text, w.x, w.y, w.w, w.h])));
  return [header, ...pageLines].join('\n') + '\n';
}

export function parseGeometry(content: string): DocumentGeometry {
  const lines = content.split('\n').filter((l) => l.length > 0);
  const header = JSON.parse(lines[0] ?? '{}') as { pageCount: number; fonts: FontInfo[] };
  const pages: LineEntry[][] = lines.slice(1).map((line) => {
    const tuples = JSON.parse(line) as [string, number, number, number, number][];
    return tuples.map(([text, x, y, w, h]) => ({ text, x, y, w, h }));
  });
  return { pageCount: header.pageCount ?? pages.length, fonts: header.fonts ?? [], pages };
}

/** Render N pages of a PDF as low-res PNGs into `outDir`, named
 *  `page-01.png`, `page-02.png`, ... (1-indexed, matching the page numbers
 *  used elsewhere in this test's failure messages). */
export function rasterisePages(pdf: Buffer, pageNumbers1Indexed: number[], outDir: string): void {
  if (pageNumbers1Indexed.length === 0) return;
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'golden-raster-'));
  try {
    const pdfPath = path.join(tmpDir, 'doc.pdf');
    writeFileSync(pdfPath, pdf);
    for (const pageNum of pageNumbers1Indexed) {
      const prefix = path.join(outDir, `page-${String(pageNum).padStart(2, '0')}`);
      runPoppler('pdftoppm', ['-r', '60', '-f', String(pageNum), '-l', String(pageNum), '-png', pdfPath, prefix]);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Diffing ────────────────────────────────────────────────────────────

export interface PageDiff {
  page: number; // 1-indexed
  added: LineEntry[];
  removed: LineEntry[];
  moved: { text: string; from: { x: number; y: number }; to: { x: number; y: number } }[];
  /** Lines resolved by the text-layer-drift tolerance (see isDroppedLetterMatch)
   *  rather than a genuine geometry difference — only non-empty on a page
   *  that's ALSO here for another, real reason (a drift-only page never
   *  reaches `changedPages` at all; see GeometryDiff.textDrift for those). */
  textDrift: { baseline: string; current: string }[];
}

export interface GeometryDiff {
  pageCountChanged: boolean;
  baselinePageCount: number;
  currentPageCount: number;
  changedPages: PageDiff[];
  fontsChanged: boolean;
  baselineFonts: FontInfo[];
  currentFonts: FontInfo[];
  /** EVERY text-layer-drift resolution across the whole document, flat,
   *  independent of whether its page also had a genuine change — this is
   *  what lets a caller count occurrences even on a document that
   *  otherwise passes outright. See isDroppedLetterMatch's doc comment. */
  textDrift: { page: number; baseline: string; current: string; x: number; y: number }[];
}

/** True if every character of `a` appears in `b`, in order (a — possibly
 *  gappy — subsequence). The shape a dropped-letter render takes: a
 *  confirmed fontkit/pdfkit process-state issue (not a poppler/layout
 *  one — the rasterised page is identical either way) occasionally drops
 *  specific letters from the PDF's ToUnicode text layer on ~1 render in
 *  6, so "friday" extracts as "fridy", "isjudged" as "isudged", etc. —
 *  "fridy" is "friday" with one character skipped, i.e. a subsequence of
 *  it. Root-caused as out of scope for this comparator; tolerating it
 *  here is the fix for THIS test. */
function isSubsequence(a: string, b: string): boolean {
  let i = 0;
  for (let j = 0; j < b.length && i < a.length; j++) {
    if (a[i] === b[j]) i++;
  }
  return i === a.length;
}

/** Same text modulo one side having dropped (or, symmetrically, gained)
 *  some letters — i.e. one folded string is a subsequence of the other.
 *  Deliberately excludes the `a === b` case (that's a real exact match,
 *  handled by diffLineLists' first pass) and deliberately does NOT match
 *  e.g. "abc" vs "bca" (same letters, different order) — a genuine
 *  content change, not a dropped letter. */
function isDroppedLetterMatch(a: string, b: string): boolean {
  if (a === b) return false;
  if (!a || !b) return false;
  return isSubsequence(a, b) || isSubsequence(b, a);
}

function diffLineLists(baseline: LineEntry[], current: LineEntry[]): Omit<PageDiff, 'page'> {
  const key = (w: LineEntry) => `${w.text}|${w.x}|${w.y}|${w.w}|${w.h}`;
  const currentByKey = new Map<string, number[]>();
  current.forEach((w, i) => {
    const k = key(w);
    const list = currentByKey.get(k) ?? [];
    list.push(i);
    currentByKey.set(k, list);
  });
  const usedCurrent = new Set<number>();
  const remainingBaseline: LineEntry[] = [];
  for (const w of baseline) {
    const list = currentByKey.get(key(w));
    const idx = list?.find((i) => !usedCurrent.has(i));
    if (idx !== undefined) {
      usedCurrent.add(idx);
    } else {
      remainingBaseline.push(w);
    }
  }
  let remainingCurrent = current.filter((_, i) => !usedCurrent.has(i));

  // Text-layer-drift pass: a line whose bbox matches EXACTLY but whose
  // folded text differs only by a dropped/added letter isn't a real
  // layout change (see isDroppedLetterMatch above) — resolve these BEFORE
  // the moved/added/removed pairing below, so a dropped-letter line never
  // gets reported as a false add+remove (or worse, pairs by coincidence
  // with some unrelated same-text line elsewhere and reports as "moved").
  const textDrift: PageDiff['textDrift'] = [];
  const stillRemainingBaseline: LineEntry[] = [];
  for (const w of remainingBaseline) {
    const matchIdx = remainingCurrent.findIndex(
      (c) => c.x === w.x && c.y === w.y && c.w === w.w && c.h === w.h && isDroppedLetterMatch(w.text, c.text),
    );
    if (matchIdx === -1) {
      stillRemainingBaseline.push(w);
      continue;
    }
    textDrift.push({ baseline: w.text, current: remainingCurrent[matchIdx]!.text });
    remainingCurrent = remainingCurrent.filter((_, i) => i !== matchIdx);
  }

  // Pair up same-text remainders as "moved"; anything left is a genuine add/remove.
  const currentByText = new Map<string, number[]>();
  remainingCurrent.forEach((w, i) => {
    const list = currentByText.get(w.text) ?? [];
    list.push(i);
    currentByText.set(w.text, list);
  });
  const matchedCurrentIdx = new Set<number>();
  const moved: PageDiff['moved'] = [];
  const removed: LineEntry[] = [];
  for (const w of stillRemainingBaseline) {
    const list = currentByText.get(w.text);
    const idx = list?.shift();
    if (idx !== undefined) {
      matchedCurrentIdx.add(idx);
      const to = remainingCurrent[idx]!;
      moved.push({ text: w.text, from: { x: w.x, y: w.y }, to: { x: to.x, y: to.y } });
    } else {
      removed.push(w);
    }
  }
  const added = remainingCurrent.filter((_, i) => !matchedCurrentIdx.has(i));
  return { added, removed, moved, textDrift };
}

export function diffGeometry(baseline: DocumentGeometry, current: DocumentGeometry): GeometryDiff {
  const changedPages: PageDiff[] = [];
  const textDrift: GeometryDiff['textDrift'] = [];
  const commonPageCount = Math.min(baseline.pageCount, current.pageCount);
  for (let i = 0; i < commonPageCount; i++) {
    const basePage = baseline.pages[i] ?? [];
    const curPage = current.pages[i] ?? [];
    if (JSON.stringify(basePage) === JSON.stringify(curPage)) continue;
    const d = diffLineLists(basePage, curPage);
    for (const t of d.textDrift) {
      const line = curPage.find((l) => l.text === t.current) ?? basePage.find((l) => l.text === t.baseline);
      textDrift.push({ page: i + 1, baseline: t.baseline, current: t.current, x: line?.x ?? 0, y: line?.y ?? 0 });
    }
    if (d.added.length || d.removed.length || d.moved.length) {
      changedPages.push({ page: i + 1, ...d });
    }
  }
  const fontsChanged = JSON.stringify(baseline.fonts) !== JSON.stringify(current.fonts);
  return {
    pageCountChanged: baseline.pageCount !== current.pageCount,
    baselinePageCount: baseline.pageCount,
    currentPageCount: current.pageCount,
    changedPages,
    fontsChanged,
    baselineFonts: baseline.fonts,
    currentFonts: current.fonts,
    textDrift,
  };
}

export function isGeometryDiffEmpty(diff: GeometryDiff): boolean {
  return !diff.pageCountChanged && diff.changedPages.length === 0 && !diff.fontsChanged;
}

export function summariseDiff(documentLabel: string, diff: GeometryDiff): string {
  const lines: string[] = [`## ${documentLabel}`, ''];
  if (diff.pageCountChanged) {
    lines.push(`- Page count changed: ${diff.baselinePageCount} → ${diff.currentPageCount}`);
  }
  if (diff.fontsChanged) {
    const baseNames = diff.baselineFonts.map((f) => `${f.name}(${f.embedded ? 'embedded' : 'NOT embedded'})`).join(', ');
    const curNames = diff.currentFonts.map((f) => `${f.name}(${f.embedded ? 'embedded' : 'NOT embedded'})`).join(', ');
    lines.push(`- Fonts changed:`, `  - baseline: ${baseNames || '(none)'}`, `  - current:  ${curNames || '(none)'}`);
  }
  if (diff.textDrift.length) {
    lines.push(
      `- Text-layer drift (dropped letters): ${diff.textDrift.length} occurrence(s) — bbox matched exactly, ` +
        `text differed only by a dropped/added letter (known fontkit/pdfkit process-state issue, not a ` +
        `layout change — tolerated, does not fail this test):`,
    );
    for (const t of diff.textDrift.slice(0, 20)) {
      lines.push(`  - page ${t.page} (${t.x}, ${t.y}): baseline "${t.baseline}" vs current "${t.current}"`);
    }
    if (diff.textDrift.length > 20) lines.push(`  - … and ${diff.textDrift.length - 20} more`);
  }
  for (const p of diff.changedPages) {
    lines.push(`- Page ${p.page}:`);
    if (p.textDrift.length) {
      lines.push(`  - ${p.textDrift.length} line(s) resolved as text-layer drift (see note above), not counted as a change:`);
      for (const t of p.textDrift.slice(0, 20)) {
        lines.push(`    - baseline "${t.baseline}" vs current "${t.current}"`);
      }
    }
    if (p.moved.length) {
      lines.push(`  - ${p.moved.length} line(s) moved:`);
      for (const m of p.moved.slice(0, 20)) {
        lines.push(`    - "${m.text}" (${m.from.x}, ${m.from.y}) → (${m.to.x}, ${m.to.y})`);
      }
      if (p.moved.length > 20) lines.push(`    - … and ${p.moved.length - 20} more`);
    }
    if (p.removed.length) {
      lines.push(`  - ${p.removed.length} line(s) removed: ${p.removed.slice(0, 20).map((w) => `"${w.text}"`).join(', ')}${p.removed.length > 20 ? ', …' : ''}`);
    }
    if (p.added.length) {
      lines.push(`  - ${p.added.length} line(s) added: ${p.added.slice(0, 20).map((w) => `"${w.text}"`).join(', ')}${p.added.length > 20 ? ', …' : ''}`);
    }
  }
  return lines.join('\n');
}
