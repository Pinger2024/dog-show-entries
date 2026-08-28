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
export interface CatalogueEntryNameRef {
  number: number;
  name: string;
  /** Missing on snapshots persisted before 2026-08-28 — treat as `false`. */
  isNfc?: boolean;
  /** Missing on snapshots persisted before 2026-08-28 — treat as `false`. */
  isJuniorHandler?: boolean;
}

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
  /** `shows.showRuleset` at capture time — optional because rows persisted
   *  before 2026-08-28 don't carry it; undefined is treated as non-WUSV. */
  showRuleset?: string | null;
  /** Every confirmed entry's catalogue number, in any order — used to prove the 1..N sequence has no gaps. */
  expectedNumbers: number[];
  /** Catalogue number + display name for every confirmed entry, used to prove each one actually printed. */
  entryNames: CatalogueEntryNameRef[];
}

// ─── Preflight contract — what a format truthfully requires ───────────────

/**
 * Every shape a catalogue render job can be requested in. Mirrors
 * `CatalogueFormat` in catalogue-snapshot.ts (kept as its own type here —
 * not imported — so this module, which runs inside a worker/test process,
 * never pulls in that file's web-facing dependency graph).
 */
export type PreflightFormat = 'standard' | 'by-class' | 'judging' | 'absentees' | 'marked';

/** `booklet` ⇒ the artefact must be saddle-stitchable: pages % 4 === 0.
 *  `loose` ⇒ single-sided/write-in sheets — no multiple-of-4 requirement. */
export type PreflightBinding = 'booklet' | 'loose';

/** How much of `meta.entryNames` the name-presence check holds the
 *  artefact to: every entry, only non-NFC ("competing") entries, or none
 *  (a document that is a subset of the entries by definition). */
export type PreflightCompleteness = 'all' | 'competing' | 'none';

export interface PreflightContract {
  /** What the job asked for. */
  format: PreflightFormat;
  /** What the renderer actually drew — see resolvePreflightContract's
   *  doc comment for the WUSV collapse this can differ by. */
  effectiveFormat: PreflightFormat;
  /** Short, human-readable description of the requested format, for a job row. */
  label: string;
  /** `booklet` ⇒ `page-count-booklet` runs; `loose` ⇒ `page-count-loose` runs. */
  binding: PreflightBinding;
  /** Which entries the name-presence half of catalogue-number-completeness checks. */
  completeness: PreflightCompleteness;
  /** One sentence a founder can read on the job row explaining the above. */
  rationale: string;
}

const PREFLIGHT_LABELS: Record<PreflightFormat, string> = {
  standard: 'Catalogue (standard, saddle-stitched booklet)',
  'by-class': 'Catalogue by class (saddle-stitched booklet)',
  judging: "Stewards' catalogue (write-in working sheets, not booklet-padded)",
  marked: 'Marked catalogue (post-results, not booklet-padded)',
  absentees: 'Absentee list (post-show subset, not booklet-padded)',
};

function buildPreflightRationale(
  format: PreflightFormat,
  effectiveFormat: PreflightFormat,
  binding: PreflightBinding,
): string {
  if (format !== effectiveFormat) {
    // Only reachable when showRuleset === 'wusv' and format is standard,
    // judging or absentees — marked never collapses, and by-class already
    // equals its own effective format. See resolvePreflightContract.
    const bindingNote =
      binding === 'booklet'
        ? 'still checked as a saddle-stitched booklet because that is what was requested, even though the by-class content drawn underneath is not padded to a multiple of 4'
        : 'not booklet-padded — the renderer only pads standard/by-class requests';
    return `Requested as ${format}, but this is a WUSV/SV show so the renderer draws by-class content instead; ${bindingNote}.`;
  }

  switch (format) {
    case 'standard':
      return 'Standard catalogue: saddle-stitched booklet; prints every confirmed entry, including NFC.';
    case 'by-class':
      return effectiveFormat === 'by-class' && binding === 'booklet'
        ? 'Catalogue by class: saddle-stitched booklet; prints every confirmed entry, including NFC.'
        : 'Catalogue by class: saddle-stitched booklet; SV/WUSV shows print no NFC entries, so completeness is checked against competing entries only.';
    case 'judging':
      return "Stewards' catalogue: write-in working sheets, not booklet-padded; groups by class, so NFC entries (which hold no class) are correctly absent.";
    case 'marked':
      return 'Marked catalogue: post-results record, not booklet-padded; groups by class, so NFC entries are correctly absent.';
    case 'absentees':
    default:
      return 'Absentee list: a subset of the confirmed entries by definition, not booklet-padded; entry names are not checked.';
  }
}

