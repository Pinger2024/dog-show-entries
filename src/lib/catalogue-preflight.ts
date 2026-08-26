import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

/**
 * Machine-readable catalogue print preflight.
 *
 * `runCataloguePreflight` proves a *stored catalogue artefact* (a PDF buffer
 * that has already been rendered and, in the job pipeline this module feeds,
 * uploaded/archived) is actually print-ready, instead of a founder eyeballing
 * a PDF the night before it goes to Doxzoo/Mixam. It never renders anything
 * itself — it only inspects bytes that were already produced.
 *
 * Design constraints (see CLAUDE.md — "never state status from memory",
 * "prove the test fails"):
 *  - Every check result is a typed, JSON-serialisable `Check`, so a worker
 *    can persist/alert on it without re-parsing prose.
 *  - Nothing here is coupled to a test runner — it can be called in-process
 *    from a background job.
 *  - Poppler (pdftotext/pdffonts/pdftoppm) absence throws a clear, named
 *    error rather than a cryptic ENOENT from execFileSync.
 */

/**
 * The metadata a catalogue-generation job snapshots alongside the rendered
 * PDF, at the moment the artefact was captured/archived. This is the
 * contract another agent's job pipeline needs to produce — every field here
 * is read by at least one check below.
 */
export interface CatalogueSnapshotMeta {
  /** `shows.status` at capture time (e.g. 'entries_closed', 'in_progress'). */
  showStatus: string;
  /** ISO date/datetime of `shows.entryCloseDate`, or null if the show has none set. */
  entryCloseDate: string | null;
  /** ISO datetime `resortCatalogueNumbers` last ran, or null if numbers were never locked. */
  catalogueNumbersLockedAt: string | null;
  /** ISO datetime this snapshot (and the accompanying PDF) was captured. */
  capturedAt: string;
  /** Git SHA of the renderer build that produced the PDF, or null if unknown/uncaptured. */
  rendererGitSha: string | null;
  /** Every confirmed entry's catalogue number, in any order — used to prove the 1..N sequence has no gaps. */
  expectedNumbers: number[];
  /** Catalogue number + display name for every confirmed entry, used to prove each one actually printed. */
  entryNames: { number: number; name: string }[];
}

export type CheckLevel = 'fail' | 'warn';

export interface Check {
  /** Stable machine-readable identifier, e.g. 'page-count-booklet'. */
  id: string;
  level: CheckLevel;
  passed: boolean;
  /** Human-readable explanation — always populated, on pass or fail. */
  detail: string;
}

export interface PreflightReport {
  artefact: {
    sha256: string;
    bytes: number;
    pages: number;
  };
  checks: Check[];
  /** No FAILED 'fail'-level check. A failed 'warn'-level check does not affect this. */
  passed: boolean;
}

export interface PreflightOptions {
  /**
   * Fraction of white pixels (0–1, after thresholding at 250/255) at or
   * above which a rasterised page counts as blank. Default 0.997, tuned
   * against real fixtures (see catalogue-preflight.test.ts): a genuinely
   * blank page rasterises to ~1.0, while a real ruled Notes/back-cover
   * padding page (see pdf-pad.ts's drawNotesPage) measures ~0.986 at the
   * default DPI — comfortably below this threshold.
   */
  blankPageWhiteThreshold?: number;
  /** DPI for the blank-page rasterisation pass. Default 40 — fast, and
   *  sufficient to separate "genuinely blank" from "sparse ruled/text". */
  blankPageDpi?: number;
  /**
   * Directory to do scratch work in (a temp copy of the PDF + rasterised
   * page images). Defaults to a fresh `mkdtemp` under the OS tmp dir, which
   * is removed when the function returns. Pass one explicitly if the caller
   * wants to inspect the intermediate files, or manage cleanup itself — in
   * that case, cleanup is the CALLER's responsibility.
   */
  tmpDir?: string;
}

const POST_CLOSE_STATUSES = new Set(['entries_closed', 'in_progress', 'completed']);

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function loadPageCount(pdf: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  return doc.getPageCount();
}

/**
 * Shell out to a poppler-utils binary, turning a missing-binary ENOENT into
 * an error that names exactly what to install — the raw Node error just
 * says "spawn pdftotext ENOENT", which is useless to whoever sees it first.
 */
function runPoppler(bin: string, args: string[], maxBuffer = 20 * 1024 * 1024): string {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', maxBuffer });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `catalogue-preflight: required poppler-utils binary "${bin}" was not found on PATH. ` +
        `Install poppler-utils (macOS: \`brew install poppler\`; Debian/Ubuntu/CI: \`sudo apt-get install -y poppler-utils\`).`,
      );
    }
    throw err;
  }
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ─── Check 1: post-close-snapshot ──────────────────────────────────────────

