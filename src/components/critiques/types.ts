import type { RouterOutputs } from '@/server/trpc/router';

// getByToken (judge) and getForSecretary (secretary) share the exact same
// block/option shape — both go through critiques.ts's enrichBlocks() /
// toAssignableList(). Typed off getByToken so both pages' block cards use
// one type.
export type CritiqueDisplayBlock = RouterOutputs['critiques']['getByToken']['blocks'][number];
export type CritiqueAssignableOption = RouterOutputs['critiques']['getByToken']['assignableOptions'][number];

export const UNASSIGNED_VALUE = '__unassigned__';
