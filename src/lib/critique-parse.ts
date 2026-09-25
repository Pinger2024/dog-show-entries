/**
 * Deterministic parser for UK dog-show judge critique documents (Word doc
 * text or pasted text). Ported from the proven prototype
 * (research/prototype-parse-critiques.js, verified 27/27 against
 * research/judge-critiques-sample-2026-07-31.txt — 16 classes, 27
 * critiques) with one behaviour change from the prototype: a header-like
 * line that doesn't match the show's actual class list becomes its own
 * `unmatched` block instead of being silently folded into the preceding
 * critique's prose — the prototype's one documented trap. See
 * research/DESIGN-judge-critique-upload-2026-07-31.md.
 *
 * Pure — no DB imports. The caller supplies the show's real class list
 * (name + sex per show_class) so header matching never depends on a
 * hardcoded vocabulary; critique-match.ts does the results-graph matching.
 */

export type ClassListEntry = {
  showClassId: string;
  /** Class base name WITHOUT the Dog/Bitch suffix, e.g. "Veteran", "Post Graduate". */
  className: string;
  sex: 'dog' | 'bitch';
};

export type ParsedBlockKind = 'critique' | 'overview' | 'unmatched';

export type ParsedBlock = {
  kind: ParsedBlockKind;
  classNameRaw: string | null;
  /** Placement position (1st, 2nd, ...); null for non-critique blocks. */
  position: number | null;
  ownersRaw: string | null;
  dogRaw: string | null;
  dogNameCleaned: string | null;
  pedigreeRaw: string | null;
  critiqueText: string;
  /** show_classes.id the header line matched, or null (unmatched/overview, or unrecognised header). */
  matchedShowClassId: string | null;
};

export type ParsedCritiqueDocument = {
  v: 1;
  blocks: ParsedBlock[];
};

// ── Noise handling: blank-line runs (page-break artefacts) and the literal
// embedded-image placeholder line are dropped before any structural
// parsing, so they can never corrupt or split a critique. ──
function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (t === '') return true;
  if (t.toLowerCase() === 'image') return true;
  return false;
}

// ── Placement-line detection: "<ordinal>, <OWNERS> <dash> <DOG NAME>" ──
// Judges write a placement in more than one way. The comma after the ordinal
// was mandatory here until 2026-08-23, which meant a judge who wrote
// "1st GAYVILLE VARINKA WITH TRIMIKA (...)" — no comma, no owner — had NOTHING
// recognised: all 46 placements in the BAGSD 2026 document fell through as
// unrecognised text and Mandy matched every one by hand.
//
// Now the ordinal may be followed by a comma OR simply a space. Deliberately no
// looser than that: the separator must still be present, so ordinary prose
// starting with a number ("2 year old male...") cannot be read as a placement.
const PLACEMENT_RE = /^(\d+)(?:st|nd|rd|th)(?:,\s*|\s+)(.+)$/;

// A pedigree written INLINE inside the placement line rather than on its own
// line beneath it — "DOG NAME (Sire vom X x Dam vom Y) then the critique...".
// Requires an " x " or " - " separator inside the brackets, so an ordinary
// parenthetical aside in the prose ("(a lovely mover)") is never mistaken for
// breeding. Captures what precedes it, the breeding itself, and any prose that
// runs on after the closing bracket.
const INLINE_PEDIGREE_RE = /^(.*?)\s*\(([^()]*(?:\s+x\s+|\s+-\s+)[^()]*)\)\s*(.*)$/i;

// Owner/dog separator: an en dash or hyphen, always surrounded by single
// spaces. Owners can contain commas/ampersands but never a spaced dash in
// the samples seen, so the LAST spaced dash in the line is the split point
// (an owner list can be long; the dog name is always the final segment).
const OWNER_DOG_SEP_RE = /\s[–-]\s/g;

function splitOwnersAndDog(rest: string): { ownersRaw: string; dogRaw: string } {
  let lastIndex = -1;
  let lastLen = 0;
  let m: RegExpExecArray | null;
  OWNER_DOG_SEP_RE.lastIndex = 0;
  while ((m = OWNER_DOG_SEP_RE.exec(rest)) !== null) {
    lastIndex = m.index;
    lastLen = m[0].length;
  }
  // No spaced dash at all: the judge has named the dog and no owner. Treat the
  // whole segment as the DOG, not as owners — a placement that names only an
  // owner and no dog is of no use to anyone, whereas "1st ROSEBUD EDIE" is the
  // common shape once owners are omitted (BAGSD 2026).
  if (lastIndex === -1) return { ownersRaw: '', dogRaw: rest.trim() };
  return {
    ownersRaw: rest.slice(0, lastIndex).trim(),
    dogRaw: rest.slice(lastIndex + lastLen).trim(),
  };
}

