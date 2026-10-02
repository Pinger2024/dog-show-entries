/**
 * pdf-kit test helper — thin wrappers around poppler's `pdftotext -bbox-layout`
 * and `pdffonts` CLIs, used by the pdf-kit test suite to inspect what a real
 * `renderToBuffer` render actually produced (word/line positions, embedded
 * fonts) rather than asserting on the React element tree.
 *
 * Deliberately regex/split-based rather than a general XML/HTML parser —
 * poppler's `-bbox-layout` output for a react-pdf-generated PDF is a small,
 * consistent, non-adversarial shape (`<page><block><line><word>`), and
 * nothing in this repo already depends on an XML parser (checked
 * package.json before writing this) — adding one just for test tooling
 * would be a bigger footprint than parsing five predictable tags.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';

export interface WordBox {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface LineBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  words: WordBox[];
  text: string;
}

export interface PageBoxes {
  width: number;
  height: number;
  lines: LineBox[];
}

function withTempPdf<T>(pdf: Uint8Array | Buffer, fn: (pdfPath: string) => T): T {
  const pdfPath = path.join(os.tmpdir(), `pdf-kit-test-${randomUUID()}.pdf`);
  fs.writeFileSync(pdfPath, pdf);
  try {
    return fn(pdfPath);
  } finally {
    fs.rmSync(pdfPath, { force: true });
  }
}

const NUM = '([-\\d.]+)';
const WORD_RE = new RegExp(`<word xMin="${NUM}" yMin="${NUM}" xMax="${NUM}" yMax="${NUM}">([^<]*)</word>`, 'g');
const LINE_RE = new RegExp(`<line xMin="${NUM}" yMin="${NUM}" xMax="${NUM}" yMax="${NUM}">([\\s\\S]*?)</line>`, 'g');
const PAGE_RE = new RegExp(`<page width="${NUM}" height="${NUM}">([\\s\\S]*?)</page>`, 'g');

/** Minimal HTML entity decode for the handful poppler emits in text content. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Runs `pdftotext -bbox-layout` on a rendered PDF and returns each page's
 * lines/words with their coordinates (points, PDF space — origin top-left,
 * matching react-pdf's own layout coordinates).
 */
export function extractBBoxLayout(pdf: Uint8Array | Buffer): PageBoxes[] {
  const xml = withTempPdf(pdf, (pdfPath) =>
    execFileSync('pdftotext', ['-bbox-layout', pdfPath, '-']).toString('utf8'),
  );

  const pages: PageBoxes[] = [];
  let pageMatch: RegExpExecArray | null;
  PAGE_RE.lastIndex = 0;
  while ((pageMatch = PAGE_RE.exec(xml))) {
    const [, widthStr, heightStr, pageBody] = pageMatch;
    const lines: LineBox[] = [];
    let lineMatch: RegExpExecArray | null;
    LINE_RE.lastIndex = 0;
    while ((lineMatch = LINE_RE.exec(pageBody))) {
      const [, xMin, yMin, xMax, yMax, lineBody] = lineMatch;
      const words: WordBox[] = [];
      let wordMatch: RegExpExecArray | null;
      WORD_RE.lastIndex = 0;
      while ((wordMatch = WORD_RE.exec(lineBody))) {
        const [, wxMin, wyMin, wxMax, wyMax, text] = wordMatch;
        words.push({
          text: decodeEntities(text),
          xMin: parseFloat(wxMin),
          yMin: parseFloat(wyMin),
          xMax: parseFloat(wxMax),
          yMax: parseFloat(wyMax),
        });
      }
      lines.push({
        xMin: parseFloat(xMin),
        yMin: parseFloat(yMin),
        xMax: parseFloat(xMax),
        yMax: parseFloat(yMax),
        words,
        text: words.map((w) => w.text).join(' '),
      });
    }
    pages.push({ width: parseFloat(widthStr), height: parseFloat(heightStr), lines });
  }
  return pages;
}

/** Convenience: width (points) of the widest line of text matching `text`
 *  (exact, trimmed) anywhere in the document — for comparing a rendered
 *  line's actual on-page width against `measureTextWidth`'s prediction. */
export function findLineWidth(pages: PageBoxes[], text: string): number | null {
  for (const page of pages) {
    for (const line of page.lines) {
      if (line.text.trim() === text.trim()) {
        return line.xMax - line.xMin;
      }
    }
  }
  return null;
}

export interface EmbeddedFont {
  name: string;
  type: string;
  encoding: string;
  embedded: boolean;
  subset: boolean;
  unicode: boolean;
}

/** Runs `pdffonts` on a rendered PDF and returns every font entry it lists,
 *  with the yes/no emb/sub/uni columns as booleans. Parses by COLUMN
 *  POSITION (from the header's dashed separator line) rather than naive
 *  whitespace-splitting, since `type`/`encoding` can themselves contain
 *  spaces (e.g. "CID TrueType", and any name containing a space would
 *  otherwise be ambiguous with the token-count approach). */
export function pdfFontsReport(pdf: Uint8Array | Buffer): EmbeddedFont[] {
  const output = withTempPdf(pdf, (pdfPath) => execFileSync('pdffonts', [pdfPath]).toString('utf8'));
  const lines = output.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const [, separatorLine, ...dataLines] = lines;

  // The separator line is a run of dash-groups separated by single spaces,
  // e.g. "------ ----- --------". Each group's [start, end) index is that
  // column's slice range in every data line (poppler left-pads/pads each
  // column to exactly the separator's width).
  const columns: Array<{ start: number; end: number }> = [];
  const dashRe = /-+/g;
  let m: RegExpExecArray | null;
  while ((m = dashRe.exec(separatorLine))) {
    columns.push({ start: m.index, end: m.index + m[0].length });
  }
  // Last column (object ID) is "object ID" as TWO space-separated numbers
  // under one dash group in the header — pdffonts pads it as one field.

  const slice = (line: string, col: { start: number; end: number }) =>
    line.length > col.start ? line.slice(col.start, col.end).trim() : '';

  return dataLines.map((line) => {
    const [nameCol, typeCol, encodingCol, embCol, subCol, uniCol] = columns;
    return {
      name: slice(line, nameCol),
      type: slice(line, typeCol),
      encoding: slice(line, encodingCol),
      embedded: slice(line, embCol) === 'yes',
      subset: slice(line, subCol) === 'yes',
      unicode: slice(line, uniCol) === 'yes',
    };
  });
}
