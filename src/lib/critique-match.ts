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

export type ResultsGraphEntry = {
  entryClassId: string;
  placement: number;
  registeredName: string;
  /** Non-empty when a steward already typed a critique on the day. */
  existingCritiqueText: string | null;
};

export type ResultsGraphShowClass = {
  showClassId: string;
  className: string;
  sex: 'dog' | 'bitch';
  entries: ResultsGraphEntry[];
};

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
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(' ').filter(Boolean).sort().join(' ');
  const tb = nb.split(' ').filter(Boolean).sort().join(' ');
  return ta === tb;
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
        confidence: 'unmatched',
        conflict: null,
        resolution: null,
        include: true,
        hints,
      };
    }

    const showClass = block.matchedShowClassId ? showClassById.get(block.matchedShowClassId) : undefined;
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
