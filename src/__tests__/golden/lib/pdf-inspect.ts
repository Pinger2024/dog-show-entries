/**
 * Poppler-backed PDF inspection for the golden-document test: turn a
 * rendered PDF Buffer into a normalised, comparable geometry snapshot
 * (per-page word bounding boxes + embedded-font list), and diff two
 * snapshots into a page-numbered, human-readable summary.
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

export interface WordBox {
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
  /** One sorted word-box array per page, 0-indexed. */
  pages: WordBox[][];
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

const WORD_RE = /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]*)<\/word>/g;

function parseBboxPages(xml: string): WordBox[][] {
  // Split on <page ...> tags — each chunk (after the first) is one page's
  // content up to (but not including) the next <page or the closing </doc>.
  const pageChunks = xml.split(/<page [^>]*>/g).slice(1);
  return pageChunks.map((chunk) => {
    const words: WordBox[] = [];
    let m: RegExpExecArray | null;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(chunk))) {
      const xMin = parseFloat(m[1]!);
      const yMin = parseFloat(m[2]!);
      const xMax = parseFloat(m[3]!);
      const yMax = parseFloat(m[4]!);
      const text = decodeXmlEntities(m[5]!).trim();
      if (!text) continue;
      words.push({ text, x: round(xMin), y: round(yMin), w: round(xMax - xMin), h: round(yMax - yMin) });
    }
    words.sort((a, b) => a.y - b.y || a.x - b.x || a.text.localeCompare(b.text));
    return words;
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
    const pages = parseBboxPages(bboxXml);
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
// to hundreds of pages across dozens of words each — pretty-printed JSON
// objects (`{"text":"...","x":1,"y":2,"w":3,"h":4}` per word, repeating
// every key name) cost roughly 10x their information content. The on-disk
// shape is JSON Lines instead: a header line (`{pageCount, fonts}`) followed
// by one line per page, each page a plain array of `[text, x, y, w, h]`
// tuples — no repeated key names, no pretty-print whitespace. The in-memory
// DocumentGeometry shape (and everything that compares/diffs it) is
// unchanged; only serialiseGeometry/parseGeometry touch the file format.

export function serialiseGeometry(geo: DocumentGeometry): string {
  const header = JSON.stringify({ pageCount: geo.pageCount, fonts: geo.fonts });
  const pageLines = geo.pages.map((page) => JSON.stringify(page.map((w) => [w.text, w.x, w.y, w.w, w.h])));
  return [header, ...pageLines].join('\n') + '\n';
}

export function parseGeometry(content: string): DocumentGeometry {
  const lines = content.split('\n').filter((l) => l.length > 0);
  const header = JSON.parse(lines[0] ?? '{}') as { pageCount: number; fonts: FontInfo[] };
  const pages: WordBox[][] = lines.slice(1).map((line) => {
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
  added: WordBox[];
  removed: WordBox[];
  moved: { text: string; from: { x: number; y: number }; to: { x: number; y: number } }[];
}

export interface GeometryDiff {
  pageCountChanged: boolean;
  baselinePageCount: number;
  currentPageCount: number;
  changedPages: PageDiff[];
  fontsChanged: boolean;
  baselineFonts: FontInfo[];
  currentFonts: FontInfo[];
}

function diffWordLists(baseline: WordBox[], current: WordBox[]): Omit<PageDiff, 'page'> {
  const key = (w: WordBox) => `${w.text}|${w.x}|${w.y}|${w.w}|${w.h}`;
  const currentByKey = new Map<string, number[]>();
  current.forEach((w, i) => {
    const k = key(w);
    const list = currentByKey.get(k) ?? [];
    list.push(i);
    currentByKey.set(k, list);
  });
  const usedCurrent = new Set<number>();
  const remainingBaseline: WordBox[] = [];
  for (const w of baseline) {
    const list = currentByKey.get(key(w));
    const idx = list?.find((i) => !usedCurrent.has(i));
    if (idx !== undefined) {
      usedCurrent.add(idx);
    } else {
      remainingBaseline.push(w);
    }
  }
  const remainingCurrent = current.filter((_, i) => !usedCurrent.has(i));

  // Pair up same-text remainders as "moved"; anything left is a genuine add/remove.
  const currentByText = new Map<string, number[]>();
  remainingCurrent.forEach((w, i) => {
    const list = currentByText.get(w.text) ?? [];
    list.push(i);
    currentByText.set(w.text, list);
  });
  const matchedCurrentIdx = new Set<number>();
  const moved: PageDiff['moved'] = [];
  const removed: WordBox[] = [];
  for (const w of remainingBaseline) {
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
  return { added, removed, moved };
}

export function diffGeometry(baseline: DocumentGeometry, current: DocumentGeometry): GeometryDiff {
  const changedPages: PageDiff[] = [];
  const commonPageCount = Math.min(baseline.pageCount, current.pageCount);
  for (let i = 0; i < commonPageCount; i++) {
    const basePage = baseline.pages[i] ?? [];
    const curPage = current.pages[i] ?? [];
    if (JSON.stringify(basePage) === JSON.stringify(curPage)) continue;
    const d = diffWordLists(basePage, curPage);
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
  for (const p of diff.changedPages) {
    lines.push(`- Page ${p.page}:`);
    if (p.moved.length) {
      lines.push(`  - ${p.moved.length} word(s) moved:`);
      for (const m of p.moved.slice(0, 20)) {
        lines.push(`    - "${m.text}" (${m.from.x}, ${m.from.y}) → (${m.to.x}, ${m.to.y})`);
      }
      if (p.moved.length > 20) lines.push(`    - … and ${p.moved.length - 20} more`);
    }
    if (p.removed.length) {
      lines.push(`  - ${p.removed.length} word(s) removed: ${p.removed.slice(0, 20).map((w) => `"${w.text}"`).join(', ')}${p.removed.length > 20 ? ', …' : ''}`);
    }
    if (p.added.length) {
      lines.push(`  - ${p.added.length} word(s) added: ${p.added.slice(0, 20).map((w) => `"${w.text}"`).join(', ')}${p.added.length > 20 ? ', …' : ''}`);
    }
  }
  return lines.join('\n');
}