/**
 * The single source of truth for what a given catalogue format REQUIRES of
 * its rendered artefact — mirrors `renderCatalogueFromSnapshot` in
 * catalogue-snapshot.ts (≈lines 731-813) exactly:
 *
 *  - `effectiveFormat`: `marked` is drawn in its own branch, before the WUSV
 *    collapse, so it never changes. Every other format collapses to
 *    `by-class` when `showRuleset === 'wusv'` — the renderer's
 *    `effectiveFormat = isWusv ? 'by-class' : format` applies regardless of
 *    which of standard/by-class/judging/absentees was requested.
 *  - `binding`: mirrors `needsBookletPadding = format === 'standard' ||
 *    format === 'by-class'` — keyed on the REQUESTED format, not what was
 *    actually drawn. A WUSV `judging` request renders by-class content
 *    UNPADDED; this describes that truthfully rather than "fixing" the
 *    renderer here.
 *  - `completeness`: keyed on `effectiveFormat`, since it describes what's
 *    actually on the page. Effective `standard` prints every entry
 *    (NotForCompetitionPage, unconditional, in catalogue-ringside.tsx).
 *    Effective `by-class` prints NFC only when non-WUSV
 *    (`!isSvShow && <NotForCompetitionPage>` in catalogue-by-class.tsx).
 *    `judging` groups by class (catalogue-judging.tsx) so NFC entries,
 *    which hold no class, are never drawn. `marked` groups by class too
 *    (groupEntriesKC iterates `entry.classes`). `absentees` is a subset of
 *    the entries by definition — nothing to check.
 */
export function resolvePreflightContract(
  format: PreflightFormat,
  showRuleset: string | null | undefined,
): PreflightContract {
  const isWusv = showRuleset === 'wusv';
  const effectiveFormat: PreflightFormat = format === 'marked' ? 'marked' : isWusv ? 'by-class' : format;

  const binding: PreflightBinding = format === 'standard' || format === 'by-class' ? 'booklet' : 'loose';

  const completeness: PreflightCompleteness =
    effectiveFormat === 'standard'
      ? 'all'
      : effectiveFormat === 'by-class'
        ? isWusv
          ? 'competing'
          : 'all'
        : effectiveFormat === 'judging'
          ? 'competing'
          : effectiveFormat === 'marked'
            ? 'competing'
            : 'none'; // absentees

  return {
    format,
    effectiveFormat,
    label: PREFLIGHT_LABELS[format],
    binding,
    completeness,
    rationale: buildPreflightRationale(format, effectiveFormat, binding),
  };
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
  /** What this artefact was truthfully held to — see resolvePreflightContract. */
  contract: PreflightContract;
  checks: Check[];
  /** No FAILED 'fail'-level check. A failed 'warn'-level check does not affect this. */
  passed: boolean;
}

