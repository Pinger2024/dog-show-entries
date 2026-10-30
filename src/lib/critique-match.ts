/**
 * Matches parsed critique blocks (critique-parse.ts) against the show's
 * results graph — class+placement is the primary key, cleaned-dog-name
 * similarity is a confidence signal, not a match key. Pure — no DB imports;
 * the caller resolves show_classes → entry_classes → entries → dogs →
 * results into the narrow ResultsGraph shape below.
 *
 * See research/DESIGN-judge-critique-upload-2026-07-31.md.
 */
import type { ParsedBlock, ParsedCritiqueDocument } from './critique-parse';
import { getPlacementLabel } from './placements';

export type ResultsGraphEntry = {
  entryClassId: string;
  placement: number;
  /** entries.catalogue_number — one number per dog per show, so a judge who
   *  wrote "14." has identified the dog completely. null before numbering. */
  catalogueNumber: string | null;
  registeredName: string;
  /** Non-empty when a steward already typed a critique on the day. */
  existingCritiqueText: string | null;
};

export type ResultsGraphShowClass = {
  showClassId: string;
  className: string;
  /** null for a mixed, Junior Handling or Special Award class. */
  sex: 'dog' | 'bitch' | null;
  entries: ResultsGraphEntry[];
};

/** How a class is named to the judge and the secretary in review —
 *  "Limit Dog", "Veteran" — one wording for hints, cards and pickers. */
export function critiqueClassLabel(className: string, sex: 'dog' | 'bitch' | null): string {
  return sex === 'dog' ? `${className} Dog` : sex === 'bitch' ? `${className} Bitch` : className;
}

/** "14" and "014" are the same catalogue number; " 14 " too. */
function sameCatalogueNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().replace(/^0+(?=\d)/, '') === b.trim().replace(/^0+(?=\d)/, '');
}

export type BlockConfidence = 'exact' | 'check' | 'unmatched';

export type MatchedBlock = ParsedBlock & {
  matchedEntryClassId: string | null;
  confidence: BlockConfidence;
  /** Steward already wrote a critique for this dog — both versions kept for an explicit choice. */
  conflict: { existingText: string } | null;
  resolution: 'document' | 'existing' | null;
  include: boolean;
  /** Award mentions detected in the critique prose — review hints only, never drive matching. */
  hints: string[];
};

export type MatchedCritiqueDocument = {
  v: 1;
  blocks: MatchedBlock[];
};

const AWARD_PHRASES = ['Dog CC', 'Bitch CC', 'Challenge Certificate', 'Reserve CC', 'Best Puppy'];

function detectAwardMentions(text: string): string[] {
  const found: string[] = [];
  for (const phrase of AWARD_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(text)) found.push(phrase);
  }
  return found;
}

// Trim/case/punctuation-insensitive comparison, with a token-order-
// insensitive fallback (registered names in the DB have case variants and
// trailing spaces; a judge's transcription can reorder nothing but we
// normalise defensively anyway).
//
// Judges write a dog's name the way people say it, not the way it's
// registered (Hugh De Zutter, South Western 2026: half his 50 came up amber).
// These are the SAME dog, so they match exactly:
//   - an import tag or award in brackets — "BENZES VOM AMUR (IMP DEU)", "(VW)"
//   - apostrophes — "Wakematt's Luco" / "WAKEMATTS LUCO"
//   - "v" / "von" for "vom" — "Billie v Huhnegrab"
//   - titles in front — "Ch", "Int Ch.", "IR CH Multi International CH"
// A misspelling ("Kleenhugel" / "KLEEHUEGEL") is still amber: the secretary
// confirms it by eye.
const NAME_TITLE_TOKENS = new Set(['ch', 'sh', 'int', 'ir', 'multi', 'international', 'champion']);
const NAME_VOM_TOKENS = new Set(['v', 'vom', 'von']);

// Also the Find a Dog search's notion of a name (services/public-dog-summary.ts),
// so "wakematts luco" or "billie v huhnegrab" finds the dog it would match here.
export function normalizeName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/\([^()]*\)/g, ' ')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => (NAME_VOM_TOKENS.has(t) ? 'vom' : t));
  while (tokens.length > 1 && NAME_TITLE_TOKENS.has(tokens[0]!)) tokens.shift();
  return tokens.join(' ');
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(' ').filter(Boolean).sort().join(' ');
  const tb = nb.split(' ').filter(Boolean).sort().join(' ');
  return ta === tb;
}

type NumberMatch = {
  entry: ResultsGraphEntry | null;
  confidence: BlockConfidence;
  hints: string[];
};

/**
 * Matches a block the judge wrote by CATALOGUE NUMBER (the numbered layout,
 * critique-parse.ts). The number is unique per show, so it decides the dog;
 * the heading and the heading's bracketed placing order are checks on it:
 *
 *  - number placed under the heading's class → that dog;
 *  - heading had no sex word and the parser guessed wrong ("Minor Puppy
 *    (33-32)") → the sibling class of the same name, no fuss;
 *  - number placed once, but not where the heading says → that dog, amber,
 *    with a hint saying where it IS placed (a heading the judge left out,
 *    or a slip of the pen — the secretary decides);
 *  - number placed in two classes with nothing to choose between them, or
 *    not placed at all → no match, with a hint saying so;
 *  - the judge's bracketed order disagrees with the steward's placing →
 *    amber, with both in the hint. Never resolved silently: the steward's
 *    record and the judge's document are two sources of equal standing.
 */