// ── Pedigree line: "(SIRE - DAM)" or "(SIRE x DAM)", captured raw. ──
const PEDIGREE_LINE_RE = /^\((.*)\)$/;

// ── dogNameCleaned — strip title/award decoration to approximate the
// registered name.
//
// SAFE strips: trailing award-suffix tokens from a fixed whitelist
// (ShCM, VW, JW — known post-nominal show-award abbreviations that never
// occur as the last word of a real registered name); leading champion-title
// tokens from a fixed whitelist (CH, VCH, INT), or a slash-joined run of
// 2-8 letter uppercase codes (e.g. "IR/NLD/BEL/LUX/HR/SWISS/INT") — these
// only ever appear as country/title prefixes, never as kennel-name words.
//
// NEVER stripped: a trailing parenthetical import marker "(IMP xxx)" is
// peeled off before suffix-stripping and reattached untouched afterwards;
// "AT/OF/WITH <KENNEL>", "ZU <...>", "VOM/VON/DE LA/DU/AV <...>" are never
// touched (false negatives are far less damaging than false positives that
// eat part of a real name). We never strip past 0 remaining tokens. ──
export const AWARD_SUFFIXES = new Set(['ShCM', 'VW', 'JW']);
export const LEADING_TITLE_WHITELIST = new Set(['CH', 'VCH', 'INT']);
export const SLASH_CODE_RE = /^[A-Z]{2,8}(\/[A-Z]{2,8})+$/;