export interface PreflightOptions {
  /**
   * REQUIRED, not optional: which format this artefact was rendered as.
   * Every check that cares about booklet padding or which entries must be
   * named (page-count-booklet/-loose, catalogue-number-completeness) is
   * meaningless without this — the 2026-08-28 bug this contract fixes was
   * exactly a caller (document-render-worker.ts) omitting it and every PDF
   * being judged as a saddle-stitched customer catalogue regardless of what
   * it actually was. Omitting this is a compile error on purpose.
   */
  format: PreflightFormat;
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

/**
 * Fold text down to bare alphanumerics for name matching, robust to two
 * real pdftotext extraction artefacts (both verified against a stored,
 * prod-rendered PDF — see checkCatalogueNumberCompleteness's doc comment):
 *
 *  - NFKD-normalise then strip combining marks, so a curly apostrophe or an
 *    accented letter folds the same whether pdftotext preserved it, dropped
 *    it, or (as observed) emitted it as a bare space — "SADIRA'S" and
 *    "SADIRA S" both fold to "sadiras".
 *  - Keep only [a-z0-9] — whitespace/punctuation differences (a name
 *    wrapped across lines, extra inter-word spacing) never cause a
 *    false-miss.
 */
function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks left behind by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
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

/**
 * Name-presence half of catalogue-number-completeness.
 *
 * KNOWN TRAP #1: letterspaced display text (section headers, etc.) defeats
 * pdftotext's word extraction — entry BODY lines extract fine, headers
 * don't. Only match against entry names, never header wording.
 *
 * KNOWN TRAP #2 (Scotland regional, job `99012c37`, verified against the
 * exact stored PDF): `-layout` mode can mangle a real, correctly-printed
 * name. Entry #52 rasterises as `52 CH SADIRA'S YOKKO FOR ELLROOST` on the
 * page, but pdftotext -layout emits the U+2019 apostrophe in this Inter
 * subset as a SPACE — "CH SADIRA S YOKKO" — so a plain substring match on
 * the raw name reports a false MISSING. `-raw` mode (content-stream order)
 * doesn't reliably fix this either, and can itself interleave two-column
 * text differently to `-layout` — a name wrapped inside one column's cell
 * can stay contiguous in `-raw` while `-layout`'s side-by-side columns
 * interleave it with the other column's text, or vice versa. Trying BOTH
 * extractions, and folding away everything but [a-z0-9] (which absorbs the
 * apostrophe-as-space case too — "sadiras" either way) before comparing, is
 * what makes this check robust to real extraction artefacts without ever
 * false-greening on a genuinely absent name (folding never turns two
 * different names into the same string).
 */
function checkCatalogueNumberCompleteness(
  meta: CatalogueSnapshotMeta,
  layoutText: string,
  rawText: string,
  contract: PreflightContract,
): Check {
  const id = 'catalogue-number-completeness';
  const seq = describeNumberSequence(meta.expectedNumbers);

  const foldedLayout = fold(layoutText);
  const foldedRaw = fold(rawText);

  function findName(name: string): { found: boolean; empty: boolean } {
    const folded = fold(name);
    if (folded === '') return { found: false, empty: true };
    return { found: foldedLayout.includes(folded) || foldedRaw.includes(folded), empty: false };
  }

  const nfcEntries = meta.entryNames.filter((e) => !!e.isNfc);
  const namesToCheck =
    contract.completeness === 'none'
      ? []
      : contract.completeness === 'competing'
        ? meta.entryNames.filter((e) => !e.isNfc)
        : meta.entryNames; // 'all'

  const missingNames = namesToCheck
    .map((e) => ({ e, ...findName(e.name) }))
    .filter((r) => !r.found)
    .map((r) => `#${r.e.number} ${r.e.name}${r.empty ? ' (has no letters or digits)' : ''}`);

  const passed = seq.ok && missingNames.length === 0;
  const parts = [seq.detail];

  if (contract.completeness === 'none') {
    parts.push('entry names not checked — an absentee list is a subset of the entries by definition');
  } else {
    const label = contract.completeness === 'competing' ? 'competing entry name(s)' : 'entry name(s)';
    if (missingNames.length > 0) {
      const shown = missingNames.slice(0, 10).join(', ');
      parts.push(
        `${missingNames.length} ${label} not found in the rendered text: ${shown}${missingNames.length > 10 ? ', …' : ''}`,
      );
    } else {
      parts.push(`all ${namesToCheck.length} ${label} found in the rendered text`);
    }
    if (contract.completeness === 'competing' && nfcEntries.length > 0) {
      const nums = nfcEntries.map((e) => `#${e.number}`).join(', ');
      parts.push(`${nfcEntries.length} NFC entries (${nums}) are not printed in this format by design`);
    }
  }

  let detail = parts.join('; ');
  if (meta.showRuleset === 'wusv' && nfcEntries.length > 0) {
    detail +=
      ` — note: ${nfcEntries.length} NFC entries on a WUSV show; regionals allow no NFC entries and the SV catalogue does not print them`;
  }

  return { id, level: 'fail', passed, detail };
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

// ─── Check 3b: page-count-loose ────────────────────────────────────────────
// Runs INSTEAD of page-count-booklet (never both — see runCataloguePreflight)
// for any format whose contract.binding is 'loose': the renderer
// deliberately does not pad these to a multiple of 4 (needsBookletPadding
// in catalogue-snapshot.ts), so holding them to that rule is what produced
// the Clyde/Scotland false-reds this module exists to fix.

function checkPageCountLoose(pages: number, contract: PreflightContract): Check {
  const id = 'page-count-loose';
  const passed = pages >= 1;
  return {
    id,
    level: 'fail',
    passed,
    detail: passed
      ? `${pages} page(s) — ${contract.label}; not saddle-stitched, so no multiple-of-4 requirement (the renderer deliberately does not pad this format).`
      : `${pages} page(s) — ${contract.label}; expected at least 1 rendered page.`,
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
  opts: PreflightOptions,
): Promise<PreflightReport> {
  const bytes = pdf.length;
  const sha256 = sha256Hex(pdf);
  const pages = await loadPageCount(pdf);
  const contract = resolvePreflightContract(opts.format, snapshot.showRuleset);

  const tmpRoot = opts.tmpDir ?? mkdtempSync(path.join(tmpdir(), 'catalogue-preflight-'));
  const ownsTmpDir = !opts.tmpDir;

  let layoutText = '';
  let rawText = '';
  let fontsCheck: Check;
  let blankCheck: Check;
  try {
    const pdfPath = path.join(tmpRoot, 'artefact.pdf');
    writeFileSync(pdfPath, pdf);

    // Two extraction modes, not one — see checkCatalogueNumberCompleteness's
    // doc comment for why a single mode isn't enough. -layout is also
    // shared with check 6 (rkc-wording), which cares about line structure.
    layoutText = runPoppler('pdftotext', ['-layout', pdfPath, '-'], 50 * 1024 * 1024);
    rawText = runPoppler('pdftotext', ['-raw', pdfPath, '-'], 50 * 1024 * 1024);
    fontsCheck = checkFontsEmbedded(pdfPath);
    blankCheck = await checkNoBlankPages(pdfPath, pages, tmpRoot, opts);
  } finally {
    if (ownsTmpDir) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  // Exactly one of the two page-count checks — never both — per contract.binding.
  const pageCountCheck =
    contract.binding === 'booklet' ? checkPageCountBooklet(pages) : checkPageCountLoose(pages, contract);

  const checks: Check[] = [
    checkPostCloseSnapshot(snapshot),
    checkCatalogueNumberCompleteness(snapshot, layoutText, rawText, contract),
    pageCountCheck,
    fontsCheck,
    blankCheck,
    checkRkcWording(layoutText),
    checkStableIdentity(sha256, snapshot),
  ];

  const passed = checks.every((c) => c.level !== 'fail' || c.passed);

  return { artefact: { sha256, bytes, pages }, contract, checks, passed };
}