function matchByCatalogueNumber(
  block: ParsedBlock,
  resultsGraph: ResultsGraphShowClass[],
  headingClass: ResultsGraphShowClass | undefined,
): NumberMatch {
  const n = block.catalogueNumberRaw!.trim();
  const candidates: { sc: ResultsGraphShowClass; entry: ResultsGraphEntry }[] = [];
  for (const sc of resultsGraph) {
    for (const entry of sc.entries) {
      if (sameCatalogueNumber(entry.catalogueNumber, n)) candidates.push({ sc, entry });
    }
  }
  const headingLabel = headingClass ? critiqueClassLabel(headingClass.className, headingClass.sex) : null;

  if (candidates.length === 0) {
    return {
      entry: null,
      confidence: 'unmatched',
      hints: [`No dog numbered ${n} was placed${headingLabel ? ` in ${headingLabel}` : ' at this show'}.`],
    };
  }

  let picked: { sc: ResultsGraphShowClass; entry: ResultsGraphEntry } | undefined;
  let classAgrees = true;
  if (headingClass) {
    picked =
      candidates.find((c) => c.sc.showClassId === headingClass.showClassId) ??
      candidates.find((c) => c.sc.className === headingClass.className);
    if (!picked && candidates.length === 1) {
      picked = candidates[0];
      classAgrees = false;
    }
  } else if (candidates.length === 1) {
    picked = candidates[0];
  }

  if (!picked) {
    const where = candidates.map((c) => critiqueClassLabel(c.sc.className, c.sc.sex));
    return {
      entry: null,
      confidence: 'unmatched',
      hints: [`No. ${n} is placed in more than one class: ${where.join(' and ')}. Choose the right one.`],
    };
  }

  const hints: string[] = [];
  if (!classAgrees) {
    hints.push(
      `No. ${n} is placed ${getPlacementLabel(picked.entry.placement)} in ${critiqueClassLabel(picked.sc.className, picked.sc.sex)}, not in ${headingLabel} where the judge listed it.`,
    );
  }
  const placingAgrees = block.position == null || block.position === picked.entry.placement;
  if (!placingAgrees) {
    hints.push(
      `The judge's order puts No. ${n} ${getPlacementLabel(block.position!)}; the steward recorded ${getPlacementLabel(picked.entry.placement)}.`,
    );
  }
  return {
    entry: picked.entry,
    confidence: classAgrees && placingAgrees ? 'exact' : 'check',
    hints,
  };
}

export function matchCritiqueBlocks(
  parsed: ParsedCritiqueDocument,
  resultsGraph: ResultsGraphShowClass[],
): MatchedCritiqueDocument {
  const showClassById = new Map(resultsGraph.map((sc) => [sc.showClassId, sc]));

  const blocks: MatchedBlock[] = parsed.blocks.map((block) => {
    const hints = detectAwardMentions(block.critiqueText);

    if (block.kind !== 'critique') {
      return {
        ...block,
        matchedEntryClassId: null,
        confidence: 'unmatched' as const,
        conflict: null,
        resolution: null,
        // A text-less unmatched block (an unrecognised class header on its
        // own) carries nothing publishable — defaulting it to excluded keeps
        // it visible in review without blocking the publish gate.
        include: block.kind === 'overview' || block.critiqueText.trim().length > 0,
        hints,
      };
    }

    const showClass = block.matchedShowClassId ? showClassById.get(block.matchedShowClassId) : undefined;

    if (block.catalogueNumberRaw) {
      const byNumber = matchByCatalogueNumber(block, resultsGraph, showClass);
      const existingText = byNumber.entry?.existingCritiqueText?.trim() ?? '';
      const conflict =
        byNumber.entry && existingText && existingText !== block.critiqueText.trim()
          ? { existingText: byNumber.entry.existingCritiqueText! }
          : null;
      return {
        ...block,
        matchedEntryClassId: byNumber.entry?.entryClassId ?? null,
        confidence: byNumber.confidence,
        conflict,
        resolution: null,
        include: true,
        hints: [...byNumber.hints, ...hints],
      };
    }

    const entry = showClass?.entries.find((e) => e.placement === block.position);

    if (!entry) {
      return {
        ...block,
        matchedEntryClassId: null,
        confidence: 'unmatched',
        conflict: null,
        resolution: null,
        include: true,
        hints,
      };
    }

    const confidence: BlockConfidence = namesMatch(block.dogNameCleaned ?? '', entry.registeredName)
      ? 'exact'
      : 'check';

    const existingText = entry.existingCritiqueText?.trim() ?? '';
    const conflict =
      existingText && existingText !== block.critiqueText.trim() ? { existingText: entry.existingCritiqueText! } : null;

    return {
      ...block,
      matchedEntryClassId: entry.entryClassId,
      confidence,
      conflict,
      resolution: null,
      include: true,
      hints,
    };
  });

  return { v: 1, blocks };
}