function checkPostCloseSnapshot(snapshot: CatalogueSnapshotMeta): Check {
  const id = 'post-close-snapshot';

  if (!snapshot.entryCloseDate) {
    return {
      id,
      level: 'warn',
      passed: true,
      detail: 'No entry close date recorded on the show — cannot verify the snapshot was captured after entries closed.',
    };
  }

  const closeMs = Date.parse(snapshot.entryCloseDate);
  const capturedMs = Date.parse(snapshot.capturedAt);
  const closeDateValid = !Number.isNaN(closeMs);
  const capturedValid = !Number.isNaN(capturedMs);
  const capturedAfterClose = closeDateValid && capturedValid && capturedMs >= closeMs;
  const statusOk = POST_CLOSE_STATUSES.has(snapshot.showStatus);
  const passed = capturedAfterClose && statusOk;

  if (passed) {
    return {
      id,
      level: 'fail',
      passed,
      detail: `Snapshot captured ${snapshot.capturedAt}, on/after entry close ${snapshot.entryCloseDate}, with show status "${snapshot.showStatus}".`,
    };
  }

  const reasons: string[] = [];
  if (!closeDateValid) reasons.push(`entryCloseDate "${snapshot.entryCloseDate}" is not a parseable date`);
  if (!capturedValid) reasons.push(`capturedAt "${snapshot.capturedAt}" is not a parseable date`);
  if (closeDateValid && capturedValid && !capturedAfterClose) {
    reasons.push(`captured ${snapshot.capturedAt} is before the entry close date ${snapshot.entryCloseDate}`);
  }
  if (!statusOk) {
    reasons.push(`show status "${snapshot.showStatus}" is not one of entries_closed/in_progress/completed`);
  }

  return { id, level: 'fail', passed, detail: `Not a valid post-close snapshot: ${reasons.join('; ')}.` };
}

// ─── Check 2: catalogue-number-completeness ────────────────────────────────