export function cleanDogName(dogRaw: string): string {
  if (!dogRaw) return dogRaw;
  let working = dogRaw.trim();

  // Peel off one trailing parenthetical block so it's immune to
  // suffix-token stripping, then reattach untouched at the end.
  let trailingParen = '';
  const parenMatch = working.match(/\s*(\([^()]*\))\s*$/);
  if (parenMatch) {
    trailingParen = parenMatch[1];
    working = working.slice(0, parenMatch.index).trim();
  }

  let tokens = working.length ? working.split(/\s+/) : [];

  while (tokens.length > 1 && AWARD_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  let start = 0;
  while (start < tokens.length - 1) {
    const t = tokens[start];
    if (LEADING_TITLE_WHITELIST.has(t) || SLASH_CODE_RE.test(t)) {
      start++;
    } else {
      break;
    }
  }
  tokens = tokens.slice(start);

  let cleaned = tokens.join(' ');
  if (trailingParen) cleaned = cleaned ? `${cleaned} ${trailingParen}` : trailingParen;
  return cleaned;
}

// ── Header matching against the show's real class list ──
function normalizeHeaderText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildHeaderLookup(classList: ClassListEntry[]): Map<string, ClassListEntry> {
  const lookup = new Map<string, ClassListEntry>();
  for (const entry of classList) {
    const sexLabel = entry.sex === 'dog' ? 'Dog' : 'Bitch';
    lookup.set(normalizeHeaderText(`${entry.className} ${sexLabel}`), entry);
    // A mixed-sex class has no Dog/Bitch to name, and judges head it however
    // they like — "VETERAN", "VETERAN MIXED CLASS" (BAGSD 2026). toClassList
    // expands such a class into BOTH sexes, so registering the bare name and
    // the "mixed class" phrasing here is enough for either to resolve. First
    // writer wins, which is the dog entry — harmless, since both point at the
    // same show_class.
    for (const alias of [entry.className, `${entry.className} Mixed Class`, `${entry.className} Mixed`]) {
      const key = normalizeHeaderText(alias);
      if (!lookup.has(key)) lookup.set(key, entry);
    }
  }
  return lookup;
}

// Judges routinely number their class headings the way the schedule does —
// "5 Junior Dog", "Class 12. Open Bitch" (Mandy's own Waikato 2023 critiques
// do this throughout). Try the header as written first, then with a leading
// class number stripped. Only the line side is stripped — class names
// themselves never carry schedule numbers.
function lookupHeader(
  lookup: Map<string, ClassListEntry>,
  line: string,
): ClassListEntry | undefined {
  const norm = normalizeHeaderText(line);
  return lookup.get(norm) ?? lookup.get(norm.replace(/^(?:class\s+)?\d{1,3}\s+/, ''));
}

// A header-like line resembles a class header by SHAPE (short, Title Case,
// no trailing punctuation, no digits) whether or not it's in the show's
// actual class list — used to catch an unrecognised/mistyped class header
// so it surfaces as its own `unmatched` block instead of being swallowed
// into the preceding critique's prose.
function looksLikeHeaderShaped(t: string): boolean {
  if (t.length === 0 || t.length > 40) return false;
  if (/[.,;:]$/.test(t)) return false;
  if (/\d/.test(t)) return false;
  const words = t.split(/\s+/);
  return words.every((w) => /^[A-Z]/.test(w) || ['of', 'and', 'the'].includes(w.toLowerCase()));
}

function emptyBlock(kind: ParsedBlockKind, overrides: Partial<ParsedBlock> = {}): ParsedBlock {
  return {
    kind,
    classNameRaw: null,
    position: null,
    ownersRaw: null,
    dogRaw: null,
    dogNameCleaned: null,
    pedigreeRaw: null,
    critiqueText: '',
    matchedShowClassId: null,
    ...overrides,
  };
}

export function parseCritiqueDocument(
  text: string,
  classList: ClassListEntry[],
): ParsedCritiqueDocument {
  const headerLookup = buildHeaderLookup(classList);
  const content: string[] = text
    .split(/\r?\n/)
    .filter((l) => !isNoiseLine(l))
    .map((l) => l.trim());

  const isAnyHeaderLine = (line: string) =>
    lookupHeader(headerLookup, line) !== undefined || looksLikeHeaderShaped(line);

  const blocks: ParsedBlock[] = [];
  let i = 0;

  // Text before the first header (recognised or not) is the judge's
  // overview — thanks to the committee, general remarks, etc. Stops at a
  // placement line too, so a paste that starts mid-document (no header yet)
  // surfaces its placements as reviewable blocks instead of eating them.
  const overviewLines: string[] = [];
  while (i < content.length && !isAnyHeaderLine(content[i]) && !PLACEMENT_RE.test(content[i])) {
    overviewLines.push(content[i]);
    i++;
  }
  const overviewText = overviewLines.join(' ').replace(/\s+/g, ' ').trim();
  if (overviewText) {
    blocks.push(emptyBlock('overview', { critiqueText: overviewText }));
  }

  let currentShowClassId: string | null = null;
  let currentClassNameRaw: string | null = null;

  while (i < content.length) {
    const line = content[i];
    const matched = lookupHeader(headerLookup, line);

    if (matched) {
      currentShowClassId = matched.showClassId;
      currentClassNameRaw = line;
      i++;
      continue;
    }

    if (looksLikeHeaderShaped(line)) {
      // Header-shaped but not in the show's class list — its own block,
      // never folded into the preceding critique's prose. Subsequent
      // placements can't be trusted to belong to the OLD class, so drop
      // back to "no current class" rather than misattributing them.
      blocks.push(emptyBlock('unmatched', { classNameRaw: line }));
      currentShowClassId = null;
      currentClassNameRaw = null;
      i++;
      continue;
    }

    const pm = PLACEMENT_RE.exec(line);
    if (pm) {
      const position = parseInt(pm[1], 10);

      // The remainder may carry the breeding and the critique inline —
      // "DOG (Sire x Dam) 8 year old female, ..." — or be just the dog, with
      // the breeding on the next line and the prose below that. Peel off an
      // inline pedigree first so it never ends up inside the dog's name.
      let remainder = pm[2];
      let pedigreeRaw: string | null = null;
      let inlineProse = '';
      const inline = INLINE_PEDIGREE_RE.exec(remainder);
      if (inline) {
        remainder = inline[1].trim();
        pedigreeRaw = inline[2].trim();
        inlineProse = inline[3].trim();
      }

      const { ownersRaw, dogRaw } = splitOwnersAndDog(remainder);
      i++;

      // Breeding on its own line beneath, the original layout. Only consulted
      // when it wasn't already found inline.
      if (pedigreeRaw === null && i < content.length) {
        const pedMatch = PEDIGREE_LINE_RE.exec(content[i]);
        if (pedMatch) {
          pedigreeRaw = pedMatch[1].trim();
          i++;
        }
      }

      // Consume critique prose until the next header (recognised or
      // header-shaped) or placement line.
      // Prose that ran on after the inline pedigree comes first, then any
      // further lines beneath, so both layouts produce one critique.
      const proseLines: string[] = inlineProse ? [inlineProse] : [];
      while (i < content.length && !isAnyHeaderLine(content[i]) && !PLACEMENT_RE.test(content[i])) {
        proseLines.push(content[i]);
        i++;
      }

      blocks.push(
        emptyBlock('critique', {
          classNameRaw: currentClassNameRaw,
          position,
          ownersRaw,
          dogRaw,
          dogNameCleaned: cleanDogName(dogRaw),
          pedigreeRaw,
          critiqueText: proseLines.join(' ').replace(/\s+/g, ' ').trim(),
          matchedShowClassId: currentShowClassId,
        }),
      );
      continue;
    }

    // Neither a header nor a placement, and not consumed as prose by a
    // preceding placement (shouldn't happen in a well-formed doc) — kept
    // as its own unmatched block rather than silently dropped.
    blocks.push(emptyBlock('unmatched', { critiqueText: line }));
    i++;
  }

  return { v: 1, blocks };
}
