/**
 * Publish gate for judge critique documents — pure, no DB imports. Shared by
 * the secretary UI (to explain what's blocking the Publish button) and the
 * `critiques.publish` tRPC procedure (to enforce it server-side; the UI gate
 * is a convenience, never the authority).
 *
 * See research/DESIGN-judge-critique-upload-2026-07-31.md — "no silent
 * overwrite" of a steward's on-the-day critique is a hard requirement, so
 * this combines two independent checks rather than the single AND the brief
 * shorthand suggested:
 *
 *   - match confidence: an included, non-overview block must be an exact
 *     match (or have been explicitly reassigned in review — a reassignment
 *     is stamped `confidence: 'exact'` by the caller, see critiques.ts).
 *   - conflict: an included block with a steward-vs-document conflict must
 *     have an explicit `resolution`, REGARDLESS of match confidence — an
 *     exact name match doesn't excuse silently overwriting what the steward
 *     already typed on the day.
 *
 * A block that fails either check blocks publishing. Excluded blocks
 * (`include: false`) and the overview block never block.
 */
import type { CritiqueParsedBlock } from '@/server/db/schema/critique-documents';

/**
 * The dogs that MORE THAN ONE included critique points at. Two critiques on
 * one dog means the last write would win silently at publish (a judge's
 * slip of the pen — "24." written twice, North Eastern 2026 — or a
 * reassignment in review that landed on a dog already taken), so both
 * block publishing until one is moved or left out.
 */
export function duplicateTargetIds(blocks: CritiqueParsedBlock[]): Set<string> {
  const seen = new Map<string, number>();
  for (const b of blocks) {
    if (!b.include || b.kind === 'overview' || !b.matchedEntryClassId) continue;
    seen.set(b.matchedEntryClassId, (seen.get(b.matchedEntryClassId) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id));
}

export function blockBlocksPublish(block: CritiqueParsedBlock, duplicates: Set<string> = new Set()): boolean {
  if (!block.include) return false;
  if (block.kind === 'overview') return false;
  if (block.confidence !== 'exact') return true;
  if (block.conflict && !block.resolution) return true;
  if (block.matchedEntryClassId && duplicates.has(block.matchedEntryClassId)) return true;
  return false;
}

export interface PublishGateStatus {
  canPublish: boolean;
  blockingCount: number;
  /** Index into the blocks array, for the UI to jump to / highlight. */
  blockingIndexes: number[];
}

export function publishGateStatus(blocks: CritiqueParsedBlock[]): PublishGateStatus {
  const duplicates = duplicateTargetIds(blocks);
  const blockingIndexes = blocks
    .map((b, i) => (blockBlocksPublish(b, duplicates) ? i : -1))
    .filter((i) => i !== -1);
  return {
    canPublish: blockingIndexes.length === 0,
    blockingCount: blockingIndexes.length,
    blockingIndexes,
  };
}