function describeNumberSequence(numbers: number[]): { ok: boolean; detail: string } {
  if (numbers.length === 0) {
    return { ok: false, detail: 'expectedNumbers is empty — no confirmed entries to check' };
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const dupes = [...new Set(sorted.filter((n, i) => i > 0 && n === sorted[i - 1]))];
  if (dupes.length > 0) {
    return { ok: false, detail: `duplicate catalogue number(s): ${dupes.join(', ')}` };
  }
  const n = sorted.length;
  if (sorted[0] !== 1 || sorted[n - 1] !== n) {
    return {
      ok: false,
      detail: `catalogue numbers run ${sorted[0]}–${sorted[n - 1]} across ${n} entries — not a gapless 1..${n} sequence`,
    };
  }
  const gaps: number[] = [];
  for (let i = 0; i < n; i++) {
    if (sorted[i] !== i + 1) gaps.push(i + 1);
  }
  if (gaps.length > 0) {
    return { ok: false, detail: `gap(s) in the catalogue number sequence at: ${gaps.join(', ')}` };
  }
  return { ok: true, detail: `catalogue numbers form a gapless 1..${n} sequence` };
}

function checkCatalogueNumberCompleteness(snapshot: CatalogueSnapshotMeta, pdfText: string): Check {
  const id = 'catalogue-number-completeness';
  const seq = describeNumberSequence(snapshot.expectedNumbers);

  // KNOWN TRAP: letterspaced display text (section headers, etc.) defeats
  // pdftotext's word extraction — entry BODY lines extract fine, headers
  // don't. Only match against entry names, never header wording.
  const normalizedText = normalizeForMatch(pdfText);
  const missingNames = snapshot.entryNames
    .filter((e) => !normalizedText.includes(normalizeForMatch(e.name)))
    .map((e) => `#${e.number} ${e.name}`);

  const passed = seq.ok && missingNames.length === 0;
  const parts = [seq.detail];
  if (missingNames.length > 0) {
    const shown = missingNames.slice(0, 10).join(', ');
    parts.push(
      `${missingNames.length} entry name(s) not found in the rendered text: ${shown}${missingNames.length > 10 ? ', …' : ''}`,
    );
  } else {
    parts.push(`all ${snapshot.entryNames.length} entry name(s) found in the rendered text`);
  }

  return { id, level: 'fail', passed, detail: parts.join('; ') };
}

// ─── Check 3: page-count-booklet ───────────────────────────────────────────

function checkPageCountBooklet(pages: number): Check {
  const id = 'page-count-booklet';
  const passed = pages > 0 && pages % 4 === 0;
  return {
    id,
    level: 'fail',
    passed,
    detail: passed
      ? `${pages} pages — a positive multiple of 4, saddle-stitch booklet ready.`
      : `${pages} pages is not a positive multiple of 4 — saddle-stitch booklets need page count % 4 === 0 (pad with padPdfToMultiple before print).`,
  };
}

// ─── Check 4: fonts-embedded ────────────────────────────────────────────────

interface PdffontsRow {
  name: string;
  embedded: boolean;
}

/**
 * pdffonts prints a fixed-width table, e.g.:
 *   name                                 type              encoding         emb sub uni object ID
 *   ------------------------------------ ----------------- ---------------- --- --- --- ---------
 *   ABCDEF+Inter-Regular                 CID TrueType      Identity-H       yes yes yes      7  0
 *   Helvetica                            Type 1            WinAnsi          no  no  no       4  0
 *
 * The "type" column can itself contain a space ("CID TrueType"), so a naive
 * whitespace split misaligns columns. Instead, derive each column's [start,
 * end) character range from the dashes row (poppler pads every column to
 * that width) and slice by index — robust regardless of what's inside a cell.
 */
function parsePdffontsRows(output: string): PdffontsRow[] {
  const lines = output.split(/\r?\n/);
  const dashLineIdx = lines.findIndex((l) => /^-+(\s-+)*\s*$/.test(l));
  if (dashLineIdx === -1) return [];

  const dashLine = lines[dashLineIdx]!;
  const ranges: [number, number][] = [];
  const dashRe = /-+/g;
  let m: RegExpExecArray | null;
  while ((m = dashRe.exec(dashLine))) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  // Column order is fixed: name, type, encoding, emb, sub, uni, object ID.
  const NAME_COLUMN = 0;
  const EMB_COLUMN = 3;
  if (ranges.length <= EMB_COLUMN) return [];

  const dataLines = lines.slice(dashLineIdx + 1).filter((l) => l.trim().length > 0);
  return dataLines.map((line) => {
    const [nameStart, nameEnd] = ranges[NAME_COLUMN]!;
    const [embStart, embEnd] = ranges[EMB_COLUMN]!;
    const name = line.slice(nameStart, nameEnd).trim() || line.trim();
    const embField = line.slice(embStart, embEnd).trim().toLowerCase();
    return { name, embedded: embField === 'yes' };
  });
}

function checkFontsEmbedded(pdfPath: string): Check {
  const id = 'fonts-embedded';
  const output = runPoppler('pdffonts', [pdfPath]);
  const rows = parsePdffontsRows(output);

  if (rows.length === 0) {
    return {
      id,
      level: 'fail',
      passed: false,
      detail: 'pdffonts reported no fonts at all — cannot confirm embedding (empty or unparseable output).',
    };
  }

  const unembedded = rows.filter((r) => !r.embedded);
  const passed = unembedded.length === 0;
  return {
    id,
    level: 'fail',
    passed,
    detail: passed
      ? `All ${rows.length} font(s) embedded: ${rows.map((r) => r.name).join(', ')}.`
      : `${unembedded.length} unembedded font(s): ${unembedded.map((r) => r.name).join(', ')}. Print preflight rejects unembedded fonts — run stripUnembeddedBase14Fonts or embed the real font before generating this artefact.`,
  };
}

// ─── Check 5: no-blank-pages ────────────────────────────────────────────────

async function checkNoBlankPages(
  pdfPath: string,
  pageCount: number,
  scratchDir: string,
  opts: PreflightOptions,
): Promise<Check> {
  const id = 'no-blank-pages';
  const dpi = opts.blankPageDpi ?? 40;
  const threshold = opts.blankPageWhiteThreshold ?? 0.997;

  const rasterDir = mkdtempSync(path.join(scratchDir, 'raster-'));
  const prefix = path.join(rasterDir, 'page');
  // -gray: single channel, sufficient (and faster) for a whiteness check.
  // Explicit -png (rather than poppler's default PPM) so sharp reads it
  // without any format ambiguity.
  runPoppler('pdftoppm', ['-gray', '-r', String(dpi), '-png', pdfPath, prefix]);

  const rasterised = readdirSync(rasterDir)
    .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
    .map((f) => {
      const match = f.match(/-(\d+)\.png$/);
      return { file: f, page: match ? parseInt(match[1]!, 10) : NaN };
    })
    .filter((f) => Number.isFinite(f.page))
    .sort((a, b) => a.page - b.page);

  const blankPages: number[] = [];
  for (const { file, page } of rasterised) {
    const buf = readFileSync(path.join(rasterDir, file));
    // Threshold to pure black/white at 250/255, then the channel mean IS the
    // fraction of pixels that are (near-)white — a direct, sharp.stats()-based
    // whiteness measurement rather than an approximation from the raw mean.
    const stats = await sharp(buf).threshold(250).stats();
    const whiteFraction = (stats.channels[0]?.mean ?? 0) / 255;
    if (whiteFraction >= threshold) blankPages.push(page);
  }

  const rasterCountOk = rasterised.length === pageCount;
  const passed = blankPages.length === 0 && rasterCountOk;

  const parts: string[] = [];
  if (!rasterCountOk) {
    parts.push(`rasterised ${rasterised.length} page image(s) but the document has ${pageCount} page(s)`);
  }
  if (blankPages.length > 0) {
    parts.push(
      `blank page(s) at position(s) ${blankPages.join(', ')} (≥${(threshold * 100).toFixed(1)}% white at ${dpi}dpi)`,
    );
  }
  if (passed) {
    parts.push(`no blank pages across ${rasterised.length} page(s) at ${dpi}dpi (threshold ${(threshold * 100).toFixed(1)}% white)`);
  }

  return { id, level: 'fail', passed, detail: parts.join('; ') };
}

// ─── Check 6: rkc-wording (warn only) ──────────────────────────────────────

function checkRkcWording(pdfText: string): Check {
  const id = 'rkc-wording';
  // \b before K only matches when the preceding character is NOT a word
  // character, so `\bKC\b` never matches the "KC" inside "RKC" — no extra
  // exclusion logic needed for that case.
  const pattern = /\bKC\b/;
  const lines = pdfText.split(/\r?\n/);
  const hits: string[] = [];
  lines.forEach((line, idx) => {
    if (pattern.test(line)) hits.push(`line ${idx + 1}: ${line.trim()}`);
  });

  const passed = hits.length === 0;
  return {
    id,
    level: 'warn',
    passed,
    detail: passed
      ? 'No standalone "KC" wording found outside "RKC".'
      : `${hits.length} line(s) use "KC" where the site convention is "RKC" — may be legitimate user-entered text ` +
        `(e.g. a judge bio mentioning "KC A-List"), review before treating as a bug: ${hits.slice(0, 10).join(' | ')}${hits.length > 10 ? ' | …' : ''}`,
  };
}

// ─── Check 7: stable-identity ───────────────────────────────────────────────

function checkStableIdentity(sha256: string, snapshot: CatalogueSnapshotMeta): Check {
  const id = 'stable-identity';
  const sha256Valid = /^[0-9a-f]{64}$/.test(sha256);

  if (!sha256Valid) {
    return { id, level: 'fail', passed: false, detail: `Computed artefact sha256 is malformed: "${sha256}".` };
  }

  if (snapshot.rendererGitSha === null) {
    return {
      id,
      level: 'warn',
      passed: true,
      detail: `Artefact sha256 ${sha256} recorded, but no rendererGitSha was captured with this snapshot (explicit null) — cannot trace this artefact back to the exact renderer build.`,
    };
  }

  if (!snapshot.rendererGitSha.trim()) {
    return {
      id,
      level: 'fail',
      passed: false,
      detail: 'rendererGitSha is an empty string, not a recorded sha or an explicit null.',
    };
  }

  return {
    id,
    level: 'fail',
    passed: true,
    detail: `Artefact sha256 ${sha256} recorded, renderer build ${snapshot.rendererGitSha}.`,
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function runCataloguePreflight(
  pdf: Buffer,
  snapshot: CatalogueSnapshotMeta,
  opts: PreflightOptions = {},
): Promise<PreflightReport> {
  const bytes = pdf.length;
  const sha256 = sha256Hex(pdf);
  const pages = await loadPageCount(pdf);

  const tmpRoot = opts.tmpDir ?? mkdtempSync(path.join(tmpdir(), 'catalogue-preflight-'));
  const ownsTmpDir = !opts.tmpDir;

  let pdfText = '';
  let fontsCheck: Check;
  let blankCheck: Check;
  try {
    const pdfPath = path.join(tmpRoot, 'artefact.pdf');
    writeFileSync(pdfPath, pdf);

    // Shared across checks 2 and 6 — one pdftotext shell-out, not two.
    pdfText = runPoppler('pdftotext', ['-layout', pdfPath, '-'], 50 * 1024 * 1024);
    fontsCheck = checkFontsEmbedded(pdfPath);
    blankCheck = await checkNoBlankPages(pdfPath, pages, tmpRoot, opts);
  } finally {
    if (ownsTmpDir) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  const checks: Check[] = [
    checkPostCloseSnapshot(snapshot),
    checkCatalogueNumberCompleteness(snapshot, pdfText),
    checkPageCountBooklet(pages),
    fontsCheck,
    blankCheck,
    checkRkcWording(pdfText),
    checkStableIdentity(sha256, snapshot),
  ];

  const passed = checks.every((c) => c.level !== 'fail' || c.passed);

  return { artefact: { sha256, bytes, pages }, checks, passed };
}
