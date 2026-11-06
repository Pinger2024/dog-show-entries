/**
 * Reads a judge's critique document against a show: parse (lib/critique-parse.ts)
 * then match (lib/critique-match.ts) over the show's results graph. THE one
 * path from text to reviewable blocks — the judge's upload route and the
 * secretary's "read the document again" both come through here, so a layout
 * Remi learns later is read the same way from the saved text as from a fresh
 * upload (Mandy, 30 Oct 2026: the North Eastern judge's numbered document
 * had already been uploaded, and published, before Remi could read it).
 */
import type { Database } from '@/server/db';
import { parseCritiqueDocument } from '@/lib/critique-parse';
import { matchCritiqueBlocks, type MatchedCritiqueDocument } from '@/lib/critique-match';
import { loadShowClassRows, toClassList, toResultsGraph } from './critique-results-graph';

export interface CritiqueReadCounts {
  total: number;
  critiques: number;
  exact: number;
  check: number;
  unmatched: number;
  hasOverview: boolean;
}

/** The numbers the judge sees after an upload ("50 critiques, 33 matched…"). */
export function critiqueReadCounts(matched: MatchedCritiqueDocument): CritiqueReadCounts {
  const critiqueBlocks = matched.blocks.filter((b) => b.kind === 'critique');
  return {
    total: matched.blocks.length,
    critiques: critiqueBlocks.length,
    exact: critiqueBlocks.filter((b) => b.confidence === 'exact').length,
    check: critiqueBlocks.filter((b) => b.confidence === 'check').length,
    unmatched:
      critiqueBlocks.filter((b) => b.confidence === 'unmatched').length +
      matched.blocks.filter((b) => b.kind === 'unmatched').length,
    hasOverview: matched.blocks.some((b) => b.kind === 'overview'),
  };
}

export async function readCritiqueDocument(
  db: Database,
  showId: string,
  rawText: string,
): Promise<{ matched: MatchedCritiqueDocument; counts: CritiqueReadCounts }> {
  const rows = await loadShowClassRows(db, showId);
  const parsed = parseCritiqueDocument(rawText, toClassList(rows));
  const matched = matchCritiqueBlocks(parsed, toResultsGraph(rows));
  return { matched, counts: critiqueReadCounts(matched) };
}
